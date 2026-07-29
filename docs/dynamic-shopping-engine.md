# Dynamic shopping engine

The shopping engine is store-agnostic. Store configuration defines what catalog attributes mean; deterministic backend code owns product filtering, prices, availability and ranking.

## Configuration contract

- `searchTaxonomy.facets` maps stable facet IDs to product data sources, types, units and editable value aliases.
- `preferenceRules` maps customer language such as “quiet” or “long battery life” to a facet and ranking direction.
- `guidedSelling.steps` uses the same facet IDs as free-text extraction. A click and a typed answer therefore update the same conversation state.
- `questionPolicy` decides when a missing facet is critical enough to ask about.
- `searchPolicy` controls availability, limits, weights and relaxation order.

Legacy `widthCm`, `material`, `hoodType`, `quiet`, `efficient` and `any` fields remain supported during migration. New stores should use facets and preference rules.

## Request flow

1. Deterministic and OpenAI extractors return explicit dynamic filters and preferences.
2. New values are merged into conversation state by `facetId`; a new value replaces the previous value for that facet/operator.
3. The backend resolves facet sources against catalog data and applies required filters.
4. Ranking emits deterministic `matchReasons`.
5. The question policy asks at most the configured number of critical questions when results are still broad.
6. OpenAI receives only selected products, exact prices and deterministic reasons, then writes the natural presentation. On failure the deterministic summary is returned.

## Adding a store

Use the admin “Kreator zakupowy” view to edit facets, preference rules, guided steps and policies. The catalog analyzer endpoint also returns `facets` suggestions based on detected attribute coverage. Review suggestions before saving; no catalog-derived configuration is activated automatically.

## Production deployment

`ops/production/deploy.sh` updates the currently checked-out branch. To deploy this release:

```bash
cd ~/shop-agent
git fetch origin developv2
git switch developv2
git pull --ff-only origin developv2
COMPOSE_PARALLEL_LIMIT=1 sh ops/production/deploy.sh
```

Rollback is the same operation after switching back to `develop`.
