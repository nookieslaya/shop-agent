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

## Verification

- `npm run check`: passing.
- Live Nortberg feed: 365 products parsed.
- Live sample: 5 product pages scraped successfully.
- Sample pages exposed 21–24 technical rows each.
- All 5 sample products contained the current set of seven critical recommendation attributes.

## Important decisions

- Feed/API provides commercial catalog data.
- Product pages enrich technical attributes.
- Store documents and PDFs will be indexed separately as a knowledge base.
- Payments are intentionally outside the first MVP.
- The administration panel will initially be accessible only to the product owner.

## Next task

Add PostgreSQL schema and synchronization runs so imports can be incremental and preserve raw source data, normalized attributes, provenance and manual overrides.

## Open risks

- Technical labels may differ between product families and stores.
- Shared product pages can describe multiple variants; variant-specific values must not leak between variants.
- A full 365-page crawl has not been run yet. Keep concurrency low and add cache/change detection before doing so.
