import type { ProductSearchCriteria, ProductSearchResult, SearchableProduct } from "./types.js";
import type { FacetMap } from "./facets.js";
import { filterLabel, filterMatches, preferenceContribution, resolveFacetValue } from "./facets.js";

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
const includesMaterial = (value: string | undefined, expected: string) => {
  const canonical = normalize(expected);
  if (["bial", "bialy", "biala", "biale"].includes(canonical)) return includes(value, "bial");
  if (["czarny", "czarna", "czarne"].includes(canonical)) return includes(value, "czarn");
  return includes(value, expected);
};
const isAvailable = (value: string) => ["in stock", "in_stock", "instock", "available"].includes(normalize(value));

export function searchProducts(products: SearchableProduct[], criteria: ProductSearchCriteria, options: {
  facets?: FacetMap;
  rankingWeights?: Record<string, number>;
} = {}): ProductSearchResult[] {
  const queryTokens = normalize(criteria.query ?? "").split(/\s+/).filter(Boolean);
  const limit = Math.min(Math.max(criteria.limit ?? 5, 1), 50);

  const matches=products.flatMap((product): ProductSearchResult[] => {
    const price = product.salePriceMinor ?? product.priceMinor;
    const width = sourced<number>(product.attributes, "widthCm");
    const availableWidths = sourced<number[]>(product.attributes, "availableWidthsCm") ?? [];
    const hoodType = sourced<string>(product.attributes, "hoodType");
    const material = sourced<string>(product.attributes, "material");
    const modes = sourced<string[]>(product.attributes, "operatingModes") ?? [];
    const efficiency = sourced<number>(product.attributes, "maxTurbineEfficiencyM3h");
    const levels = sourced<PerformanceLevel[]>(product.attributes, "performanceLevels") ?? [];
    const quietestNoise = levels.length ? Math.min(...levels.map((level) => level.noiseDb)) : undefined;
    const dynamicValues = Object.fromEntries(Object.entries(options.facets ?? {}).map(([id, facet]) => [id, resolveFacetValue(product, facet)]));

    if (criteria.priceMode !== "unbounded" && criteria.minPriceMinor !== undefined && price < criteria.minPriceMinor) return [];
    if (criteria.priceMode !== "unbounded" && criteria.maxPriceMinor !== undefined && price > criteria.maxPriceMinor) return [];
    if (criteria.widthCm !== undefined) {
      if (width !== undefined && width !== criteria.widthCm) return [];
      if (width === undefined && !availableWidths.includes(criteria.widthCm)) return [];
    }
    const acceptedHoodTypes = criteria.hoodTypeValues?.length ? criteria.hoodTypeValues : criteria.hoodType ? [criteria.hoodType] : [];
    if (acceptedHoodTypes.length && !acceptedHoodTypes.some((expected) => includes(hoodType, expected))) return [];
    if (criteria.material && !includesMaterial(material, criteria.material)) return [];
    if (criteria.operatingMode && !modes.some((mode) => includes(mode, criteria.operatingMode!))) return [];
    if (criteria.minEfficiencyM3h !== undefined && (efficiency === undefined || efficiency < criteria.minEfficiencyM3h)) return [];
    if (criteria.maxNoiseDb !== undefined && (quietestNoise === undefined || quietestNoise > criteria.maxNoiseDb)) return [];
    if (criteria.onlyAvailable && !isAvailable(product.availability)) return [];
    if (criteria.category && normalize(product.category ?? "") !== normalize(criteria.category)) return [];
    const requiredFilters = (criteria.filters ?? []).filter((filter) => filter.importance !== "preferred");
    if (!requiredFilters.every((filter) => {
      const facet = options.facets?.[filter.facetId];
      return facet ? filterMatches(dynamicValues[filter.facetId], filter, facet) : true;
    })) return [];

    const searchable = normalize([product.title, product.descriptionText, product.category, hoodType, material, ...modes].filter(Boolean).join(" "));
    if (queryTokens.length && !queryTokens.every((token) => searchable.includes(token))) return [];

    let score = product.dataQualityScore / 10;
    const reasons: string[] = [];
    const matchedAttributes: Record<string, string | number | boolean> = {};
    const matchReasons: ProductSearchResult["matchReasons"] = [];
    const mismatches: ProductSearchResult["mismatches"] = [];
    for (const token of queryTokens) score += normalize(product.title).includes(token) ? 4 : 1;
    if (criteria.widthCm !== undefined) { score += 10; reasons.push(`szerokość ${criteria.widthCm} cm`); matchedAttributes.widthCm = criteria.widthCm; }
    if (acceptedHoodTypes.length && hoodType) { score += 8; reasons.push(`typ: ${hoodType}`); matchedAttributes.hoodType = hoodType; }
    if (criteria.category && product.category) { score += 8; reasons.push(`kategoria: ${product.category}`); matchedAttributes.category = product.category; }
    if (criteria.material && material) { score += 7; reasons.push(`wykonanie: ${material}`); matchedAttributes.material = material; }
    if (criteria.operatingMode) { score += 6; reasons.push(`tryb pracy: ${criteria.operatingMode}`); matchedAttributes.operatingMode = criteria.operatingMode; }
    if (criteria.minEfficiencyM3h !== undefined && efficiency !== undefined) { score += 8; reasons.push(`wydajność do ${efficiency} m³/h`); matchedAttributes.efficiencyM3h = efficiency; }
    if (criteria.maxNoiseDb !== undefined && quietestNoise !== undefined) { score += 8; reasons.push(`od ${quietestNoise} dB`); matchedAttributes.quietestNoiseDb = quietestNoise; }
    if (isAvailable(product.availability)) score += 2;
    for (const filter of criteria.filters ?? []) {
      const facet = options.facets?.[filter.facetId]; if (!facet) continue;
      const matched = filterMatches(dynamicValues[filter.facetId], filter, facet);
      const contribution = matched ? (options.rankingWeights?.[filter.facetId] ?? 5) : 0;
      if (matched) {
        score += contribution;
        const message = filterLabel(filter, options.facets ?? {});
        reasons.push(message);
        matchReasons.push({ facetId: filter.facetId, label: facet.label, message, contribution });
        const raw = dynamicValues[filter.facetId];
        if (["string", "number", "boolean"].includes(typeof raw)) matchedAttributes[filter.facetId] = raw as string | number | boolean;
      } else if (filter.importance === "preferred") mismatches.push({ facetId: filter.facetId, message: `nie spełnia preferencji: ${filterLabel(filter, options.facets ?? {})}` });
    }
    for (const preference of criteria.preferences ?? []) {
      const facet = options.facets?.[preference.facetId]; if (!facet) continue;
      const contribution = preferenceContribution(dynamicValues[preference.facetId], preference);
      score += contribution;
      if (contribution !== 0) matchReasons.push({
        facetId: preference.facetId, label: facet.label,
        message: `${facet.label}: ${String(dynamicValues[preference.facetId])}${facet.unit ? ` ${facet.unit}` : ""}`,
        contribution,
      });
    }

    return [{ ...product, effectivePriceMinor: price, score, reasons: [...new Set(reasons)], matchedAttributes, matchReasons, mismatches }];
  }).sort((left, right) => criteria.sortBy === "price_desc"
    ? right.effectivePriceMinor - left.effectivePriceMinor || right.score - left.score || left.title.localeCompare(right.title, "pl")
    : criteria.sortBy === "price_asc"
      ? left.effectivePriceMinor - right.effectivePriceMinor || right.score - left.score || left.title.localeCompare(right.title, "pl")
      : criteria.sortBy === "price_nearest"&&criteria.targetPriceMinor!==undefined
        ? Math.abs(left.effectivePriceMinor-criteria.targetPriceMinor)-Math.abs(right.effectivePriceMinor-criteria.targetPriceMinor)||right.score-left.score||left.title.localeCompare(right.title,"pl")
      : right.score - left.score || left.effectivePriceMinor - right.effectivePriceMinor || left.title.localeCompare(right.title, "pl"))
  if(criteria.priceMode==="unbounded"&&!criteria.sortBy)return diversifiedPriceSample(matches,limit);
  return matches.slice(0,limit);
}

function diversifiedPriceSample(results:ProductSearchResult[],limit:number){
  if(results.length<=limit)return[...results].sort((a,b)=>a.effectivePriceMinor-b.effectivePriceMinor||b.score-a.score);
  const byPrice=[...results].sort((a,b)=>a.effectivePriceMinor-b.effectivePriceMinor||b.score-a.score),selected:ProductSearchResult[]=[];
  for(let index=0;index<limit;index++){const position=Math.round(index*(byPrice.length-1)/(limit-1));const candidate=byPrice[position];if(candidate&&!selected.some(item=>item.externalId===candidate.externalId))selected.push(candidate)}
  return selected;
}
