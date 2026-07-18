import type { StoreConfig } from "../config/store.js";
import { compareProducts, findSimilarProducts } from "../products/comparison.js";
import type { SearchableProduct } from "../search/types.js";
import type { ConversationProduct, ConversationResponse, ConversationState } from "./types.js";

type ComparisonConfig = NonNullable<StoreConfig["productComparison"]>;

export function buildComparisonConversationResponse(input: {
  products: SearchableProduct[]; productIds: string[]; config: ComparisonConfig; state?: ConversationState; locale?: string;
}): ConversationResponse {
  const selected = selectProducts(input.products, input.productIds);
  const comparison = compareProducts(selected, input.config, input.locale);
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
    message: `Porównałem ${selected.length} wybrane produkty. Najlepsze wartości w poszczególnych polach są oznaczone w danych porównania.`,
    state: input.state ?? { criteria: {} }, suggestions,
    products: selected.map(toConversationProduct), comparison,
    meta: { intentSource: "deterministic", productAction: "compare" },
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
    state: input.state ?? { criteria: {} },
    suggestions: results.length ? results.slice(0, 3).map((result) => ({ label: `Porównaj z ${result.product.title}`, key: "compare" as const, value: `${reference.externalId},${result.product.externalId}` })) : input.cheaperOnly ? [{ label: "Pokaż podobne bez limitu ceny", key: "similar" as const, value: reference.externalId }] : [],
    products: results.map((result) => ({ ...toConversationProduct(result.product), similarityScore: result.similarityScore, similarityDiagnostics: result.diagnostics, reasons: result.reasons.map((reason) => `podobieństwo: ${reason}`) })),
    meta: { intentSource: "deterministic", productAction: "similar" },
  };
}

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
