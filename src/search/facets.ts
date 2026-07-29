import type { StoreConfig } from "../config/store.js";
import type { FilterValue, ProductFilter, ProductPreference, SearchableProduct } from "./types.js";
import { normalizeTaxonomyText } from "./taxonomy.js";

export type FacetConfig = NonNullable<NonNullable<StoreConfig["searchTaxonomy"]>["facets"]>[string];
export type FacetMap = Record<string, FacetConfig>;

export function resolveFacetValue(product: SearchableProduct, facet: FacetConfig): unknown {
  const source = facet.source;
  if (source.type === "commercial") return source.key === "price"
    ? (product.salePriceMinor ?? product.priceMinor) / 100
    : product.availability;
  if (source.type === "title_regex") {
    const match = product.title.match(new RegExp(source.pattern, "i"));
    const extracted = match?.[source.group];
    return source.valueType === "number" && extracted ? Number(extracted.replace(",", ".")) : extracted;
  }
  const candidate = product.attributes[source.key];
  const value = unwrap(candidate);
  if (source.type === "attribute" || source.type === "attribute_raw") return value;
  if (!Array.isArray(value)) return undefined;
  const metrics = value.map((item) => item && typeof item === "object" ? Number((item as Record<string, unknown>)[source.property]) : NaN).filter(Number.isFinite);
  return metrics.length ? (source.operation === "min" ? Math.min(...metrics) : Math.max(...metrics)) : undefined;
}

export function canonicalFacetValue(value: string, facet: FacetConfig): string {
  const normalized = normalizeTaxonomyText(value);
  for (const [canonical, aliases] of Object.entries(facet.aliases)) {
    if ([canonical, ...aliases].some((alias) => containsPhrase(normalized, normalizeTaxonomyText(alias)))) return canonical;
  }
  return value.trim();
}

export function extractFacetFilters(message: string, facets: FacetMap): ProductFilter[] {
  const normalized = normalizeTaxonomyText(message);
  const filters: ProductFilter[] = [];
  for (const [facetId, facet] of Object.entries(facets)) {
    if (!facet.searchable || facetId === "price") continue;
    for (const [canonical, aliases] of Object.entries(facet.aliases)) {
      const matchedAlias = [canonical, ...aliases].find((alias) => containsPhrase(normalized, normalizeTaxonomyText(alias)));
      if (matchedAlias) {
        filters.push({
          facetId,
          operator: facet.type === "list" ? "contains" : "eq",
          value: canonical,
          importance: isPreferredMention(normalized, normalizeTaxonomyText(matchedAlias)) ? "preferred" : "required",
        });
        break;
      }
    }
  }
  return dedupeFilters(filters);
}

export function filterMatches(value: unknown, filter: ProductFilter, facet: FacetConfig): boolean {
  if (value === undefined || value === null) return false;
  const expected = Array.isArray(filter.value) ? filter.value : [filter.value];
  const values = Array.isArray(value) ? value : [value];
  if (filter.operator === "gte" || filter.operator === "lte") {
    const actual = Number(values[0]); const target = Number(expected[0]);
    return Number.isFinite(actual) && Number.isFinite(target) && (filter.operator === "gte" ? actual >= target : actual <= target);
  }
  return expected.some((item) => values.some((candidate) => {
    if (typeof item === "number" || typeof candidate === "number") return Number(candidate) === Number(item);
    const left = normalizeTaxonomyText(String(candidate));
    const right = normalizeTaxonomyText(canonicalFacetValue(String(item), facet));
    return filter.operator === "eq" ? left === right || left.includes(right) : left.includes(right);
  }));
}

export function preferenceContribution(value: unknown, preference: ProductPreference): number {
  const numeric = Number(Array.isArray(value) ? value[0] : value);
  if (preference.targetValue !== undefined) {
    return normalizeTaxonomyText(String(value)) === normalizeTaxonomyText(String(preference.targetValue)) ? preference.weight : 0;
  }
  if (!Number.isFinite(numeric)) return 0;
  return (preference.direction === "min" ? -numeric : numeric) * preference.weight / 1000;
}

export function upsertFilter(filters: ProductFilter[], next: ProductFilter): ProductFilter[] {
  return [...filters.filter((item) => !(item.facetId === next.facetId && item.operator === next.operator)), next];
}

export function mergeFilters(current: ProductFilter[] = [], next: ProductFilter[] = []): ProductFilter[] {
  return next.reduce(upsertFilter, current);
}

export function filterLabel(filter: ProductFilter, facets: FacetMap): string {
  const facet = facets[filter.facetId];
  const value = Array.isArray(filter.value) ? filter.value.join(", ") : String(filter.value);
  const operator = ({ eq: "", in: "", contains: "", gte: "od ", lte: "do " } as const)[filter.operator];
  return `${facet?.label ?? filter.facetId}: ${operator}${value}${facet?.unit ? ` ${facet.unit}` : ""}`;
}

const unwrap = (candidate: unknown): unknown => candidate && typeof candidate === "object" && "value" in candidate
  ? (candidate as { value: unknown }).value
  : candidate;
const containsPhrase = (value: string, phrase: string) => (` ${value} `).includes(` ${phrase} `);
const isPreferredMention = (value: string, phrase: string) => {
  const position = value.indexOf(phrase);
  if (position < 0) return false;
  const prefix = value.slice(Math.max(0, position - 32), position);
  return /(najlepiej|preferuje|mile widzian|jesli mozliwe)\s*$/.test(prefix);
};
const dedupeFilters = (filters: ProductFilter[]) => [...new Map(filters.map((filter) => [`${filter.facetId}:${filter.operator}`, filter])).values()];

export function normalizeFilterValue(value: FilterValue, facet: FacetConfig): FilterValue {
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? canonicalFacetValue(item, facet) : item) as FilterValue;
  return typeof value === "string" ? canonicalFacetValue(value, facet) : value;
}
