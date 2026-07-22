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
  if (key === "widthCm" && typeof value === "number") return { ...criteria, widthCm: value, catalogWide: false };
  if (key === "maxPriceMinor" && typeof value === "number") {
    const next = { ...criteria }; delete next.minPriceMinor;delete next.targetPriceMinor;delete next.relativePrice;if(next.sortBy==="price_nearest")delete next.sortBy;
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
  const deterministic = extractSearchCriteria(input.message, input.taxonomy);
  const aiCriteria = { ...(input.extractedCriteria ?? {}) };
  if (deterministic.catalogView) for (const key of Object.keys(aiCriteria) as Array<keyof ProductSearchCriteria>) delete aiCriteria[key];
  if (!deterministic.sortBy) delete aiCriteria.sortBy;
  if (deterministic.limit === undefined) delete aiCriteria.limit;
  const deterministicHasPrice = deterministic.minPriceMinor !== undefined || deterministic.maxPriceMinor !== undefined || deterministic.targetPriceMinor!==undefined || deterministic.priceMode !== undefined;
  if (deterministicHasPrice) { delete aiCriteria.minPriceMinor; delete aiCriteria.maxPriceMinor; delete aiCriteria.targetPriceMinor;delete aiCriteria.priceMode; delete aiCriteria.budgetResolved; }
  if ((deterministic.sortBy || deterministic.limit) && !/(?:cm|zł|pln|powyżej|powyzej|poweyżej|poweyzej|minimum|co najmniej|\bdo\s*\d)/i.test(input.message)) {
    delete aiCriteria.minPriceMinor; delete aiCriteria.maxPriceMinor; delete aiCriteria.widthCm; delete aiCriteria.priceMode; delete aiCriteria.budgetResolved;
  }
  const nextCriteria = merge(aiCriteria, deterministic);
  const resumableCriteria=input.state?.intent==="product_search"||input.state?.intent==="product_action"?input.state.criteria:input.state?.productContext?.criteria??input.state?.criteria??{};
  const currentCriteria = deterministic.catalogWide ? {} : { ...resumableCriteria };
  if (nextCriteria.minPriceMinor !== undefined || nextCriteria.maxPriceMinor !== undefined || nextCriteria.targetPriceMinor!==undefined||nextCriteria.priceMode !== undefined) {
    delete currentCriteria.minPriceMinor; delete currentCriteria.maxPriceMinor;delete currentCriteria.targetPriceMinor;
  }
  if (currentCriteria.maxPriceMinor !== undefined && currentCriteria.maxPriceMinor >= 99_999_900) {
    delete currentCriteria.maxPriceMinor; currentCriteria.priceMode = "unbounded"; currentCriteria.budgetResolved = true;
  }
  let criteria = merge(currentCriteria, nextCriteria);
  const relativePriceRequest=criteria.relativePrice;
  const previousRange=input.state?.productContext?.resultPriceRange;
  if(criteria.relativePrice==="higher"&&previousRange){delete criteria.maxPriceMinor;delete criteria.targetPriceMinor;criteria.minPriceMinor=previousRange.maxPriceMinor+1;criteria.priceMode="bounded";criteria.budgetResolved=true;criteria.sortBy="price_asc";}
  if(criteria.relativePrice==="lower"&&previousRange){delete criteria.minPriceMinor;delete criteria.targetPriceMinor;criteria.maxPriceMinor=Math.max(0,previousRange.minPriceMinor-1);criteria.priceMode="bounded";criteria.budgetResolved=true;criteria.sortBy="price_desc";}
  delete criteria.relativePrice;
  if (input.selection) criteria = applySelection(criteria, input.selection.key, input.selection.value);
  criteria = { ...criteria, onlyAvailable: true, limit: criteria.limit ?? 5 };
  criteria = applySearchTaxonomy(criteria, input.taxonomy);
  const state: ConversationState = { criteria, intent: "product_search",...(input.state?.productContext?{productContext:input.state.productContext}:{}) };

  if (criteria.catalogView === "categories") {
    const categories = [...new Set(input.products.map((product) => product.category).filter((category): category is string => Boolean(category)))]
      .sort((left, right) => left.localeCompare(right, "pl-PL"));
    return {
      message: categories.length ? `Dostępne kategorie okapów: ${categories.join(", ")}.` : "Katalog nie zawiera jeszcze nazwanych kategorii okapów.",
      state,
      suggestions: safeSuggestions(categories.map((category) => ({ label: category, key: "message", value: `Pokaż ${category.toLocaleLowerCase("pl-PL")}` })), 8),
      products: [],
      meta: { intentSource: input.meta?.intentSource ?? "deterministic", ...input.meta, conversationIntent: "product_search" },
    };
  }

  const guided = input.guidedSelling;
  if (!criteria.catalogWide && criteria.widthCm === undefined) return question(guided?.widthQuestion ?? "Jakiej szerokości produktu potrzebujesz?", state,
    (guided?.widthChoices ?? [50, 60, 80, 90].map((value) => ({ label: `${value} cm`, value }))).map((item) => ({ label: item.label, key: "widthCm", value: item.value })), input.meta);
  if (!criteria.catalogWide && !criteria.budgetResolved && criteria.minPriceMinor === undefined && criteria.maxPriceMinor === undefined) return question(guided?.budgetQuestion ?? "Jaki budżet chcesz przeznaczyć?", state,
    (guided?.budgetChoices ?? [{ label: "Do 1500 zł", valueMinor: 150_000 }, { label: "Do 2500 zł", valueMinor: 250_000 }, { label: "Do 4000 zł", valueMinor: 400_000 }, { label: "Bez limitu", valueMinor: 99_999_900 }]).map((item) => ({ label: item.label, key: "maxPriceMinor", value: item.valueMinor })), input.meta);
  if (!criteria.catalogWide && criteria.maxNoiseDb === undefined && criteria.minEfficiencyM3h === undefined && !criteria.priorityResolved) return question(guided?.priorityQuestion ?? "Co jest dla Ciebie najważniejsze?", state,
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
  if(results.length)state.productContext={
    criteria:{...criteria},
    resultPriceRange:{minPriceMinor:Math.min(...results.map(result=>result.effectivePriceMinor)),maxPriceMinor:Math.max(...results.map(result=>result.effectivePriceMinor))},
    lastPresentedProductIds:results.map(result=>result.externalId),
    lastAction:"search",
  };
  return {
    message: results.length ? criteria.category ? categorySummary(results.length, criteria.category) : criteria.catalogView === "products" ? catalogSummary(results.length) : relativePriceRequest?relativePriceSummary(results.length,relativePriceRequest):criteria.sortBy === "price_desc" ? resultSummary(results.length, "najdroższe") : criteria.sortBy === "price_asc" ? resultSummary(results.length, "najtańsze") : criteria.sortBy==="price_nearest"&&criteria.targetPriceMinor!==undefined?`Znalazłem ${results.length} produktów cenowo najbliższych kwocie ${Math.round(criteria.targetPriceMinor/100).toLocaleString("pl-PL")} zł.`:criteria.priceMode==="unbounded"?`Znalazłem ${results.length} pasujących produktów z różnych półek cenowych.`:`Znalazłem ${results.length} najlepiej dopasowanych produktów.` : "Nie znalazłem produktu spełniającego wszystkie warunki. Zmień jeden z filtrów.",
    state, suggestions: safeSuggestions(suggestions),
    products: results.map((result) => ({ externalId: result.externalId, title: result.title,
      price: result.effectivePriceMinor / 100, currency: result.currency, imageUrl: result.imageUrl,
      productUrl: result.productUrl, reasons: result.reasons })),
    meta: { intentSource: input.meta?.intentSource ?? "deterministic", ...input.meta, conversationIntent: "product_search" },
  };
}

function relativePriceSummary(count:number,direction:"higher"|"lower"){if(count===1)return`Znalazłem 1 najbliższy ${direction==="higher"?"droższy":"tańszy"} produkt.`;const few=count%10>=2&&count%10<=4&&!(count%100>=12&&count%100<=14);return few?`Znalazłem ${count} najbliższe ${direction==="higher"?"droższe":"tańsze"} produkty.`:`Znalazłem ${count} najbliższych ${direction==="higher"?"droższych":"tańszych"} produktów.`}

function catalogSummary(count: number) { return count === 1 ? "Oto 1 produkt z katalogu." : `Oto ${count} produktów z katalogu.`; }
function categorySummary(count: number, category: string) { return count === 1 ? `Znalazłem 1 produkt w kategorii ${category}.` : `Znalazłem ${count} produktów w kategorii ${category}.`; }

function resultSummary(count: number, ordering: "najdroższe" | "najtańsze") {
  if(count===1)return`Znalazłem 1 ${ordering === "najdroższe" ? "najdroższy" : "najtańszy"} pasujący produkt.`;
  const few=count%10>=2&&count%10<=4&&!(count%100>=12&&count%100<=14);
  return few?`Znalazłem ${count} ${ordering} pasujące produkty.`:`Znalazłem ${count} ${ordering === "najdroższe" ? "najdroższych" : "najtańszych"} pasujących produktów.`;
}

function question(message: string, state: ConversationState, suggestions: Suggestion[], meta?: ConversationResponse["meta"]): ConversationResponse {
  return { message, state, suggestions: safeSuggestions(suggestions, 8), products: [], meta: { intentSource: meta?.intentSource ?? "deterministic", ...meta, conversationIntent: "product_search" } };
}
