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
    expect(priorities.maxNoiseDb).toBeUndefined();
    expect(priorities.minEfficiencyM3h).toBeUndefined();
    expect(priorities.preferences?.map((item) => item.id)).toEqual(["low_noise"]);
  });

  it("keeps returning products through the reported multi-turn conversation", () => {
    const product = (id: string, widthCm: number, material: string, priceMinor: number) => ({
      ...ceramicIsland,
      id,
      externalId: id,
      title: `Okap wyspowy ${material} ${widthCm} cm`,
      priceMinor,
      attributes: {
        ...ceramicIsland.attributes,
        widthCm: { value: widthCm },
        material: { value: material },
        maxTurbineEfficiencyM3h: { value: 850 },
        performanceLevels: { value: [{ level: 1, noiseDb: 48, efficiencyM3h: 350 }, { level: 4, noiseDb: 69, efficiencyM3h: 742 }] },
      },
    });
    const products = [
      product("black-90", 90, "stal malowana proszkowo (czarny matt)", 299_900),
      product("black-60", 60, "stal malowana proszkowo (czarny matt)", 289_900),
      product("ceramic-60", 60, "ceramika (czarna)", 299_900),
    ];
    const respond = (message: string, state?: ReturnType<typeof buildConversationResponse>["state"], selection?: { key: string; value: string }) => buildConversationResponse({
      message, products, ...(state ? { state } : {}), ...(selection ? { selection } : {}),
      taxonomy: nortbergConfig.searchTaxonomy!, preferenceRules: nortbergConfig.preferenceRules,
      guidedSelling: nortbergConfig.guidedSelling!, questionPolicy: nortbergConfig.questionPolicy!, searchPolicy: nortbergConfig.searchPolicy!,
    });

    let response = respond("Szukam czarnego okapu wyspowego 90 cm, najlepiej ceramicznego, do 4000 zł. Zależy mi na cichej pracy i dużej wydajności.");
    expect(response.products.map((item) => item.externalId)).toEqual(["black-90"]);
    expect(response.state.criteria.maxNoiseDb).toBeUndefined();
    expect(response.state.criteria.minEfficiencyM3h).toBeUndefined();

    response = respond("A jeśli zwiększę budżet do 5000 zł?", response.state);
    expect(response.products).not.toHaveLength(0);
    response = respond("Ceramika nie jest już konieczna, ale nadal chcę czarny model.", response.state);
    expect(response.products).not.toHaveLength(0);
    response = respond("Właściwie potrzebuję 60 cm, nie 90 cm.", response.state);
    expect(response.products.map((item) => item.externalId)).toContain("black-60");
    response = respond("Najważniejsze, żeby był możliwie cichy. Wydajność jest mniej ważna.", response.state);
    expect(response.products).not.toHaveLength(0);
    expect(response.state.criteria.preferences?.map((item) => item.id)).not.toContain("high_airflow");
  });

  it("removes both legacy and dynamic criteria from relaxation buttons", () => {
    const state = { criteria: {
      maxNoiseDb: 45,
      filters: [{ facetId: "noise", operator: "lte" as const, value: 45, importance: "required" as const }],
      preferences: [{ id: "low_noise", facetId: "noise", direction: "min" as const, weight: 8 }],
      widthCm: 60, budgetResolved: true, priorityResolved: true,
    }, intent: "product_search" as const };
    const response = buildConversationResponse({
      message: "", state, selection: { key: "removeFilter", value: "maxNoiseDb" }, products: [ceramicIsland],
      taxonomy: nortbergConfig.searchTaxonomy!, preferenceRules: nortbergConfig.preferenceRules,
      searchPolicy: nortbergConfig.searchPolicy!,
    });
    expect(response.state.criteria.maxNoiseDb).toBeUndefined();
    expect(response.state.criteria.filters?.some((item) => item.facetId === "noise")).toBe(false);
    expect(response.state.criteria.preferences?.some((item) => item.id === "low_noise")).toBe(false);
    expect(response.products).toHaveLength(1);
  });
});
