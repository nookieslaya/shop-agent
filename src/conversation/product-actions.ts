import type { StoreConfig } from "../config/store.js";
import { compareProducts, findSimilarProducts } from "../products/comparison.js";
import type { SearchableProduct } from "../search/types.js";
import type { ConversationProduct, ConversationResponse, ConversationState } from "./types.js";
import { safeSuggestions } from "./suggestion-policy.js";

type ComparisonConfig = NonNullable<StoreConfig["productComparison"]>;

export function buildComparisonConversationResponse(input: {
  products: SearchableProduct[]; productIds: string[]; config: ComparisonConfig; state?: ConversationState; locale?: string;
}): ConversationResponse {
  const selected = selectProducts(input.products, input.productIds);
  const comparison = compareProducts(selected, input.config, input.locale);
  const recommendation = comparisonRecommendation(comparison);
  const suggestions: ConversationResponse["suggestions"] = [];
  for (const product of selected.slice(0, 3)) {
    const cheaper = findSimilarProducts(product, input.products, input.config, { cheaperOnly: true, onlyAvailable: true, limit: 1 });
    if (cheaper.length) {
      suggestions.push({ label: `Pokaż tańsze podobne do ${product.title}`, key: "similarCheaper", value: product.externalId });
      continue;
    }
    const similar = findSimilarProducts(product, input.products, input.config, { onlyAvailable: true, limit: 1 });
    if (similar.length) suggestions.push({ label: `Pokaż podobne do ${product.title}`, key: "similar", value: product.externalId });
  }
  return {
    message: `Porównałem ${selected.length} wybrane produkty. ${recommendation}`,
    state: withProductContext(input.state, { comparedProductIds: selected.map(product => product.externalId), lastPresentedProductIds: selected.map(product => product.externalId), lastAction: "compare" }), suggestions: safeSuggestions(suggestions),
    products: selected.map(toConversationProduct), comparison,
    meta: { intentSource: "deterministic", productAction: "compare", conversationIntent: "product_action" },
  };
}

export function buildSimilarConversationResponse(input: {
  products: SearchableProduct[]; referenceId: string; config: ComparisonConfig; cheaperOnly?: boolean; state?: ConversationState; limit?: number;
}): ConversationResponse {
  const reference = input.products.find((product) => product.externalId === input.referenceId);
  if (!reference) throw new Error(`Product not found: ${input.referenceId}`);
  const results = findSimilarProducts(reference, input.products, input.config, { cheaperOnly: input.cheaperOnly ?? false, onlyAvailable: true, limit: input.limit ?? 5 });
  const qualifier = input.cheaperOnly ? "tańszych, podobnych" : "podobnych";
  return {
    message: results.length ? `Znalazłem ${results.length} ${qualifier} produktów.` : input.cheaperOnly ? "Nie znalazłem tańszego produktu o wystarczającym podobieństwie. Mogę pokazać podobne produkty bez limitu ceny." : `Nie znalazłem dostępnych ${qualifier} produktów.`,
    state: withProductContext(input.state, { lastPresentedProductIds: results.map(result => result.product.externalId), lastAction: "similar" }),
    suggestions: safeSuggestions(results.length ? results.map((result) => ({ label: `Porównaj z ${result.product.title}`, key: "compare" as const, value: `${reference.externalId},${result.product.externalId}` })) : input.cheaperOnly ? [{ label: "Pokaż podobne bez limitu ceny", key: "similar" as const, value: reference.externalId }] : []),
    products: results.map((result) => ({ ...toConversationProduct(result.product), similarityScore: result.similarityScore, similarityDiagnostics: result.diagnostics, reasons: result.reasons.map((reason) => `podobieństwo: ${reason}`) })),
    meta: { intentSource: "deterministic", productAction: "similar", conversationIntent: "product_action" },
  };
}

export function buildComparisonFollowUpResponse(input: {
  message: string; products: SearchableProduct[]; productIds: string[]; config: ComparisonConfig; state: ConversationState; locale?: string;
}): ConversationResponse {
  const selected = selectProducts(input.products, input.productIds);
  const comparison = compareProducts(selected, input.config, input.locale);
  const normalized = normalize(input.message);
  const fieldId = /tansz|cena|nizsz/.test(normalized) ? "price"
    : /cichsz|halas|glosn/.test(normalized) ? "noise"
      : /wydajniejsz|wydajnosc|pochlan/.test(normalized) ? "airflow"
        : undefined;
  const message = fieldId ? fieldAnswer(comparison, fieldId) : comparisonRecommendation(comparison);
  return {
    message,
    state: withProductContext(input.state, { comparedProductIds: selected.map(product => product.externalId), lastPresentedProductIds: selected.map(product => product.externalId), lastAction: "compare" }),
    suggestions: [], products: selected.map(toConversationProduct), comparison,
    meta: { intentSource: "deterministic", productAction: "comparison_follow_up", conversationIntent: "product_action" },
  };
}

