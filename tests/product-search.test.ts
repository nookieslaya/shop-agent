import { describe, expect, it } from "vitest";
import { searchProducts } from "../src/search/product-search.js";
import type { SearchableProduct } from "../src/search/types.js";

const product = (overrides: Partial<SearchableProduct> = {}): SearchableProduct => ({
  id: "1", externalId: "hood-1", title: "Sento Black 60", descriptionText: "Czarny okap kominowy",
  priceMinor: 200_000, salePriceMinor: null, currency: "PLN", availability: "in stock",
  productUrl: "https://example.com/1", imageUrl: "https://example.com/1.jpg", dataQualityScore: 90,
  attributes: {
    widthCm: { value: 60 }, hoodType: { value: "kominowy" }, material: { value: "czarne szkło" },
    operatingModes: { value: ["wyciąg", "pochłaniacz"] }, maxTurbineEfficiencyM3h: { value: 850 },
    performanceLevels: { value: [{ level: 1, noiseDb: 42, efficiencyM3h: 221 }] },
  }, ...overrides,
});

describe("deterministic product search", () => {
  it("applies technical and commercial filters", () => {
    const results = searchProducts([product(), product({ id: "2", externalId: "hood-2", priceMinor: 350_000 })], {
      widthCm: 60, material: "czarne", minEfficiencyM3h: 800, maxNoiseDb: 45, maxPriceMinor: 250_000,
    });
    expect(results.map((result) => result.externalId)).toEqual(["hood-1"]);
    expect(results[0]?.reasons).toContain("szerokość 60 cm");
  });

  it("requires every query token and prefers better quality", () => {
    const results = searchProducts([
      product({ id: "1", externalId: "lower", dataQualityScore: 50 }),
      product({ id: "2", externalId: "higher", dataQualityScore: 95 }),
      product({ id: "3", externalId: "wrong", title: "Biały okap 60", descriptionText: "" }),
    ], { query: "czarny kominowy" });
    expect(results.map((result) => result.externalId)).toEqual(["higher", "lower"]);
  });

  it("excludes unavailable products by default criteria", () => {
    const results = searchProducts([product({ availability: "out_of_stock" })], { onlyAvailable: true });
    expect(results).toEqual([]);
  });

  it("does not leak shared-page widths into a concrete variant", () => {
    const fiftyCentimeters = product({
      title: "Sento Black 50 cm",
      attributes: {
        widthCm: { value: 50 },
        availableWidthsCm: { value: [50, 60, 90] },
      },
    });
    expect(searchProducts([fiftyCentimeters], { widthCm: 60 })).toEqual([]);
  });
});
