import { describe, expect, it } from "vitest";
import type { StoreConfig } from "../src/config/store.js";
import { buildComparisonConversationResponse, buildSimilarConversationResponse } from "../src/conversation/product-actions.js";
import { compareProducts, findSimilarProducts } from "../src/products/comparison.js";
import type { SearchableProduct } from "../src/search/types.js";

const config: NonNullable<StoreConfig["productComparison"]> = {
  fields: [
    { id: "price", label: "Cena", source: { type: "commercial", key: "price" }, format: "currency", preference: "min" },
    { id: "screen", label: "Ekran", source: { type: "attribute", key: "screenSize" }, format: "number", unit: "cal", preference: "none" },
    { id: "memory", label: "Pamięć RAM", source: { type: "attribute", key: "memoryGb" }, format: "number", unit: "GB", preference: "max" },
    { id: "ports", label: "Porty", source: { type: "attribute", key: "ports" }, format: "list", preference: "none" },
    { id: "noise", label: "Hałas", source: { type: "array_metric", key: "modes", property: "noise", operation: "min" }, format: "number", unit: "dB", preference: "min" },
  ],
  similarityWeights: { screen: 5, memory: 3, ports: 2, noise: 1 },
};

const product = (externalId: string, priceMinor: number, attributes: Record<string, unknown>, availability = "in stock"): SearchableProduct => ({
  id: externalId, externalId, title: `Laptop ${externalId}`, descriptionText: "", priceMinor, salePriceMinor: null,
  currency: "PLN", availability, productUrl: `https://shop.test/${externalId}`, imageUrl: `https://shop.test/${externalId}.jpg`, attributes, dataQualityScore: 90,
});

const reference = product("a", 400_000, { screenSize: { value: 14 }, memoryGb: { value: 16 }, ports: { value: ["USB-C", "HDMI"] }, modes: { value: [{ noise: 30 }, { noise: 42 }] } });
const similar = product("b", 350_000, { screenSize: { value: 14 }, memoryGb: { value: 16 }, ports: { value: ["USB-C", "HDMI"] }, modes: { value: [{ noise: 31 }] } });
const different = product("c", 300_000, { screenSize: { value: 17 }, memoryGb: { value: 8 }, ports: { value: ["USB-A"] }, modes: { value: [{ noise: 45 }] } });

describe("universal product comparison", () => {
  it("compares configured fields and marks deterministic winners", () => {
    const result = compareProducts([reference, similar], config);
    expect(result.fields.find((field) => field.id === "price")?.bestProductIds).toEqual(["b"]);
    expect(result.fields.find((field) => field.id === "memory")?.bestProductIds).toEqual(["a", "b"]);
    expect(result.fields.find((field) => field.id === "noise")?.values[0]?.display).toBe("30 dB");
  });

  it("shows missing values instead of inventing them", () => {
    const withoutMemory = product("missing", 200_000, { screenSize: { value: 14 } });
    const result = compareProducts([reference, withoutMemory], config);
    expect(result.fields.find((field) => field.id === "memory")?.values[1]).toMatchObject({ value: null, display: "Brak danych", missing: true });
  });

  it("ranks similar products using configured weights", () => {
    const results = findSimilarProducts(reference, [reference, different, similar], config, { limit: 5 });
    expect(results.map((result) => result.product.externalId)).toEqual(["b", "c"]);
    expect(results[0]!.similarityScore).toBeGreaterThan(results[1]!.similarityScore);
    expect(results[0]!.reasons).toContain("Ekran");
  });

  it("returns only cheaper and available alternatives when requested", () => {
    const unavailable = product("d", 100_000, reference.attributes, "out_of_stock");
    const results = findSimilarProducts(reference, [reference, similar, unavailable], config, { cheaperOnly: true, onlyAvailable: true });
    expect(results.map((result) => result.product.externalId)).toEqual(["b"]);
  });

  it("creates structured chat actions without model-generated facts", () => {
    const comparison = buildComparisonConversationResponse({ products: [reference, similar], productIds: ["a", "b"], config });
    expect(comparison.meta?.productAction).toBe("compare");
    expect(comparison.comparison?.fields).toHaveLength(5);
    const alternatives = buildSimilarConversationResponse({ products: [reference, similar], referenceId: "a", config, cheaperOnly: true });
    expect(alternatives.products[0]?.externalId).toBe("b");
    expect(alternatives.suggestions[0]).toMatchObject({ key: "compare", value: "a,b" });
  });
});
