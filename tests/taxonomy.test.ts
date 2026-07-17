import { describe, expect, it } from "vitest";
import { applySearchTaxonomy } from "../src/search/taxonomy.js";
import { searchProducts } from "../src/search/product-search.js";
import type { SearchableProduct } from "../src/search/types.js";

describe("store-specific search taxonomy", () => {
  it("expands a customer-facing hood type into store values", () => {
    const criteria = applySearchTaxonomy({ hoodType: "zabudowy" }, {
      hoodTypeAliases: { zabudowy: ["podszafkowy", "teleskopowy"] },
    });
    expect(criteria.hoodTypeValues).toEqual(["podszafkowy", "teleskopowy"]);
  });

  it("matches any configured store alias", () => {
    const product: SearchableProduct = {
      id: "1", externalId: "1", title: "Biały okap", descriptionText: "", priceMinor: 100_000,
      salePriceMinor: null, currency: "PLN", availability: "in stock", productUrl: "https://example.com",
      imageUrl: "https://example.com/image.jpg", dataQualityScore: 90,
      attributes: { hoodType: { value: "podszafkowy" } },
    };
    expect(searchProducts([product], { hoodType: "zabudowy", hoodTypeValues: ["podszafkowy", "teleskopowy"] })).toHaveLength(1);
  });
});
