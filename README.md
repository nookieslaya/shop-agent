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

Synchronizacja produktów nie nadpisuje późniejszych zmian administracyjnych. Zabezpieczone endpointy administratora są wyłączone, dopóki `ADMIN_PASSWORD` nie zostanie przekazane do procesu API. Nagłówek `x-admin-api-key` pozostaje zgodnym wstecznie rozwiązaniem dla automatyzacji, ale panel korzysta z logowania hasłem i podpisanej sesji.

### Panel właściciela

Po uruchomieniu API panel jest dostępny pod adresem `http://localhost:3000/admin`. Zawiera pulpit jakości danych, wybór sklepu oraz formularze źródeł wiedzy, tematów, aliasów, słów pomijanych i reguł wymaganych dowodów. Dostępny jest także kontrolowany tryb edycji całej konfiguracji JSON.

W lokalnym `.env` ustaw stałe `ADMIN_PASSWORD` oraz inne, długie `ADMIN_SESSION_SECRET`. Panel nie zapisuje hasła w przeglądarce; po poprawnym logowaniu otrzymuje podpisane ciasteczko `HttpOnly` ważne przez 7 dni. Jasny i ciemny motyw korzystają ze wspólnych zmiennych CSS znajdujących się na początku `admin/styles.css`; zmiana kolorystyki nie wymaga modyfikowania komponentów.

Operacje zapisu i usuwania mają dwustopniowe potwierdzenie bez okien modalnych. Pierwsze kliknięcie zmienia etykietę przycisku na potwierdzenie, drugie wykonuje operację, a brak reakcji automatycznie anuluje ją po 4,5 sekundy.

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

### Odpowiedzi oparte na źródłach

Pytania informacyjne najpierw przechodzą przez deterministyczne wyszukiwanie dokumentów i reguły wymaganych dowodów. Jeśli dowody są wystarczające, model redaguje krótką odpowiedź i musi wskazać identyfikatory wykorzystanych źródeł. Nieznane cytowanie, timeout albo błąd API powoduje automatyczny powrót do odpowiedzi deterministycznej.

```text
OPENAI_ANSWER_MODEL=gpt-5-nano
```

Model nie otrzymuje katalogu handlowego i nie jest źródłem cen, dostępności ani parametrów produktów. Odpowiedź API zawiera `meta.answerSource`, osobny model oraz liczbę tokenów wejściowych i wyjściowych. Sugestie dalszych pytań mają typ `message`, dzięki czemu widget może wysłać je ponownie bez interpretowania tekstu.

Każdy sklep może ustawić `answerGeneration.enabled: false`, aby korzystać wyłącznie z bezpłatnego fallbacku deterministycznego, oraz wybrać kontrolowany styl `concise`, `friendly` albo `expert`. Model pozostaje ustawieniem środowiska, a nie wartością podawaną przez klienta widgetu.

Oba ustawienia są dostępne w panelu właściciela w sekcji **Ustawienia sklepu**.

## Porównywanie i podobne produkty

Porównanie jest w pełni deterministyczne i konfigurowane osobno dla każdego sklepu. Definicja pola wskazuje źródło wartości, format, jednostkę oraz to, czy niższa lub wyższa wartość jest korzystniejsza. Brakujące dane są zwracane jako `Brak danych` i nigdy nie są uzupełniane przez model.

```powershell
$body = @{ storeId = "nortberg"; productIds = @("519.1191", "588.1292") } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/v1/products/compare" -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 15
```

Podobne lub wyłącznie tańsze alternatywy korzystają z ważonego rankingu pól skonfigurowanych dla sklepu. Pole może być obowiązkowe, posiadać minimalny poziom dopasowania oraz karę za konflikt. Można także ustawić minimalny wynik całej rekomendacji:

```powershell
$body = @{ storeId = "nortberg"; productId = "519.1191"; cheaperOnly = $true; limit = 5 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/v1/products/similar" -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 12
```

Te same operacje są dostępne w `/v1/chat` przez pole `action` oraz przyciski `compare`, `similar` i `similarCheaper`. Każda karta podobnego produktu zawiera diagnostykę: wartości wejściowe, podobieństwo pola, wagę, wkład punktowy, karę i status. Konfigurację źródeł, pól krytycznych, progów, kar i wag można edytować osobno dla sklepu w sekcji **Porównywanie**. Źródłem może być także surowa wartość atrybutu lub fragment nazwy wariantu wyodrębniony konfigurowalnym wyrażeniem regularnym.

### Sugerowana konfiguracja nowego sklepu

Sekcja **Sugerowane pola** analizuje aktualnie zaimportowany katalog bez założeń dotyczących branży. Raport pokazuje pokrycie atrybutu, typ, liczbę różnych wartości i przykłady. Stałe wartości oraz tekstowe identyfikatory unikalne dla niemal każdego produktu są pomijane. System proponuje format, wagę i ostrożne reguły podobieństwa, lecz nigdy nie zapisuje ich automatycznie. Administrator wybiera propozycje, dodaje je do roboczej konfiguracji i zatwierdza zwykłym, dwuetapowym przyciskiem zapisu.

## Widget iframe

Produkcyjny widget zakupowy jest dostępny pod `/widget?storeId=STORE_ID`. Pobiera wyłącznie publiczną konfigurację wyglądu sklepu, a rozmowę prowadzi przez istniejące `/v1/chat`. Obsługuje szybkie rozpoczęcia, pytania doprecyzowujące, przewijane karty produktów, wybór 2–3 produktów, porównanie parametrów, podobne i tańsze alternatywy, źródła odpowiedzi, loading, ponawianie błędów oraz jasny i ciemny motyw.

Przykład osadzenia:

```html
<iframe
  src="https://twoja-domena.pl/widget?storeId=nortberg"
  title="Asystent zakupowy"
  width="420"
  height="720"
  loading="lazy"
  style="border:0;border-radius:22px;max-width:100%;"
></iframe>
```

Rekomendowany wariant produkcyjny wymaga tylko jednego tagu i sam tworzy pływający przycisk oraz iframe w izolowanym Shadow DOM:

```html
<script
  src="https://twoja-domena.pl/embed/shop-agent.js"
  data-store-id="nortberg"
  data-position="right"
  data-label="Zapytaj asystenta"
  data-color="#2563eb"
></script>
```

Na telefonie rozmowa otwiera się na pełnym ekranie. Na komputerze panel ma maksymalnie 420 × 720 px. Skrypt obsługuje `Escape`, zarządzanie fokusem, reduced motion, bezpieczne wyznaczanie domeny iframe na podstawie własnego `src` i opcjonalną pozycję `left`. W panelu administratora gotowy kod można skopiować jednym przyciskiem.

Nazwa, status, wiadomość powitalna, placeholder, kolor główny, motyw, podpis i maksymalnie sześć skrótów rozmowy są ustawieniami danego sklepu i można je zmienić w panelu w sekcji **Widget sklepu**. Publiczny endpoint konfiguracji nie zwraca feedu, źródeł administracyjnych ani sekretów.

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
