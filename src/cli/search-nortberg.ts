import { createDatabase } from "../db/client.js";
import { SearchRepository } from "../db/search-repository.js";
import { searchProducts } from "../search/product-search.js";
import type { ProductSearchCriteria } from "../search/types.js";
import { applySearchTaxonomy } from "../search/taxonomy.js";
import { nortbergConfig } from "../config/store.js";
import { findSearchRelaxations } from "../search/relaxation.js";

const value = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const number = (name: string) => { const raw = value(name); return raw === undefined ? undefined : Number(raw); };

async function main() {
  const criteria: ProductSearchCriteria = { onlyAvailable: !process.argv.includes("--include-unavailable") };
  const query = value("query"); if (query) criteria.query = query;
  const minPrice = number("min-price"); if (minPrice !== undefined) criteria.minPriceMinor = minPrice * 100;
  const maxPrice = number("max-price"); if (maxPrice !== undefined) criteria.maxPriceMinor = maxPrice * 100;
  const width = number("width"); if (width !== undefined) criteria.widthCm = width;
  const hoodType = value("type"); if (hoodType) criteria.hoodType = hoodType;
  const material = value("material"); if (material) criteria.material = material;
  const mode = value("mode"); if (mode) criteria.operatingMode = mode;
  const efficiency = number("min-efficiency"); if (efficiency !== undefined) criteria.minEfficiencyM3h = efficiency;
  const noise = number("max-noise"); if (noise !== undefined) criteria.maxNoiseDb = noise;
  const limit = number("limit"); if (limit !== undefined) criteria.limit = limit;
  const { db, close } = createDatabase();
  try {
    const products = await new SearchRepository(db).activeProducts("nortberg");
    const resolvedCriteria = applySearchTaxonomy(criteria, nortbergConfig.searchTaxonomy);
    const rawResults = searchProducts(products, resolvedCriteria);
    const results = rawResults.map((result) => ({
      externalId: result.externalId,
      title: result.title,
      price: result.effectivePriceMinor / 100,
      currency: result.currency,
      score: Number(result.score.toFixed(2)),
      reasons: result.reasons,
      matchedAttributes: result.matchedAttributes,
      productUrl: result.productUrl,
    }));
    const relaxations = rawResults.length ? [] : findSearchRelaxations(products, resolvedCriteria).map((item) => ({
      filter: item.filter, label: item.label, productCount: item.products.length,
    }));
    console.log(JSON.stringify({ criteria: resolvedCriteria, totalCatalogProducts: products.length, results, relaxations }, null, 2));
  } finally {
    await close();
  }
}

await main();
