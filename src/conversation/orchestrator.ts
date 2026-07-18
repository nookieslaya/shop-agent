import { searchProducts } from "../search/product-search.js";
import type { ProductSearchCriteria, SearchableProduct } from "../search/types.js";
import { applySearchTaxonomy, type SearchTaxonomy } from "../search/taxonomy.js";
import { findSearchRelaxations, withoutFilter, type RelaxableFilter } from "../search/relaxation.js";
import { extractSearchCriteria } from "./intent.js";
import type { ConversationResponse, ConversationState, Suggestion } from "./types.js";

const merge = (current: ProductSearchCriteria, next: ProductSearchCriteria): ProductSearchCriteria => ({ ...current, ...next });

export function applySelection(criteria: ProductSearchCriteria, key: string, value: string | number): ProductSearchCriteria {
  if (key === "widthCm" && typeof value === "number") return { ...criteria, widthCm: value };
  if (key === "maxPriceMinor" && typeof value === "number") return { ...criteria, maxPriceMinor: value };
  if (key === "priority" && value === "quiet") return { ...criteria, maxNoiseDb: 45, priorityResolved: true };
  if (key === "priority" && value === "efficient") return { ...criteria, minEfficiencyM3h: 700, priorityResolved: true };
  if (key === "priority" && value === "any") return { ...criteria, priorityResolved: true };
  if (key === "removeFilter" && typeof value === "string") {
    const relaxed = withoutFilter(criteria, value as RelaxableFilter);
    return value === "maxNoiseDb" || value === "minEfficiencyM3h" ? { ...relaxed, priorityResolved: true } : relaxed;
  }
  return criteria;
}

export function buildConversationResponse(input: {
  message: string;
  state?: ConversationState;
  selection?: { key: string; value: string | number };
  extractedCriteria?: ProductSearchCriteria;
  meta?: ConversationResponse["meta"];
  taxonomy?: SearchTaxonomy;
  productActionsEnabled?: boolean;
  products: SearchableProduct[];
}): ConversationResponse {
  let criteria = merge(input.state?.criteria ?? {}, merge(extractSearchCriteria(input.message), input.extractedCriteria ?? {}));
  if (input.selection) criteria = applySelection(criteria, input.selection.key, input.selection.value);
  criteria = { ...criteria, onlyAvailable: true, limit: 5 };
  criteria = applySearchTaxonomy(criteria, input.taxonomy);
  const state = { criteria };

  if (criteria.widthCm === undefined) return question("Jakiej szerokości okapu potrzebujesz?", state, [
    { label: "50 cm", key: "widthCm", value: 50 }, { label: "60 cm", key: "widthCm", value: 60 },
    { label: "80 cm", key: "widthCm", value: 80 }, { label: "90 cm", key: "widthCm", value: 90 },
  ], input.meta);
  if (criteria.maxPriceMinor === undefined) return question("Jaki budżet chcesz przeznaczyć na okap?", state, [
    { label: "Do 1500 zł", key: "maxPriceMinor", value: 150_000 }, { label: "Do 2500 zł", key: "maxPriceMinor", value: 250_000 },
    { label: "Do 4000 zł", key: "maxPriceMinor", value: 400_000 }, { label: "Bez limitu", key: "maxPriceMinor", value: 99_999_900 },
  ], input.meta);
  if (criteria.maxNoiseDb === undefined && criteria.minEfficiencyM3h === undefined && !criteria.priorityResolved) return question("Co jest dla Ciebie najważniejsze?", state, [
    { label: "Cicha praca", key: "priority", value: "quiet" }, { label: "Wysoka wydajność", key: "priority", value: "efficient" },
    { label: "Pokaż propozycje", key: "priority", value: "any" },
  ], input.meta);

  const results = searchProducts(input.products, criteria);
  if (!results.length) {
    const relaxations = findSearchRelaxations(input.products, criteria);
    if (relaxations.length) return {
      message: "Nie znalazłem produktu spełniającego wszystkie warunki. Mogę pokazać najbliższe alternatywy po zmianie jednego wymagania.",
      state,
      suggestions: relaxations.map((relaxation) => ({ label: relaxation.label, key: "removeFilter", value: relaxation.filter })),
      products: [],
      ...(input.meta ? { meta: input.meta } : {}),
    };
  }
  const suggestions: Suggestion[] = results.length === 1 && input.productActionsEnabled
    ? [{ label: "Pokaż podobne produkty", key: "similar", value: results[0]!.externalId }]
    : [];
  return {
    message: results.length ? `Znalazłem ${results.length} najlepiej dopasowanych produktów.` : "Nie znalazłem produktu spełniającego wszystkie warunki. Zmień jeden z filtrów.",
    state, suggestions,
    products: results.map((result) => ({ externalId: result.externalId, title: result.title,
      price: result.effectivePriceMinor / 100, currency: result.currency, imageUrl: result.imageUrl,
      productUrl: result.productUrl, reasons: result.reasons })),
    ...(input.meta ? { meta: input.meta } : {}),
  };
}

function question(message: string, state: ConversationState, suggestions: Suggestion[], meta?: ConversationResponse["meta"]): ConversationResponse {
  return { message, state, suggestions, products: [], ...(meta ? { meta } : {}) };
}
