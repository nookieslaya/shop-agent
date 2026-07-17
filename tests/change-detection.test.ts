import { describe, expect, it } from "vitest";
import { decideProductSync, needsProductPageEnrichment } from "../src/sync/change-detection.js";

describe("incremental product synchronization", () => {
  it("creates a new catalog product", () => {
    expect(decideProductSync(undefined, "new")).toEqual({ operation: "create" });
  });

  it("updates changed feed data without forcing page enrichment", () => {
    expect(decideProductSync({ id: "1", feedHash: "old", productPageCheckedAt: new Date() }, "new"))
      .toEqual({ operation: "update" });
  });

  it("skips an unchanged catalog product", () => {
    expect(decideProductSync({ id: "1", feedHash: "same", productPageCheckedAt: new Date() }, "same"))
      .toEqual({ operation: "unchanged" });
  });

  it("enriches only missing pages unless force is explicit", () => {
    const missing = { id: "1", feedHash: "same", productPageCheckedAt: null };
    const completed = { id: "2", feedHash: "same", productPageCheckedAt: new Date() };
    expect(needsProductPageEnrichment(missing)).toBe(true);
    expect(needsProductPageEnrichment(completed)).toBe(false);
    expect(needsProductPageEnrichment(completed, true)).toBe(true);
  });
});
