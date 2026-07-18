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

  it("matches Polish values when the query omits diacritics", () => {
    const white = product({ attributes: { widthCm: { value: 60 }, material: { value: "białe szkło hartowane" } } });
    expect(searchProducts([white], { widthCm: 60, material: "biały" })).toHaveLength(1);
    expect(searchProducts([white], { widthCm: 60, material: "bialy" })).toHaveLength(1);
  });

  it("enforces minimum price and explicit price ordering before relevance", () => {
    const results = searchProducts([
      product({ id: "cheap", externalId: "cheap", priceMinor: 200_000, dataQualityScore: 99 }),
      product({ id: "mid", externalId: "mid", priceMinor: 500_000, dataQualityScore: 80 }),
      product({ id: "expensive", externalId: "expensive", priceMinor: 900_000, dataQualityScore: 60 }),
    ], { minPriceMinor: 300_000, sortBy: "price_desc", limit: 1 });
    expect(results.map((item) => item.externalId)).toEqual(["expensive"]);
  });
  it("returns a price-tier cross-section for an unbounded search",()=>{
    const products=[100,200,300,400,500,600,700,800,900].map((price,index)=>product({id:String(index),externalId:String(price),priceMinor:price*1000}));
    expect(searchProducts(products,{priceMode:"unbounded",limit:5}).map(item=>item.effectivePriceMinor)).toEqual([100_000,300_000,500_000,700_000,900_000]);
  });
  it("orders products by distance from an approximate target price",()=>{
    const results=searchProducts([product({id:"low",externalId:"low",priceMinor:300_000}),product({id:"near",externalId:"near",priceMinor:390_000}),product({id:"high",externalId:"high",priceMinor:500_000})],{targetPriceMinor:400_000,priceMode:"target",sortBy:"price_nearest"});
    expect(results.map(item=>item.externalId)).toEqual(["near","low","high"]);
  });
});
