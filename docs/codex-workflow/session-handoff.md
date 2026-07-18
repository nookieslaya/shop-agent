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
- Replaced `npm ci` with `npm install` in the local Linux tooling image because npm optional-dependency lock entries generated on Windows were not portable to Alpine.
- Added separate `knowledge_documents` and `knowledge_chunks` tables.
- Added incremental HTML/PDF knowledge ingestion driven by per-store configuration.
- Added deterministic text cleanup and chunking; unchanged documents are skipped using SHA-256 content hashes.
- Added `sync:knowledge` for the four configured Nortberg knowledge sources.
- Split feed synchronization from product-page enrichment.
- Added resumable `enrich:nortberg`; completed product pages are never fetched again by default.
- Added explicit `--force` and optional `--limit=N` controls for technical-data enrichment.
- Added persistent `pending`, `enriched` and `failed` product-page statuses with attempt timestamps and error details.
- HTTP 404/410 errors are terminal by default and no longer consume resources on every enrichment run.
- Added deterministic product search over commercial and technical filters.
- Added ranking based on explicit matches, data quality and availability, with machine-readable match reasons.
- Added `search:nortberg` CLI for validating real catalog queries before introducing an LLM.
- Added the first `/v1/chat` API with persistent client-side conversation state.
- Added deterministic Polish requirement extraction, follow-up questions and structured button suggestions.
- Connected completed criteria to the product search layer and product-card responses.
- Added OpenAI Responses API intent extraction with Structured Outputs and `gpt-5-nano` as the configurable default.
- Added deterministic fallback on missing credentials, timeout or API failure.
- Added per-response intent source, model and token usage metadata for future tenant billing limits.
- Added configurable per-store search taxonomy for customer-facing terms and catalog-specific values.
- Nortberg now maps built-in hoods to its `podszafkowy` and `teleskopowy` technical types.
- Added controlled single-filter relaxation with explicit user confirmation buttons.
- Width is treated as a non-relaxable installation constraint.
- Fixed the `Pokaż propozycje` button loop by persisting that the priority question was answered.
- Added deterministic retrieval over store knowledge chunks with Polish normalization and topic-aware ranking.
- Added `search:knowledge`, `/v1/knowledge/search`, and automatic routing of informational chat questions with source provenance.
- Knowledge answers now fail closed when no supporting document is found and do not consume OpenAI tokens.
- Topic detection prevents unrelated documents from being attached to warranty, guide, company or store-location answers.
- Warranty-extension questions explicitly disclose when the source confirms warranty terms but does not describe an extension procedure.
- Moved locale, stop words, topic aliases and evidence requirements out of the retrieval engine into per-store configuration.
- Knowledge topics are open strings rather than a fixed Nortberg-oriented enum, so other industries can add their own document taxonomy without core changes.
- Added versioned, database-backed store configuration with schema validation and bootstrap fallback.
- Added `sync:store-config` and authenticated admin GET/PUT endpoints; the admin API stays disabled without `ADMIN_API_KEY`.
- Product synchronization no longer overwrites settings changed administratively.
- Added a cross-industry configuration test using shoe sizes, materials and care topics.
- Added an owner-only admin panel served by Fastify at `/admin` with no separate frontend runtime.
- Added responsive overview metrics, store switching and structured editors for general settings, sources, topics, aliases, stop words and evidence rules.
- Added a validated advanced JSON editor, session-scoped API credentials and accessible light/dark themes based on CSS design tokens.
- Added authenticated store-list and overview endpoints for reusable administration clients.
- Added inline two-step confirmation for every delete and configuration save action; confirmations expire automatically without disruptive modal dialogs.
- Replaced the browser confirmation shown during store switching with a non-blocking panel message that preserves unsaved work.

## Verification

- `npm run check`: passing.
- Live Nortberg feed: 365 products parsed.
- Live sample: 5 product pages scraped successfully.
- Sample pages exposed 21–24 technical rows each.
- All 5 sample products contained the current set of seven critical recommendation attributes.
- `npm run check`: 2 test files and 5 tests passing after the database stage.
- `npm run check`: 3 test files and 7 tests passing after the knowledge stage.
- `npm run db:generate`: initial migration generated successfully with 6 tables.
- Knowledge migration generated successfully; schema now contains 8 tables.
- Live PDF verification: 44 pages, 92,512 extracted characters and 90 chunks.
- Live HTML verification: company 1,306 characters, warranty 740 characters, stores 16,748 characters.
- Docker integration was not executed in the Codex environment because Docker is unavailable there.

## Important decisions

- Feed/API provides commercial catalog data.
- Product pages enrich technical attributes.
- Store documents and PDFs will be indexed separately as a knowledge base.
- Payments are intentionally outside the first MVP.
- The administration panel will initially be accessible only to the product owner.

## Next task

Validate the owner panel with live Nortberg data, then add constrained answer synthesis and the iframe shopping widget.

## Open risks

- Technical labels may differ between product families and stores.
- Shared product pages can describe multiple variants; variant-specific values must not leak between variants.
- A full 365-page crawl has not been run yet. Keep concurrency low and add cache/change detection before doing so.
- The first sync stores all 365 feed rows but enriches only `SCRAPE_LIMIT` product pages; repeated runs progressively enrich the remaining products.
