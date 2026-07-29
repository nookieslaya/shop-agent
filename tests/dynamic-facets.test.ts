import { describe, expect, it } from "vitest";
import { nortbergConfig } from "../src/config/store.js";
import { extractSearchCriteria } from "../src/conversation/intent.js";
import { buildConversationResponse } from "../src/conversation/orchestrator.js";
import { searchProducts } from "../src/search/product-search.js";
import type { SearchableProduct } from "../src/search/types.js";

const ceramicIsland: SearchableProduct = {
  id: "1", externalId: "ceramic-island", title: "Okap wyspowy Ceramic 60 cm", descriptionText: "",
  category: "Okapy Wyspowe", priceMinor: 280_000, salePriceMinor: null, currency: "PLN",
  availability: "in stock", productUrl: "https://example.test/ceramic", imageUrl: "https://example.test/image.jpg",
  dataQualityScore: 90,
  attributes: {
    widthCm: { value: 60 },
    hoodType: { value: "wyspowy" },
    material: { value: "spiek ceramiczny" },
    maxTurbineEfficiencyM3h: { value: 800 },
    performanceLevels: { value: [{ level: 1, noiseDb: 42, efficiencyM3h: 400 }] },
  },
};

describe("dynamic store facets", () => {
  it("finds ceramic products through editable aliases", () => {
    const criteria = extractSearchCriteria("Szukam ceramicznego okapu do 3000 zł", nortbergConfig.searchTaxonomy, nortbergConfig.preferenceRules);
    expect(criteria.filters).toEqual(expect.arrayContaining([
      expect.objectContaining({ facetId: "material", value: "ceramiczny" }),
      expect.objectContaining({ facetId: "price", operator: "lte", value: 3000 }),
    ]));
    const results = searchProducts([ceramicIsland], { ...criteria, onlyAvailable: true }, {
      facets: nortbergConfig.searchTaxonomy!.facets,
      rankingWeights: nortbergConfig.searchPolicy!.rankingWeights,
    });
    expect(results[0]).toMatchObject({ externalId: "ceramic-island" });
    expect(results[0]?.matchReasons.map((reason) => reason.facetId)).toEqual(expect.arrayContaining(["material", "price"]));
  });

  it("returns results immediately when one message contains critical requirements", () => {
    const response = buildConversationResponse({
      message: "Szukam ceramicznego okapu 60 cm do 3000 zł",
      products: [ceramicIsland],
      taxonomy: nortbergConfig.searchTaxonomy!,
      preferenceRules: nortbergConfig.preferenceRules,
      guidedSelling: nortbergConfig.guidedSelling!,
      questionPolicy: nortbergConfig.questionPolicy!,
      searchPolicy: nortbergConfig.searchPolicy!,
    });
    expect(response.products).toHaveLength(1);
    expect(response.products[0]?.externalId).toBe("ceramic-island");
  });

  it("keeps 'najlepiej' as a preference and discloses when all results miss it", () => {
    const steel = {
      ...ceramicIsland,
      id: "steel",
      externalId: "steel",
      title: "Czarny okap wyspowy 90 cm",
      attributes: {
        ...ceramicIsland.attributes,
        widthCm: { value: 90 },
        material: { value: "stal malowana proszkowo (czarny matt)" },
      },
    };
    const response = buildConversationResponse({
      message: "Szukam czarnego okapu wyspowego 90 cm, najlepiej ceramicznego, do 4000 zł.",
      products: [steel],
      taxonomy: nortbergConfig.searchTaxonomy!, preferenceRules: nortbergConfig.preferenceRules,
      guidedSelling: nortbergConfig.guidedSelling!, questionPolicy: nortbergConfig.questionPolicy!, searchPolicy: nortbergConfig.searchPolicy!,
    });
    expect(response.products.map((product) => product.externalId)).toEqual(["steel"]);
    expect(response.message).toContain("Nie znalazłem pełnego dopasowania");
    expect(response.message).toContain("Materiał");
  });

  it("keeps filters from earlier turns and replaces the changed facet", () => {
    const first = buildConversationResponse({
      message: "Szukam ceramicznego okapu 60 cm do 3000 zł", products: [ceramicIsland],
      taxonomy: nortbergConfig.searchTaxonomy!, preferenceRules: nortbergConfig.preferenceRules,
      guidedSelling: nortbergConfig.guidedSelling!, questionPolicy: nortbergConfig.questionPolicy!, searchPolicy: nortbergConfig.searchPolicy!,
    });
    const next = buildConversationResponse({
      message: "A coś czarnego?", state: first.state, products: [],
      taxonomy: nortbergConfig.searchTaxonomy!, preferenceRules: nortbergConfig.preferenceRules,
      guidedSelling: nortbergConfig.guidedSelling!, questionPolicy: nortbergConfig.questionPolicy!, searchPolicy: nortbergConfig.searchPolicy!,
    });
    expect(next.state.criteria.filters).toEqual(expect.arrayContaining([
      expect.objectContaining({ facetId: "width", value: 60 }),
      expect.objectContaining({ facetId: "price", value: 3000 }),
      expect.objectContaining({ facetId: "material", value: "czarny" }),
    ]));
    expect(next.state.criteria.filters?.filter((filter) => filter.facetId === "material")).toHaveLength(1);
  });

  it("removes an optional material and deprioritizes efficiency in follow-up turns", () => {
    const state = {
      criteria: {
        widthCm: 60,
        filters: [{ facetId: "material", operator: "eq" as const, value: "ceramiczny", importance: "required" as const }],
        preferences: [{ id: "high_airflow", facetId: "airflow", direction: "max" as const, weight: 8 }],
        minEfficiencyM3h: 700,
        budgetResolved: true,
      },
      intent: "product_search" as const,
    };
    const material = buildConversationResponse({
      message: "Ceramika nie jest już konieczna.", state, products: [ceramicIsland],
      taxonomy: nortbergConfig.searchTaxonomy!, preferenceRules: nortbergConfig.preferenceRules,
      guidedSelling: nortbergConfig.guidedSelling!, questionPolicy: nortbergConfig.questionPolicy!, searchPolicy: nortbergConfig.searchPolicy!,
    });
    expect(material.state.criteria.filters?.some((filter) => filter.facetId === "material")).toBe(false);

    const priorities = extractSearchCriteria("Najważniejsze, żeby był możliwie cichy. Wydajność jest mniej ważna.", nortbergConfig.searchTaxonomy, nortbergConfig.preferenceRules);
    expect(priorities.maxNoiseDb).toBe(45);
    expect(priorities.minEfficiencyM3h).toBeUndefined();
    expect(priorities.preferences?.map((item) => item.id)).toEqual(["low_noise"]);
  });
});
