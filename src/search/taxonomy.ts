import type { ProductSearchCriteria } from "./types.js";

export interface SearchTaxonomy {
  hoodTypeAliases: Record<string, string[]>;
  categoryAliases?: Record<string, string[]>;
  spellingCorrections?: Record<string, string>;
  facets?: import("./facets.js").FacetMap;
}

export const normalizeTaxonomyText = (value: string) => value.toLocaleLowerCase("pl-PL")
  .replaceAll("ł", "l")
  .normalize("NFKD")
  .replace(/\p{Diacritic}/gu, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

export function normalizeCustomerText(value: string, taxonomy?: SearchTaxonomy): string {
  const corrections = Object.fromEntries(Object.entries(taxonomy?.spellingCorrections ?? {})
    .map(([wrong, corrected]) => [normalizeTaxonomyText(wrong), normalizeTaxonomyText(corrected)]));
  return normalizeTaxonomyText(value).split(/\s+/).filter(Boolean).map((word) => corrections[word] ?? word).join(" ");
}

export function resolveProductCategory(value: string, taxonomy?: SearchTaxonomy): string | undefined {
  const normalized = normalizeCustomerText(value, taxonomy);
  return Object.entries(taxonomy?.categoryAliases ?? {}).find(([, aliases]) => aliases
    .some((alias) => containsPhrase(normalized, normalizeTaxonomyText(alias))))?.[0];
}

export function applySearchTaxonomy(criteria: ProductSearchCriteria, taxonomy?: SearchTaxonomy): ProductSearchCriteria {
  if (!taxonomy) return criteria;
  const aliases = criteria.hoodType ? taxonomy.hoodTypeAliases[normalizeTaxonomyText(criteria.hoodType)] : undefined;
  const filters = (criteria.filters ?? []).map((filter) => {
    const facet = taxonomy.facets?.[filter.facetId];
    return facet ? { ...filter, value: importFacetValue(filter.value, facet) } : filter;
  });
  return { ...criteria, ...(aliases ? { hoodTypeValues: aliases } : {}), ...(filters.length ? { filters } : {}) };
}

const containsPhrase = (value: string, phrase: string) => (` ${value} `).includes(` ${phrase} `);
const importFacetValue = (value: import("./types.js").FilterValue, facet: import("./facets.js").FacetConfig) => {
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? canonical(item, facet) : item);
  return typeof value === "string" ? canonical(value, facet) : value;
};
const canonical = (value: string, facet: import("./facets.js").FacetConfig) => {
  const normalized = normalizeTaxonomyText(value);
  return Object.entries(facet.aliases).find(([key, aliases]) => [key, ...aliases]
    .some((alias) => containsPhrase(normalized, normalizeTaxonomyText(alias))))?.[0] ?? value;
};
