import type { ProductSearchCriteria, ProductSearchResult, SearchableProduct } from "./types.js";

interface SourcedValue<T> { value: T }
interface PerformanceLevel { level: number; noiseDb: number; efficiencyM3h: number }

const normalize = (value: string) => value.toLocaleLowerCase("pl-PL")
  .replace(/ł/g, "l")
  .normalize("NFKD")
  .replace(/\p{Diacritic}/gu, "")
  .trim();
const sourced = <T>(attributes: Record<string, unknown>, key: string): T | undefined => {
  const candidate = attributes[key] as Partial<SourcedValue<T>> | undefined;
  return candidate?.value;
};
const includes = (value: string | undefined, expected: string) => Boolean(value && normalize(value).includes(normalize(expected)));
const isAvailable = (value: string) => ["in stock", "in_stock", "instock", "available"].includes(normalize(value));

export function searchProducts(products: SearchableProduct[], criteria: ProductSearchCriteria): ProductSearchResult[] {
  const queryTokens = normalize(criteria.query ?? "").split(/\s+/).filter(Boolean);
  const limit = Math.min(Math.max(criteria.limit ?? 5, 1), 50);

  return products.flatMap((product): ProductSearchResult[] => {
    const price = product.salePriceMinor ?? product.priceMinor;
    const width = sourced<number>(product.attributes, "widthCm");
    const availableWidths = sourced<number[]>(product.attributes, "availableWidthsCm") ?? [];
    const hoodType = sourced<string>(product.attributes, "hoodType");
    const material = sourced<string>(product.attributes, "material");
    const modes = sourced<string[]>(product.attributes, "operatingModes") ?? [];
    const efficiency = sourced<number>(product.attributes, "maxTurbineEfficiencyM3h");
    const levels = sourced<PerformanceLevel[]>(product.attributes, "performanceLevels") ?? [];
    const quietestNoise = levels.length ? Math.min(...levels.map((level) => level.noiseDb)) : undefined;

    if (criteria.minPriceMinor !== undefined && price < criteria.minPriceMinor) return [];
    if (criteria.maxPriceMinor !== undefined && price > criteria.maxPriceMinor) return [];
    if (criteria.widthCm !== undefined) {
      if (width !== undefined && width !== criteria.widthCm) return [];
      if (width === undefined && !availableWidths.includes(criteria.widthCm)) return [];
    }
    const acceptedHoodTypes = criteria.hoodTypeValues?.length ? criteria.hoodTypeValues : criteria.hoodType ? [criteria.hoodType] : [];
    if (acceptedHoodTypes.length && !acceptedHoodTypes.some((expected) => includes(hoodType, expected))) return [];
    if (criteria.material && !includes(material, criteria.material)) return [];
    if (criteria.operatingMode && !modes.some((mode) => includes(mode, criteria.operatingMode!))) return [];
    if (criteria.minEfficiencyM3h !== undefined && (efficiency === undefined || efficiency < criteria.minEfficiencyM3h)) return [];
    if (criteria.maxNoiseDb !== undefined && (quietestNoise === undefined || quietestNoise > criteria.maxNoiseDb)) return [];
    if (criteria.onlyAvailable && !isAvailable(product.availability)) return [];

    const searchable = normalize([product.title, product.descriptionText, hoodType, material, ...modes].filter(Boolean).join(" "));
    if (queryTokens.length && !queryTokens.every((token) => searchable.includes(token))) return [];

    let score = product.dataQualityScore / 10;
    const reasons: string[] = [];
    const matchedAttributes: Record<string, string | number | boolean> = {};
    for (const token of queryTokens) score += normalize(product.title).includes(token) ? 4 : 1;
    if (criteria.widthCm !== undefined) { score += 10; reasons.push(`szerokość ${criteria.widthCm} cm`); matchedAttributes.widthCm = criteria.widthCm; }
    if (acceptedHoodTypes.length && hoodType) { score += 8; reasons.push(`typ: ${hoodType}`); matchedAttributes.hoodType = hoodType; }
    if (criteria.material && material) { score += 7; reasons.push(`wykonanie: ${material}`); matchedAttributes.material = material; }
    if (criteria.operatingMode) { score += 6; reasons.push(`tryb pracy: ${criteria.operatingMode}`); matchedAttributes.operatingMode = criteria.operatingMode; }
    if (criteria.minEfficiencyM3h !== undefined && efficiency !== undefined) { score += 8; reasons.push(`wydajność do ${efficiency} m³/h`); matchedAttributes.efficiencyM3h = efficiency; }
    if (criteria.maxNoiseDb !== undefined && quietestNoise !== undefined) { score += 8; reasons.push(`od ${quietestNoise} dB`); matchedAttributes.quietestNoiseDb = quietestNoise; }
    if (isAvailable(product.availability)) score += 2;

    return [{ ...product, effectivePriceMinor: price, score, reasons, matchedAttributes }];
  }).sort((left, right) => right.score - left.score
    || left.effectivePriceMinor - right.effectivePriceMinor
    || left.title.localeCompare(right.title, "pl"))
    .slice(0, limit);
}
