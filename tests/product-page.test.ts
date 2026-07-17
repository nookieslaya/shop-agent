import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { FeedProduct } from "../src/domain/product.js";
import { normalizeHoodAttributes } from "../src/normalizers/hood.js";
import { extractTechnicalRows } from "../src/scrapers/product-page.js";

const feed: FeedProduct = {
  externalId: "588.1292",
  title: "Sento 60 cm",
  descriptionHtml: "",
  productUrl: "https://example.test/product",
  imageUrl: "https://example.test/image.jpg",
  additionalImageUrls: [],
  price: 1749,
  currency: "PLN",
  availability: "in stock",
  size: "60 cm",
  customLabels: {},
  raw: {},
};

describe("Nortberg technical specification normalization", () => {
  it("extracts table rows and assigns variant-specific width", async () => {
    const html = await readFile(new URL("./fixtures/product-page.html", import.meta.url), "utf8");
    const rows = extractTechnicalRows(html, "#tab2 table tr");
    const attributes = normalizeHoodAttributes(feed, rows);

    expect(rows).toHaveLength(12);
    expect(attributes.widthCm?.value).toBe(60);
    expect(attributes.availableWidthsCm?.value).toEqual([60, 90]);
    expect(attributes.maxTurbineEfficiencyM3h?.value).toBe(850);
    expect(attributes.performanceLevels?.value).toEqual([
      { level: 1, noiseDb: 42, efficiencyM3h: 221, intensive: false },
      { level: 4, noiseDb: 69, efficiencyM3h: 742, intensive: true },
    ]);
    expect(attributes.supportsSuperSilentHome?.value).toBe(true);
    expect(attributes.supportsSuperSilentKitchen?.value).toBe(true);
  });
});
