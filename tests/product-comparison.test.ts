import { describe, expect, it } from "vitest";
import { nortbergConfig, type StoreConfig } from "../src/config/store.js";
import { buildComparisonConversationResponse, buildComparisonFollowUpResponse, buildSimilarConversationResponse } from "../src/conversation/product-actions.js";
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
  similarityRules: {},
  minimumScore: 0,
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

  it("supports configurable variant values read from product titles", () => {
    const titleConfig: NonNullable<StoreConfig["productComparison"]> = {
      fields: [{ id: "size", label: "Rozmiar", source: { type: "title_regex", pattern: "(\\d+) cm", group: 1, valueType: "number" }, format: "number", unit: "cm", preference: "none" }],
      similarityWeights: { size: 1 }, similarityRules: {}, minimumScore: 0,
    };
    const fifty = { ...reference, title: "Produkt 50 cm" }; const sixty = { ...similar, title: "Produkt 60 cm" };
    expect(compareProducts([fifty, sixty], titleConfig).fields[0]?.values.map((item) => item.value)).toEqual([50, 60]);
  });

  it("rejects candidates that fail a configured critical field and reports diagnostics", () => {
    const strict = { ...config, similarityRules: { screen: { required: true, minimumSimilarity: 1, mismatchPenalty: 0 }, ports: { required: false, minimumSimilarity: 0, mismatchPenalty: 3 } }, minimumScore: 0.2 };
    const results = findSimilarProducts(reference, [reference, similar, different], strict);
    expect(results.map((result) => result.product.externalId)).toEqual(["b"]);
    expect(results[0]?.diagnostics.find((item) => item.fieldId === "screen")).toMatchObject({ status: "matched", similarity: 1 });
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
    expect(comparison.state.productContext).toMatchObject({ comparedProductIds: ["a", "b"], lastPresentedProductIds: ["a", "b"], lastAction: "compare" });
    const alternatives = buildSimilarConversationResponse({ products: [reference, similar], referenceId: "a", config, cheaperOnly: true });
    expect(alternatives.products[0]?.externalId).toBe("b");
    expect(alternatives.suggestions[0]).toMatchObject({ key: "compare", value: "a,b" });
  });

  it("answers comparison follow-ups from deterministic product data", () => {
    const state = buildComparisonConversationResponse({ products: [reference, similar], productIds: ["a", "b"], config }).state;
    const cheaper = buildComparisonFollowUpResponse({ message: "Który z nich ma niższą cenę?", products: [reference, similar], productIds: state.productContext!.comparedProductIds!, config, state });
    expect(cheaper.message).toContain("Laptop b");
    expect(cheaper.message).toContain("3500,00 zł");
    expect(cheaper.meta?.productAction).toBe("comparison_follow_up");

    const quieter = buildComparisonFollowUpResponse({ message: "ktory jest cichszy?", products: [reference, similar], productIds: ["a", "b"], config, state });
    expect(quieter.message).toContain("Laptop a");
    expect(quieter.message).toContain("30 dB");
  });

  it("does not offer a cheaper action when no cheaper similar product exists", () => {
    const cheapest = product("cheap", 100_000, reference.attributes);
    const expensive = product("expensive", 200_000, reference.attributes);
    const response = buildComparisonConversationResponse({ products: [cheapest, expensive], productIds: ["cheap", "expensive"], config });
    const cheapestAction = response.suggestions.find((item) => item.value === "cheap");
    expect(cheapestAction).toMatchObject({ key: "similar" });
  });

  it("offers unrestricted similar products after a cheaper search has no results", () => {
    const cheapest = product("cheap", 100_000, reference.attributes);
    const expensive = product("expensive", 200_000, reference.attributes);
    const response = buildSimilarConversationResponse({ products: [cheapest, expensive], referenceId: "cheap", config, cheaperOnly: true });
    expect(response.products).toEqual([]);
    expect(response.suggestions).toEqual([{ label: "Pokaż podobne bez limitu ceny", key: "similar", value: "cheap" }]);
  });
});

describe("Nortberg comparison policy", () => {
  const hood = (id: string, title: string, material: string): SearchableProduct => ({ ...product(id, 100_000, {
    hoodType: { value: "kominowy" }, material: { value: material }, operatingModes: { value: ["wyciąg", "pochłaniacz"] },
    performanceLevels: { value: [{ level: 1, noiseDb: 42, efficiencyM3h: 221 }, { level: 4, noiseDb: 69, efficiencyM3h: 742 }] },
    maxTurbineEfficiencyM3h: { value: 850, rawValue: "max 850 m3/h" }, warrantyMonths: { value: 30, rawValue: "24 + 6* miesięcy" },
  }), title });

  it("does not recommend a 50 cm variant as similar to a 60 cm variant", () => {
    const policy = nortbergConfig.productComparison!;
    const referenceHood = hood("60", "Okap Black 60 cm", "czarne szkło");
    const wrongWidth = hood("50", "Okap Black 50 cm", "czarne szkło");
    const white = hood("white", "Okap White 60 cm", "białe szkło");
    const results = findSimilarProducts(referenceHood, [referenceHood, wrongWidth, white], policy);
    expect(results.map((result) => result.product.externalId)).not.toContain("50");
    expect(results[0]?.diagnostics.find((item) => item.fieldId === "material")?.penalty).toBeGreaterThan(0);
  });

  it("keeps conditional warranty wording and separates airflow from turbine capacity", () => {
    const policy = nortbergConfig.productComparison!; const a = hood("a", "Okap A 60 cm", "czarne szkło"); const b = hood("b", "Okap B 60 cm", "czarne szkło");
    const result = compareProducts([a, b], policy);
    expect(result.fields.find((field) => field.id === "warranty")?.values[0]?.display).toBe("24 + 6* miesięcy");
    expect(result.fields.find((field) => field.id === "airflow")?.values[0]?.value).toBe(742);
    expect(result.fields.find((field) => field.id === "turbine")?.values[0]?.value).toBe(850);
  });
});
