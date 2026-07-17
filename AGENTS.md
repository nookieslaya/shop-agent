# Repository instructions

## Product direction

Build a multi-tenant shopping assistant for medium-sized e-commerce stores. Nortberg is the first vertical, but store-specific extraction rules must remain behind adapters and configuration.

## Engineering rules

- Keep prices, availability, product IDs and URLs deterministic; never source them from an LLM response.
- Store attribute provenance and confidence.
- Prefer WooCommerce/API/feed data, then structured product-page data, then controlled AI enrichment.
- Keep product retrieval separate from store knowledge retrieval.
- Add tests for every new extractor and normalizer.
- Never commit secrets or API keys.

## Session handoff

At the end of every work session, update `docs/codex-workflow/session-handoff.md`, even when no code was changed. Include current branch, completed work, verification, open risks and the next concrete task.
