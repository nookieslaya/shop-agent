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
- Added grounded OpenAI answer synthesis after deterministic knowledge retrieval and evidence-rule validation.
- The model receives only labelled evidence, must return valid source IDs and cannot select products or originate commercial facts.
- Invalid citations, API failures and timeouts fall back to deterministic excerpts; insufficient-evidence rules bypass OpenAI entirely.
- Added separate answer-generation model and token telemetry plus clickable `message` follow-up suggestions.
- Added per-store answer-generation enable/disable control and a constrained tone enum for predictable cost and prompting.
- Exposed grounded-answer enablement and tone in the owner panel without exposing model or API-key controls to store configuration.
- Added a universal, configuration-driven product comparison engine for two or three products.
- Added deterministic best-value markers, explicit missing values and locale-aware formatting without LLM involvement.
- Added weighted similar-product and cheaper-alternative ranking with configurable fields per store.
- Added `/v1/products/compare`, `/v1/products/similar` and equivalent structured `/v1/chat` actions with follow-up buttons.
- Added a responsive owner-panel editor for comparison fields, sources, formats, units, preferences and similarity weights.
- Added accessible contextual tooltips and expandable, example-driven instructions to every administration section.
- Added a universal catalog configuration analyzer that profiles attribute coverage, types, distinctness and examples.
- Added safe field suggestions that omit constants and near-unique text identifiers and never activate without administrator approval.
- Added the **Sugerowane pola** panel workflow: analyze, review, select, add to the draft configuration and confirm the normal save action.
- Added configurable critical fields, minimum per-field similarity, mismatch penalties and a global similarity threshold.
- Added per-result similarity diagnostics with source values, field status, weight, contribution and penalty.
- Added `title_regex` comparison sources so variant-specific values can override misleading shared product-page attributes without another crawl.
- Nortberg width similarity now uses the concrete variant title and rejects mismatched widths; material conflicts receive an explicit penalty.
- Split real maximum airflow from declared turbine capacity and changed noise comparison to the highest operating level.
- Warranty comparison now preserves the source wording such as `24 + 6*` rather than presenting a conditional extension as unconditional months.
- Replaced browser API-key handling with password login and a signed seven-day `HttpOnly` session cookie; header authentication remains available for automation.
- Exposed similarity rules, source regexes and thresholds in the per-store administration panel.
- Added a production-oriented iframe shopping widget served at `/widget?storeId=...` with responsive light/dark UI.
- Added conversational suggestions, loading and retry states, horizontal product cards, product selection, comparisons and knowledge-source links.
- Added per-store widget branding and copy configuration plus a structured editor and live-preview link in the owner panel.
- Added a public allowlisted widget-config response that does not expose admin credentials or full store configuration.
- Added CSP, safe external URL handling, reduced-motion support and mobile full-screen layout.
- Added the self-contained `/embed/shop-agent.js` production launcher with Shadow DOM isolation, floating CTA and lazy iframe creation.
- Added keyboard Escape, focus management, load state, configurable side/label/color and same-origin iframe derivation from the script URL.
- Added a per-store installation snippet generator and copy action in the owner panel.
- Fixed the single-result dead end: configured stores now offer a deterministic **Pokaż podobne produkty** action.
- The widget hides an unusable comparison checkbox for a lone result and keeps that product selected when loading alternatives.
- Cheaper-product actions are now availability-aware; when no cheaper match exists, the assistant offers similar products without a price ceiling.
- Added compact per-store conversation history with stable UUIDs, lazy-loaded message details and collapsed request/response JSON.
- Conversation persistence masks e-mail addresses and phone numbers and is never automatically added to OpenAI context.
- Added admin filters for no-result, fallback, comparison, similar-product and OpenAI conversations.
- Added `inspect:conversation` for a small report by latest conversation or exact ID; `--details` is opt-in.
- Added a universal conversation router with `product_search`, `knowledge`, `product_action`, `contact_support` and `unknown` intents.
- Topic changes now clear incompatible product criteria instead of inheriting the previous search state.
- OpenAI no longer generates follow-up buttons; per-topic suggestions are deterministic, deduplicated and limited to two.
- Added per-store admin controls for product/contact vocabulary, routing responses and topic follow-up suggestions.
- Added history flags for unknown and contact/support turns so routing failures are easy to filter.
- Added evidence requirements to per-topic follow-up suggestions and configurable minimum evidence counts to knowledge rules.
- Added conservative Polish inflection matching for topic aliases, including `reklamacja` / `reklamację`.
- Knowledge insufficiency is now flagged separately from product `no_results`.
- The widget consumes old suggestion groups as soon as the customer sends or selects the next turn.
- Questions asking for support contact are routed to knowledge before generic contact-request handling.
- Follow-up suggestions equivalent to the question just answered are suppressed to prevent conversational loops.
- The grounded-answer prompt explicitly forbids adding unstated start dates, conditions, exceptions or required documents.
- Added a per-store conversation quality lab with editable regression scenarios and persisted run results.
- Scenarios can be created from a user message in conversation history and replayed through the real `/v1/chat` route.
- The evaluator checks intent, required/forbidden phrases, evidence topics, products, suggestion limits and insufficient-evidence state.
- The admin API client only sends the JSON content type when a request has a body, so bodyless quality-scenario runs are accepted by Fastify.
- Guided product questions may show up to eight concrete choices; the two-item limit remains in force for conversational follow-up suggestions.
- Guided-selling questions and choices are configured per store, can be suggested from active catalog widths and price distribution, and are editable in the admin panel.
- Admin help tooltips use the shared accessible light/dark visual treatment introduced with the guided-selling panel.

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

Validate routing transitions, configured topic suggestions and history flags against the local Docker database, then use selected conversation reports to improve intent vocabulary iteratively.

## Open risks

- Technical labels may differ between product families and stores.
- Shared product pages can describe multiple variants; variant-specific values must not leak between variants.
- A full 365-page crawl has not been run yet. Keep concurrency low and add cache/change detection before doing so.
- The first sync stores all 365 feed rows but enriches only `SCRAPE_LIMIT` product pages; repeated runs progressively enrich the remaining products.
