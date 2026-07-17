import { describe, expect, it } from "vitest";
import { decideProductSync } from "../src/sync/change-detection.js";

const now = new Date("2026-07-17T12:00:00Z");
const week = 7 * 24 * 60 * 60 * 1000;

describe("incremental product synchronization", () => {
  it("creates and scrapes a new product", () => {
    expect(decideProductSync(undefined, "new", now, week)).toEqual({ operation: "create", refreshProductPage: true });
  });

  it("updates and scrapes a changed feed product", () => {
    expect(decideProductSync({ id: "1", feedHash: "old", productPageCheckedAt: now }, "new", now, week))
      .toEqual({ operation: "update", refreshProductPage: true });
  });

  it("skips a fresh unchanged product", () => {
    expect(decideProductSync({ id: "1", feedHash: "same", productPageCheckedAt: now }, "same", now, week))
      .toEqual({ operation: "unchanged", refreshProductPage: false });
  });

  it("refreshes an unchanged product after TTL", () => {
    const checkedAt = new Date(now.getTime() - week);
    expect(decideProductSync({ id: "1", feedHash: "same", productPageCheckedAt: checkedAt }, "same", now, week))
      .toEqual({ operation: "unchanged", refreshProductPage: true });
  });
});