function fieldAnswer(comparison: ReturnType<typeof compareProducts>, fieldId: string) {
  const field = comparison.fields.find(candidate => candidate.id === fieldId);
  if (!field || !field.bestProductIds.length) return `Nie mam wystarczających danych, aby rozstrzygnąć to na podstawie pola „${field?.label ?? fieldId}”.`;
  const winners = field.bestProductIds.map(id => comparison.products.find(product => product.externalId === id)!).filter(Boolean);
  const values = new Map(field.values.map(value => [value.externalId, value.display]));
  if (winners.length === comparison.products.length) return `Pod tym względem produkty wypadają tak samo: ${winners[0] ? values.get(winners[0].externalId) : "ta sama wartość"}.`;
  const winner = winners[0]!;
  const alternatives = comparison.products.filter(product => !field.bestProductIds.includes(product.externalId));
  return `${winner.title} wypada lepiej pod względem „${field.label}”: ${values.get(winner.externalId)}${alternatives.length === 1 ? ` wobec ${values.get(alternatives[0]!.externalId)} dla ${alternatives[0]!.title}` : ""}.`;
}

function comparisonRecommendation(comparison: ReturnType<typeof compareProducts>) {
  const scores = new Map(comparison.products.map(product => [product.externalId, 0]));
  for (const field of comparison.fields) {
    if (field.preference === "none" || field.bestProductIds.length === comparison.products.length) continue;
    const numeric = field.values.filter((value): value is typeof value & { value: number } => typeof value.value === "number");
    const scale = numeric.length > 1 ? Math.max(...numeric.map(value => Math.abs(value.value)), 1) : 1;
    const spread = numeric.length > 1 ? (Math.max(...numeric.map(value => value.value)) - Math.min(...numeric.map(value => value.value))) / scale : 1;
    for (const id of field.bestProductIds) scores.set(id, (scores.get(id) ?? 0) + Math.max(spread, 0.01) / field.bestProductIds.length);
  }
  const ranked = [...comparison.products].sort((a, b) => (scores.get(b.externalId) ?? 0) - (scores.get(a.externalId) ?? 0));
  const winner = ranked[0]!; const runnerUp = ranked[1];
  if (!runnerUp || (scores.get(winner.externalId) ?? 0) === (scores.get(runnerUp.externalId) ?? 0)) {
    return "Nie ma jednego bezwzględnie lepszego wyboru — kluczowe przewagi rozkładają się między modelami. Wskaż, czy ważniejsza jest cena, cisza czy wydajność.";
  }
  const advantages = comparison.fields.filter(field => field.bestProductIds.includes(winner.externalId) && field.bestProductIds.length < comparison.products.length).slice(0, 2);
  const details = advantages.map(field => `${field.label.toLocaleLowerCase("pl-PL")}: ${field.values.find(value => value.externalId === winner.externalId)?.display}`).join(" oraz ");
  const tradeoff = comparison.fields.find(field => runnerUp && field.bestProductIds.includes(runnerUp.externalId) && !field.bestProductIds.includes(winner.externalId));
  const tradeoffText = tradeoff && runnerUp ? ` ${runnerUp.title} ma jednak przewagę w polu „${tradeoff.label}” (${tradeoff.values.find(value => value.externalId === runnerUp.externalId)?.display}).` : "";
  return `Ogólnie wybrałbym ${winner.title}${details ? ` — przemawia za nim ${details}` : ""}.${tradeoffText}`;
}

function withProductContext(state: ConversationState | undefined, update: Partial<NonNullable<ConversationState["productContext"]>>): ConversationState {
  const base = state ?? { criteria: {} };
  const existing = base.productContext ?? { criteria: base.criteria };
  return { ...base, intent: "product_action", productContext: { ...existing, ...update } };
}

const normalize = (value: string) => value.toLocaleLowerCase("pl-PL").replace(/ł/g, "l").normalize("NFKD").replace(/\p{Diacritic}/gu, "");

function selectProducts(products: SearchableProduct[], ids: string[]): SearchableProduct[] {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length < 2 || uniqueIds.length > 3) throw new Error("Select two or three unique products");
  const selected = uniqueIds.map((id) => products.find((product) => product.externalId === id));
  const missing = uniqueIds.filter((_, index) => !selected[index]);
  if (missing.length) throw new Error(`Products not found: ${missing.join(", ")}`);
  return selected as SearchableProduct[];
}

function toConversationProduct(product: SearchableProduct): ConversationProduct {
  return {
    externalId: product.externalId, title: product.title,
    price: (product.salePriceMinor ?? product.priceMinor) / 100, currency: product.currency,
    imageUrl: product.imageUrl, productUrl: product.productUrl, reasons: [],
  };
}
