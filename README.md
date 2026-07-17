# Shop Agent

Uniwersalny asystent zakupowy dla średnich sklepów internetowych. Projekt zaczyna się od warstwy danych: importu katalogu, wzbogacania produktów danymi technicznymi i raportowania jakości.

## Aktualny zakres

- import Google Merchant XML,
- konfiguracja wielu sklepów przez adaptery,
- pobieranie tabel technicznych z kart produktów,
- normalizacja atrybutów okapów,
- rozróżnienie danych wspólnych i wariantowych,
- raport kompletności danych,
- import stron informacyjnych i poradników PDF do osobnej bazy wiedzy,
- baza pod późniejszą integrację WooCommerce.

## Uruchomienie

```bash
npm install
npm run db:generate
npm run db:migrate
npm run check
npm run audit:nortberg
```

Domyślnie audyt pobiera cały feed, ale odwiedza tylko 5 pierwszych kart produktów. Parametry można zmienić:

```bash
SCRAPE_LIMIT=20 SCRAPE_CONCURRENCY=2 npm run audit:nortberg
```

Raport zostanie zapisany w `reports/nortberg-audit.json`.

## PostgreSQL

```bash
cp .env.example .env
docker compose up -d
docker compose run --rm app npm run db:migrate
docker compose run --rm app npm run sync:nortberg
docker compose run --rm app npm run enrich:nortberg
docker compose run --rm app npm run sync:knowledge
```

PowerShell:

```powershell
Copy-Item .env.example .env
docker compose up -d
docker compose run --rm app npm run db:migrate
docker compose run --rm app npm run sync:nortberg
docker compose run --rm app npm run enrich:nortberg
docker compose run --rm app npm run sync:knowledge
```

`sync:nortberg` synchronizuje dane handlowe z feedu i pomija rekordy bez zmian. Nie pobiera kart produktów.

`enrich:nortberg` pobiera dane techniczne tylko dla produktów, które nie zostały wcześniej wzbogacone. Domyślnie przetwarza wszystkie oczekujące produkty, a po przerwaniu można bezpiecznie uruchomić go ponownie. Do testu małej partii użyj:

```powershell
docker compose run --rm app npm run enrich:nortberg -- --limit=10
```

Pełne, świadome ponowienie pobierania wszystkich kart:

```powershell
docker compose run --rm app npm run enrich:nortberg -- --force
```

Zmiana ceny lub dostępności w feedzie nie powoduje ponownego pobierania danych technicznych.

Komendy bazodanowe są celowo uruchamiane w kontenerze `app`. Łączy się on z `postgres:5432` wewnątrz sieci Docker, dzięki czemu lokalna instalacja PostgreSQL na Windows nie powoduje konfliktów.

`sync:knowledge` pobiera źródła HTML/PDF z konfiguracji sklepu, czyści treść i zapisuje krótkie fragmenty w `knowledge_chunks`. Ponowne uruchomienie pomija dokumenty, których treść się nie zmieniła.

Wyszukiwanie w dokumentach działa deterministycznie, nie zużywa tokenów OpenAI i zawsze zwraca adres źródła:

```powershell
docker compose run --rm app npm run search:knowledge -- --query="jak przedłużyć gwarancję?" --limit=5
```

Pytania informacyjne wysłane do `/v1/chat` (np. o gwarancję, montaż, filtry lub salony) są automatycznie kierowane do bazy wiedzy. Jeśli dokumenty nie zawierają odpowiedzi, API informuje o braku wiarygodnego źródła zamiast tworzyć odpowiedź.

Silnik nie zawiera nazw branż ani tematów konkretnego sklepu. Locale, słowa pomijane, aliasy tematów oraz reguły wymaganej treści źródłowej znajdują się w `knowledgeRetrieval` konfiguracji danego sklepu. Tematy dokumentów są dowolnymi identyfikatorami tekstowymi, więc kolejny sklep może używać np. `sizes`, `ingredients` lub `compatibility` bez zmiany rdzenia.

### Konfiguracja sklepu w bazie

Konfiguracja używana przez API jest przechowywana w `stores.configuration` i walidowana wersjonowanym schematem. Pierwszą konfigurację Nortberga zapisz poleceniem:

```powershell
docker compose run --rm app npm run sync:store-config -- --store=nortberg
```

Synchronizacja produktów nie nadpisuje późniejszych zmian administracyjnych. Zabezpieczone endpointy `GET` i `PUT /v1/admin/stores/:storeId/config` są wyłączone, dopóki `ADMIN_API_KEY` nie zostanie przekazany do procesu API. Klucz należy przesyłać w nagłówku `x-admin-api-key`; nie jest on częścią konfiguracji sklepu ani odpowiedzi API i nie jest zapisywany w repozytorium.

Kontrola danych po synchronizacji:

