import { describe, expect, it } from "vitest";
import { decideProductSync, needsProductPageEnrichment } from "../src/sync/change-detection.js";

describe("incremental product synchronization", () => {
  it("creates a new catalog product", () => {
    expect(decideProductSync(undefined, "new")).toEqual({ operation: "create" });
  });

  it("updates changed feed data without forcing page enrichment", () => {
    expect(decideProductSync({ id: "1", feedHash: "old", productPageStatus: "enriched", productPageCheckedAt: new Date() }, "new"))
      .toEqual({ operation: "update" });
  });

  it("skips an unchanged catalog product", () => {
    expect(decideProductSync({ id: "1", feedHash: "same", productPageStatus: "enriched", productPageCheckedAt: new Date() }, "same"))
      .toEqual({ operation: "unchanged" });
  });

  it("enriches only missing pages unless force is explicit", () => {
    const missing = { id: "1", feedHash: "same", productPageStatus: "pending" as const, productPageCheckedAt: null };
    const completed = { id: "2", feedHash: "same", productPageStatus: "enriched" as const, productPageCheckedAt: new Date() };
    const failed = { id: "3", feedHash: "same", productPageStatus: "failed" as const, productPageCheckedAt: null };
    expect(needsProductPageEnrichment(missing)).toBe(true);
    expect(needsProductPageEnrichment(completed)).toBe(false);
    expect(needsProductPageEnrichment(failed)).toBe(false);
    expect(needsProductPageEnrichment(failed, true)).toBe(true);
    expect(needsProductPageEnrichment(completed, true)).toBe(true);
  });
});
