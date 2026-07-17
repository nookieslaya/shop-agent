import type { ProductSearchCriteria } from "./types.js";

export interface SearchTaxonomy { hoodTypeAliases: Record<string, string[]> }

const normalize = (value: string) => value.toLocaleLowerCase("pl-PL").trim();

export function applySearchTaxonomy(criteria: ProductSearchCriteria, taxonomy?: SearchTaxonomy): ProductSearchCriteria {
  if (!criteria.hoodType || !taxonomy) return criteria;
  const aliases = taxonomy.hoodTypeAliases[normalize(criteria.hoodType)];
  return aliases ? { ...criteria, hoodTypeValues: aliases } : criteria;
}
