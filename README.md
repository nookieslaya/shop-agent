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
docker compose run --rm app npm run sync:knowledge
```

PowerShell:

```powershell
Copy-Item .env.example .env
docker compose up -d
docker compose run --rm app npm run db:migrate
docker compose run --rm app npm run sync:nortberg
docker compose run --rm app npm run sync:knowledge
```

Synchronizacja zapisuje cały feed, ale domyślnie odświeża maksymalnie 5 kart produktów. Kolejne uruchomienia pomijają niezmienione produkty, a strony techniczne odświeżają po upływie TTL.

Komendy bazodanowe są celowo uruchamiane w kontenerze `app`. Łączy się on z `postgres:5432` wewnątrz sieci Docker, dzięki czemu lokalna instalacja PostgreSQL na Windows nie powoduje konfliktów.

`sync:knowledge` pobiera źródła HTML/PDF z konfiguracji sklepu, czyści treść i zapisuje krótkie fragmenty w `knowledge_chunks`. Ponowne uruchomienie pomija dokumenty, których treść się nie zmieniła.

Kontrola danych po synchronizacji:

```powershell
docker compose exec postgres psql -U shop_agent -d shop_agent -c "SELECT topic, title, length(content) AS characters FROM knowledge_documents ORDER BY topic;"
docker compose exec postgres psql -U shop_agent -d shop_agent -c "SELECT COUNT(*) AS chunks FROM knowledge_chunks;"
```

## Architektura źródeł

1. API WooCommerce lub feed produktowy.
2. Dane strukturalne strony produktu.
3. Tabele techniczne.
4. Opis produktu.
5. Kontrolowana ekstrakcja AI dla brakujących pól.
6. Ręczne nadpisania w panelu administratora.

Produkt zachowuje źródło i poziom pewności każdego atrybutu. Model językowy nie będzie źródłem ceny, dostępności ani identyfikatora produktu.

## Następne kroki

- adapter WooCommerce,
- wyszukiwarka hybrydowa,
- API rozmowy i sugestii,
- widget iframe,
- panel administratora dostępny tylko dla właściciela systemu.
