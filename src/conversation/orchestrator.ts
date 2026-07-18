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
  if (key === "maxPriceMinor" && typeof value === "number") {
    const next = { ...criteria }; delete next.minPriceMinor;
    if (value >= 99_999_900) { delete next.maxPriceMinor; return { ...next, priceMode: "unbounded", budgetResolved: true }; }
    return { ...next, maxPriceMinor: value, priceMode: "bounded", budgetResolved: true };
  }
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
  const deterministic = extractSearchCriteria(input.message);
  const aiCriteria = { ...(input.extractedCriteria ?? {}) };
  const deterministicHasPrice = deterministic.minPriceMinor !== undefined || deterministic.maxPriceMinor !== undefined || deterministic.priceMode !== undefined;
  if (deterministicHasPrice) { delete aiCriteria.minPriceMinor; delete aiCriteria.maxPriceMinor; delete aiCriteria.priceMode; delete aiCriteria.budgetResolved; }
  if ((deterministic.sortBy || deterministic.limit) && !/(?:cm|zł|pln|powyżej|powyzej|poweyżej|poweyzej|minimum|co najmniej|\bdo\s*\d)/i.test(input.message)) {
    delete aiCriteria.minPriceMinor; delete aiCriteria.maxPriceMinor; delete aiCriteria.widthCm; delete aiCriteria.priceMode; delete aiCriteria.budgetResolved;
  }
  const nextCriteria = merge(aiCriteria, deterministic);
  const currentCriteria = { ...(input.state?.criteria ?? {}) };
  if (nextCriteria.minPriceMinor !== undefined || nextCriteria.maxPriceMinor !== undefined || nextCriteria.priceMode !== undefined) {
    delete currentCriteria.minPriceMinor; delete currentCriteria.maxPriceMinor;
  }
  if (currentCriteria.maxPriceMinor !== undefined && currentCriteria.maxPriceMinor >= 99_999_900) {
    delete currentCriteria.maxPriceMinor; currentCriteria.priceMode = "unbounded"; currentCriteria.budgetResolved = true;
  }
  let criteria = merge(currentCriteria, nextCriteria);
  if (input.selection) criteria = applySelection(criteria, input.selection.key, input.selection.value);
  criteria = { ...criteria, onlyAvailable: true, limit: criteria.limit ?? 5 };
  criteria = applySearchTaxonomy(criteria, input.taxonomy);
  const state: ConversationState = { criteria, intent: "product_search" };

  const guided = input.guidedSelling;
  if (criteria.widthCm === undefined) return question(guided?.widthQuestion ?? "Jakiej szerokości produktu potrzebujesz?", state,
    (guided?.widthChoices ?? [50, 60, 80, 90].map((value) => ({ label: `${value} cm`, value }))).map((item) => ({ label: item.label, key: "widthCm", value: item.value })), input.meta);
  if (!criteria.budgetResolved && criteria.minPriceMinor === undefined && criteria.maxPriceMinor === undefined) return question(guided?.budgetQuestion ?? "Jaki budżet chcesz przeznaczyć?", state,
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
    message: results.length ? criteria.sortBy === "price_desc" ? `Znalazłem ${results.length} najdroższych pasujących produktów.` : criteria.sortBy === "price_asc" ? `Znalazłem ${results.length} najtańszych pasujących produktów.` : `Znalazłem ${results.length} najlepiej dopasowanych produktów.` : "Nie znalazłem produktu spełniającego wszystkie warunki. Zmień jeden z filtrów.",
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
