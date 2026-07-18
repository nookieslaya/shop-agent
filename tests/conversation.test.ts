import { describe, expect, it } from "vitest";
import { buildConversationResponse } from "../src/conversation/orchestrator.js";
import { extractSearchCriteria } from "../src/conversation/intent.js";
import type { SearchableProduct } from "../src/search/types.js";

const matchingProduct: SearchableProduct = {
  id: "one", externalId: "one", title: "Okap biały 60 cm", descriptionText: "", priceMinor: 59_900,
  salePriceMinor: null, currency: "PLN", availability: "in stock", productUrl: "https://shop.test/one",
  imageUrl: "https://shop.test/one.jpg", dataQualityScore: 90,
  attributes: { widthCm: { value: 60 }, material: { value: "biały" } },
};

describe("conversation orchestration", () => {
  it("extracts explicit Polish shopping requirements", () => {
    expect(extractSearchCriteria("Szukam cichego czarnego okapu 60 cm do 3000 zł")).toMatchObject({
      widthCm: 60, maxPriceMinor: 300_000, material: "czarny", maxNoiseDb: 45,
    });
  });

  it("extracts minimum price, price sorting and requested result count", () => {
    expect(extractSearchCriteria("Pokaż 2 najdroższe okapy powyżej 10000 zł")).toMatchObject({
      minPriceMinor: 1_000_000, sortBy: "price_desc", limit: 2, budgetResolved: true, priceMode: "bounded",
    });
    expect(extractSearchCriteria("pokaż najtańszy okap")).toMatchObject({ sortBy: "price_asc", limit: 1 });
  });

  it("asks for width first and returns button suggestions", () => {
    const response = buildConversationResponse({ message: "Szukam okapu", products: [] });
    expect(response.message).toContain("szerokości");
    expect(response.suggestions.map((item) => item.value)).toEqual([50, 60, 80, 90]);
  });

  it("does not apply the follow-up limit to guided budget choices", () => {
    const response = buildConversationResponse({ message: "", state: { criteria: { widthCm: 60 } }, products: [] });
    expect(response.message).toContain("budżet");
    expect(response.suggestions.map((item) => item.label)).toEqual([
      "Do 1500 zł", "Do 2500 zł", "Do 4000 zł", "Bez limitu",
    ]);
  });

  it("uses per-store guided questions and choices", () => {
    const response = buildConversationResponse({ message: "Szukam produktu", products: [], guidedSelling: {
      widthQuestion: "Jaki rozmiar wybierasz?", widthChoices: [{ label: "Duży", value: 90 }],
      budgetQuestion: "Ile chcesz wydać?", budgetChoices: [{ label: "Do 1000", valueMinor: 100_000 }],
      priorityQuestion: "Priorytet?", priorityChoices: [{ label: "Dowolny", value: "any" }],
    } });
    expect(response.message).toBe("Jaki rozmiar wybierasz?");
    expect(response.suggestions).toEqual([{ label: "Duży", key: "widthCm", value: 90 }]);
  });

  it("keeps state while applying a button selection", () => {
    const response = buildConversationResponse({ message: "", state: { criteria: { widthCm: 60 } },
      selection: { key: "maxPriceMinor", value: 250_000 }, products: [] });
    expect(response.state.criteria).toMatchObject({ widthCm: 60, maxPriceMinor: 250_000 });
    expect(response.message).toContain("najważniejsze");
  });

  it("treats the no-limit choice as resolved without a fake maximum price", () => {
    const response = buildConversationResponse({ message: "", state: { criteria: { widthCm: 90 } },
      selection: { key: "maxPriceMinor", value: 99_999_900 }, products: [] });
    expect(response.state.criteria).toMatchObject({ priceMode: "unbounded", budgetResolved: true });
    expect(response.state.criteria.maxPriceMinor).toBeUndefined();
    expect(response.message).not.toContain("budżet");
  });

  it("does not let AI confuse the requested count with price or width", () => {
    const expensive = { ...matchingProduct, id: "expensive", externalId: "expensive", title: "Drogi okap 60 cm", priceMinor: 900_000 };
    const response = buildConversationResponse({ message: "Pokaż 1 najdroższy okap", products: [matchingProduct, expensive],
      state: { criteria: { widthCm: 60, budgetResolved: true, priorityResolved: true } },
      extractedCriteria: { widthCm: 1, maxPriceMinor: 100 },
    });
    expect(response.products.map((item) => item.externalId)).toEqual(["expensive"]);
    expect(response.state.criteria).toMatchObject({ widthCm: 60, limit: 1, sortBy: "price_desc" });
    expect(response.state.criteria.maxPriceMinor).toBeUndefined();
  });

  it("offers similar products when a configured store has only one result", () => {
    const response = buildConversationResponse({
      message: "", products: [matchingProduct], productActionsEnabled: true,
      state: { criteria: { widthCm: 60, maxPriceMinor: 250_000, material: "biały", priorityResolved: true } },
    });
    expect(response.products).toHaveLength(1);
    expect(response.suggestions).toEqual([{ label: "Pokaż podobne produkty", key: "similar", value: "one" }]);
  });
});
