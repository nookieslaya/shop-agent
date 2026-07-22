import type { ProductSearchCriteria } from "./types.js";

export interface SearchTaxonomy {
  hoodTypeAliases: Record<string, string[]>;
  categoryAliases?: Record<string, string[]>;
  spellingCorrections?: Record<string, string>;
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
  return aliases ? { ...criteria, hoodTypeValues: aliases } : criteria;
}

const containsPhrase = (value: string, phrase: string) => (` ${value} `).includes(` ${phrase} `);