```powershell
docker compose exec postgres psql -U shop_agent -d shop_agent -c "SELECT topic, title, length(content) AS characters FROM knowledge_documents ORDER BY topic;"
docker compose exec postgres psql -U shop_agent -d shop_agent -c "SELECT COUNT(*) AS chunks FROM knowledge_chunks;"
docker compose exec postgres psql -U shop_agent -d shop_agent -c "SELECT COUNT(*) FILTER (WHERE product_page_checked_at IS NOT NULL) AS enriched, COUNT(*) FILTER (WHERE product_page_checked_at IS NULL) AS pending FROM products WHERE is_active;"
```

Karty zwracające trwały błąd HTTP `404` lub `410` otrzymują status `failed` i nie są automatycznie ponawiane. Inne błędy pozostają w `pending`, aby następne uruchomienie mogło spróbować ponownie. Statusy i przyczyny można sprawdzić poleceniem:

```powershell
docker compose exec postgres psql -U shop_agent -d shop_agent -c "SELECT product_page_status, COUNT(*) FROM products WHERE is_active GROUP BY product_page_status ORDER BY product_page_status;"
docker compose exec postgres psql -U shop_agent -d shop_agent -c "SELECT external_id, title, product_page_error FROM products WHERE product_page_status = 'failed';"
```

## Architektura źródeł

1. API WooCommerce lub feed produktowy.
2. Dane strukturalne strony produktu.
3. Tabele techniczne.
4. Opis produktu.
5. Kontrolowana ekstrakcja AI dla brakujących pól.
6. Ręczne nadpisania w panelu administratora.

Produkt zachowuje źródło i poziom pewności każdego atrybutu. Model językowy nie będzie źródłem ceny, dostępności ani identyfikatora produktu.

## Wyszukiwanie produktów

Deterministyczną wyszukiwarkę Nortberg można sprawdzić bez udziału modelu językowego:

```powershell
docker compose run --rm app npm run search:nortberg -- --width=60 --material=czarne --max-price=3000 --min-efficiency=700 --max-noise=45 --limit=5
```

Dostępne filtry: `query`, `min-price`, `max-price`, `width`, `type`, `material`, `mode`, `min-efficiency`, `max-noise` i `limit`. Domyślnie wyniki obejmują tylko dostępne produkty; flaga `--include-unavailable` wyłącza ten warunek. Każdy wynik zawiera wynik punktowy, dopasowane parametry i deterministyczne powody rekomendacji.

## API rozmowy

Uruchom API w pierwszym terminalu:

```powershell
docker compose run --rm -p 3000:3000 app npm run dev:api
```

Test w drugim terminalu:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/v1/chat -ContentType "application/json" -Body '{"storeId":"nortberg","message":"Szukam cichego czarnego okapu 60 cm do 3000 zł"}' | ConvertTo-Json -Depth 8
```

Odpowiedź zawiera `message`, aktualny `state`, sugestie przycisków i karty produktów. Klient odsyła wybraną sugestię jako `selection`, dzięki czemu logika interfejsu nie musi interpretować tekstu przycisku.

### Rozpoznawanie intencji przez OpenAI

Dodaj klucz wyłącznie do lokalnego `.env` (plik jest ignorowany przez Git):

```text
OPENAI_API_KEY=sk-...
OPENAI_INTENT_MODEL=gpt-5-nano
```

Po zmianie zmiennych przebuduj lub odtwórz kontener API. Model używa Structured Outputs wyłącznie do ekstrakcji kryteriów; nie otrzymuje katalogu i nie wybiera produktów. W razie timeoutu lub błędu API automatycznie używa parsera deterministycznego. Pole `meta` odpowiedzi pokazuje źródło intencji, model i zużycie tokenów.

Model można zmienić bez modyfikacji kodu, np. na `gpt-5.4-mini`, ale najpierw należy porównać jakość i koszt na tym samym zestawie pytań.

### Taksonomia sklepu

Nazwy używane przez klienta są mapowane na wartości konkretnego sklepu w `searchTaxonomy`. Przykładowo Nortberg interpretuje „do zabudowy” jako `podszafkowy` lub `teleskopowy`. Silnik wyszukiwania pozostaje uniwersalny, a kolejny sklep może mieć własne aliasy bez zmian w kodzie wyszukiwarki.

### Kontrolowane luzowanie filtrów

Jeśli pełny zestaw kryteriów nie daje wyników, system osobno sprawdza usunięcie hałasu, wydajności, materiału, budżetu lub typu. Nie zmienia żadnego wymagania automatycznie: zwraca przyciski `removeFilter`, a wyszukiwanie alternatyw następuje dopiero po decyzji użytkownika. Szerokość nigdy nie jest luzowana, ponieważ wpływa na możliwość montażu.

## Następne kroki

- adapter WooCommerce,
- wyszukiwarka hybrydowa,
- API rozmowy i sugestii,
- widget iframe,
- panel administratora dostępny tylko dla właściciela systemu.
