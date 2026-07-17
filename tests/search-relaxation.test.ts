import { describe, expect, it } from "vitest";
import { applySelection, buildConversationResponse } from "../src/conversation/orchestrator.js";
import { findSearchRelaxations } from "../src/search/relaxation.js";
import type { SearchableProduct } from "../src/search/types.js";

const product: SearchableProduct = {
  id: "1", externalId: "amadis", title: "Amadis White 60 cm", descriptionText: "", priceMinor: 59_900,
  salePriceMinor: null, currency: "PLN", availability: "in stock", productUrl: "https://example.com",
  imageUrl: "https://example.com/image.jpg", dataQualityScore: 80,
  attributes: { widthCm: { value: 60 }, hoodType: { value: "teleskopowy" }, material: { value: "białe szkło" } },
};

describe("controlled search relaxation", () => {
  it("suggests removing noise when a product lacks noise data", () => {
    const criteria = { widthCm: 60, hoodTypeValues: ["teleskopowy"], material: "biał", maxPriceMinor: 250_000, maxNoiseDb: 45 };
    const relaxations = findSearchRelaxations([product], criteria);
    expect(relaxations[0]?.filter).toBe("maxNoiseDb");
    expect(relaxations[0]?.products[0]?.externalId).toBe("amadis");
  });

  it("returns a button instead of silently dropping a filter", () => {
    const response = buildConversationResponse({ message: "", state: { criteria: {
      widthCm: 60, hoodType: "zabudowy", hoodTypeValues: ["teleskopowy"], material: "biał",
      maxPriceMinor: 250_000, maxNoiseDb: 45,
    } }, products: [product] });
    expect(response.products).toEqual([]);
    expect(response.suggestions[0]).toMatchObject({ key: "removeFilter", value: "maxNoiseDb" });
  });

  it("applies explicit relaxation and fixes the show-results loop", () => {
    expect(applySelection({ maxNoiseDb: 45 }, "removeFilter", "maxNoiseDb").maxNoiseDb).toBeUndefined();
    expect(applySelection({}, "priority", "any").priorityResolved).toBe(true);
  });
});
