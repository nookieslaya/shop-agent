# Session handoff

## Current state

- Branch: `feat/data-pipeline`
- Repository started from an empty GitHub repository.
- First milestone: product ingestion and technical-data enrichment.

## Completed

- Added Google Merchant XML importer.
- Added configurable Nortberg store adapter.
- Added product-page table scraper.
- Added hood attribute normalizer with source and confidence metadata.
- Added variant-aware width handling.
- Added performance curves for noise and efficiency by speed level.
- Added feed and enrichment quality reports.
- Added unit test for the Sento technical table.
- Added PostgreSQL 17 + pgvector Docker Compose configuration.
- Added Drizzle ORM schema and generated the initial SQL migration.
- Added stores, products, product sources, attribute provenance, manual overrides and sync-run tables.
- Added incremental feed change detection with a configurable product-page TTL.
- Added `sync:nortberg`, which stores all feed products and enriches a limited batch of product pages per run.
- Replaced the Windows-silent `drizzle-kit migrate` command with the Drizzle runtime migrator CLI.
- Mapped Docker PostgreSQL to host port 5433 to avoid collisions with an existing Windows PostgreSQL on 5432.
- Added a containerized Node tooling service; migrations and sync now connect through Docker DNS (`postgres:5432`) and do not depend on Windows host ports.
- Pinned npm 11.9.0 locally and in Docker so `npm ci` uses the same lockfile semantics on Windows and Alpine.

## Verification

- `npm run check`: passing.
- Live Nortberg feed: 365 products parsed.
- Live sample: 5 product pages scraped successfully.
- Sample pages exposed 21–24 technical rows each.
- All 5 sample products contained the current set of seven critical recommendation attributes.
- `npm run check`: 2 test files and 5 tests passing after the database stage.
- `npm run db:generate`: initial migration generated successfully with 6 tables.
- Docker integration was not executed in the Codex environment because Docker is unavailable there.

## Important decisions

- Feed/API provides commercial catalog data.
- Product pages enrich technical attributes.
- Store documents and PDFs will be indexed separately as a knowledge base.
- Payments are intentionally outside the first MVP.
- The administration panel will initially be accessible only to the product owner.

## Next task

Run the migration and `sync:nortberg` against local Docker PostgreSQL, inspect stored Nortberg data, then add knowledge-document ingestion for HTML and PDF sources.

## Open risks

- Technical labels may differ between product families and stores.
- Shared product pages can describe multiple variants; variant-specific values must not leak between variants.
- A full 365-page crawl has not been run yet. Keep concurrency low and add cache/change detection before doing so.
- The first sync stores all 365 feed rows but enriches only `SCRAPE_LIMIT` product pages; repeated runs progressively enrich the remaining products.
