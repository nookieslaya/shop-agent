import { describe, expect, it } from "vitest";
import { analyzeProductConfiguration } from "../src/products/configuration-analyzer.js";
import type { SearchableProduct } from "../src/search/types.js";

const product = (id: string, attributes: Record<string, unknown>): SearchableProduct => ({
  id, externalId: id, title: `But ${id}`, descriptionText: "", priceMinor: 20_000, salePriceMinor: null, currency: "PLN", availability: "in stock",
  productUrl: `https://shop.test/${id}`, imageUrl: `https://shop.test/${id}.jpg`, attributes, dataQualityScore: 90,
});

const catalog = [
  product("sku-1", { shoeSize: { value: 42 }, material: { value: "skóra" }, color: { value: "czarny" }, internalCode: { value: "unique-a" }, constant: { value: "same" } }),
  product("sku-2", { shoeSize: { value: 43 }, material: { value: "skóra" }, color: { value: "brązowy" }, internalCode: { value: "unique-b" }, constant: { value: "same" } }),
  product("sku-3", { shoeSize: { value: 44 }, material: { value: "tekstylia" }, color: { value: "czarny" }, internalCode: { value: "unique-c" }, constant: { value: "same" } }),
];

describe("store configuration analyzer", () => {
  it("profiles imported attributes without knowing the product industry", () => {
    const analysis = analyzeProductConfiguration(catalog);
    expect(analysis.productsAnalyzed).toBe(3);
    expect(analysis.profiles.find((profile) => profile.key === "shoeSize")).toMatchObject({ valueType: "number", coverage: 1, distinctCount: 3 });
  });

  it("does not suggest constant fields or unique text identifiers", () => {
    const ids = analyzeProductConfiguration(catalog).suggestions.map((suggestion) => suggestion.field.source.type === "attribute" ? suggestion.field.source.key : "");
    expect(ids).not.toContain("constant"); expect(ids).not.toContain("internalCode");
  });

  it("returns reviewable fields with defaults instead of modifying configuration", () => {
    const analysis = analyzeProductConfiguration(catalog); const material = analysis.suggestions.find((suggestion) => suggestion.field.source.type === "attribute" && suggestion.field.source.key === "material");
    expect(material).toMatchObject({ field: { format: "text" }, rule: { mismatchPenalty: 3 } });
  });

  it("suggests guided choices from catalog values and prices", () => {
    const items = [product("a", { widthCm: { value: 60 } }), product("b", { widthCm: { value: 90 } })];
    items[0]!.priceMinor = 120_000; items[1]!.priceMinor = 260_000;
    const guided = analyzeProductConfiguration(items).guidedSelling;
    expect(guided.widthChoices).toEqual([{ label: "60 cm", value: 60 }, { label: "90 cm", value: 90 }]);
    expect(guided.budgetChoices.at(-1)).toEqual({ label: "Bez limitu", valueMinor: 99_999_900 });
  });
});
