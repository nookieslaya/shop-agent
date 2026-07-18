import { searchProducts } from "./product-search.js";
import type { ProductSearchCriteria, ProductSearchResult, SearchableProduct } from "./types.js";

export type RelaxableFilter = "maxNoiseDb" | "minEfficiencyM3h" | "material" | "minPriceMinor" | "maxPriceMinor" | "hoodType";
export interface SearchRelaxation {
  filter: RelaxableFilter;
  label: string;
  products: ProductSearchResult[];
}

const labels: Record<RelaxableFilter, string> = {
  maxNoiseDb: "Pokaż także głośniejsze",
  minEfficiencyM3h: "Pokaż także mniej wydajne",
  material: "Pokaż inne kolory i materiały",
  maxPriceMinor: "Pokaż także droższe",
  minPriceMinor: "Pokaż także tańsze",
  hoodType: "Pokaż inne typy montażu",
};

const order: RelaxableFilter[] = ["maxNoiseDb", "minEfficiencyM3h", "material", "minPriceMinor", "maxPriceMinor", "hoodType"];

export function withoutFilter(criteria: ProductSearchCriteria, filter: RelaxableFilter): ProductSearchCriteria {
  const copy = { ...criteria };
  delete copy[filter];
  if(filter==="minPriceMinor")copy.sortBy="price_desc";
  if(filter==="maxPriceMinor")copy.sortBy="price_asc";
  if (filter === "hoodType") delete copy.hoodTypeValues;
  return copy;
}

export function findSearchRelaxations(products: SearchableProduct[], criteria: ProductSearchCriteria): SearchRelaxation[] {
  return order.flatMap((filter): SearchRelaxation[] => {
    if (criteria[filter] === undefined) return [];
    const relaxed = { ...withoutFilter(criteria, filter), limit: 3 };
    const matches = searchProducts(products, relaxed);
    return matches.length ? [{ filter, label: labels[filter], products: matches }] : [];
  });
}
