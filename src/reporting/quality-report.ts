import type { EnrichedProduct, FeedProduct, HoodAttributes } from "../domain/product.js";

const importantAttributes: Array<keyof HoodAttributes> = [
  "hoodType", "widthCm", "operatingModes", "controlType", "maxTurbineEfficiencyM3h", "speedLevels", "performanceLevels"
];

export function qualityScore(attributes: HoodAttributes): number {
  const present = importantAttributes.filter((key) => attributes[key] !== undefined).length;
  return Math.round((present / importantAttributes.length) * 100);
}

export function buildFeedSummary(products: FeedProduct[]) {
  const count = (predicate: (product: FeedProduct) => boolean) => products.filter(predicate).length;
  const categoryEntries: Array<[string, number]> = [...new Set(products.map((product) => product.category ?? "unknown"))]
    .map((category) => [category, products.filter((product) => (product.category ?? "unknown") === category).length]);
  categoryEntries.sort((a, b) => b[1] - a[1]);
  const categoryCounts = Object.fromEntries(categoryEntries);

  return {
    productCount: products.length,
    categoryCounts,
    feedCoverage: {
      brand: count((p) => Boolean(p.brand)),
      gtin: count((p) => Boolean(p.gtin)),
      size: count((p) => Boolean(p.size)),
      energyClass: count((p) => Boolean(p.energyClass)),
      salePrice: count((p) => p.salePrice !== undefined),
    },
  };
}

export function buildEnrichmentSummary(products: EnrichedProduct[]) {
  const attributeCoverage = Object.fromEntries(
    importantAttributes.map((attribute) => [attribute, products.filter((product) => product.attributes[attribute] !== undefined).length]),
  );
  return {
    scrapedProductCount: products.length,
    averageQualityScore: products.length ? Math.round(products.reduce((sum, p) => sum + p.dataQualityScore, 0) / products.length) : 0,
    attributeCoverage,
    products: products.map((product) => ({
      id: product.feed.externalId,
      title: product.feed.title,
      url: product.feed.productUrl,
      technicalRows: product.technicalRows.length,
      qualityScore: product.dataQualityScore,
      warnings: product.warnings,
      attributes: product.attributes,
    })),
  };
}
