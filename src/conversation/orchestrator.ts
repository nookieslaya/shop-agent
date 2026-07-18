import { searchProducts } from "../search/product-search.js";
import type { ProductSearchCriteria, SearchableProduct } from "../search/types.js";
import { applySearchTaxonomy, type SearchTaxonomy } from "../search/taxonomy.js";
import { findSearchRelaxations, withoutFilter, type RelaxableFilter } from "../search/relaxation.js";
import { extractSearchCriteria } from "./intent.js";
import type { ConversationResponse, ConversationState, Suggestion } from "./types.js";
import { safeSuggestions } from "./suggestion-policy.js";
import type { StoreConfig } from "../config/store.js";

type GuidedSellingConfig = StoreConfig["guidedSelling"];

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
  guidedSelling?: GuidedSellingConfig;
  products: SearchableProduct[];
}): ConversationResponse {
  let criteria = merge(input.state?.criteria ?? {}, merge(extractSearchCriteria(input.message), input.extractedCriteria ?? {}));
  if (input.selection) criteria = applySelection(criteria, input.selection.key, input.selection.value);
  criteria = { ...criteria, onlyAvailable: true, limit: 5 };
  criteria = applySearchTaxonomy(criteria, input.taxonomy);
  const state: ConversationState = { criteria, intent: "product_search" };

  const guided = input.guidedSelling;
  if (criteria.widthCm === undefined) return question(guided?.widthQuestion ?? "Jakiej szerokości produktu potrzebujesz?", state,
    (guided?.widthChoices ?? [50, 60, 80, 90].map((value) => ({ label: `${value} cm`, value }))).map((item) => ({ label: item.label, key: "widthCm", value: item.value })), input.meta);
  if (criteria.maxPriceMinor === undefined) return question(guided?.budgetQuestion ?? "Jaki budżet chcesz przeznaczyć?", state,
    (guided?.budgetChoices ?? [{ label: "Do 1500 zł", valueMinor: 150_000 }, { label: "Do 2500 zł", valueMinor: 250_000 }, { label: "Do 4000 zł", valueMinor: 400_000 }, { label: "Bez limitu", valueMinor: 99_999_900 }]).map((item) => ({ label: item.label, key: "maxPriceMinor", value: item.valueMinor })), input.meta);
  if (criteria.maxNoiseDb === undefined && criteria.minEfficiencyM3h === undefined && !criteria.priorityResolved) return question(guided?.priorityQuestion ?? "Co jest dla Ciebie najważniejsze?", state,
    (guided?.priorityChoices ?? [{ label: "Cicha praca", value: "quiet" as const }, { label: "Wysoka wydajność", value: "efficient" as const }, { label: "Pokaż propozycje", value: "any" as const }]).map((item) => ({ label: item.label, key: "priority", value: item.value })), input.meta);

  const results = searchProducts(input.products, criteria);
  if (!results.length) {
    const relaxations = findSearchRelaxations(input.products, criteria);
    if (relaxations.length) return {
      message: "Nie znalazłem produktu spełniającego wszystkie warunki. Mogę pokazać najbliższe alternatywy po zmianie jednego wymagania.",
      state,
      suggestions: safeSuggestions(relaxations.map((relaxation) => ({ label: relaxation.label, key: "removeFilter", value: relaxation.filter }))),
      products: [],
      meta: { intentSource: input.meta?.intentSource ?? "deterministic", ...input.meta, conversationIntent: "product_search" },
    };
  }
  const suggestions: Suggestion[] = results.length === 1 && input.productActionsEnabled
    ? [{ label: "Pokaż podobne produkty", key: "similar", value: results[0]!.externalId }]
    : [];
  return {
    message: results.length ? `Znalazłem ${results.length} najlepiej dopasowanych produktów.` : "Nie znalazłem produktu spełniającego wszystkie warunki. Zmień jeden z filtrów.",
    state, suggestions: safeSuggestions(suggestions),
    products: results.map((result) => ({ externalId: result.externalId, title: result.title,
      price: result.effectivePriceMinor / 100, currency: result.currency, imageUrl: result.imageUrl,
      productUrl: result.productUrl, reasons: result.reasons })),
    meta: { intentSource: input.meta?.intentSource ?? "deterministic", ...input.meta, conversationIntent: "product_search" },
  };
}

function question(message: string, state: ConversationState, suggestions: Suggestion[], meta?: ConversationResponse["meta"]): ConversationResponse {
  return { message, state, suggestions: safeSuggestions(suggestions, 8), products: [], meta: { intentSource: meta?.intentSource ?? "deterministic", ...meta, conversationIntent: "product_search" } };
}
