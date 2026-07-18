import { describe, expect, it } from "vitest";
import { fullSyncConfirmed, retryDelayMs, scheduleDue } from "../src/sync/job-policy.js";
import { claimedSyncJobId } from "../src/db/sync-job-repository.js";

describe("synchronization job policy", () => {
  it("requires an exact store confirmation only for full processing", () => {
    expect(fullSyncConfirmed("incremental", undefined, "store-a")).toBe(true);
    expect(fullSyncConfirmed("full", "wrong", "store-a")).toBe(false);
    expect(fullSyncConfirmed("full", "store-a", "store-a")).toBe(true);
  });
  it("uses bounded exponential retries", () => { expect(retryDelayMs(1)).toBe(15_000); expect(retryDelayMs(2)).toBe(30_000); expect(retryDelayMs(20)).toBe(300_000); });
  it("detects due schedules deterministically", () => { const now = Date.UTC(2026, 6, 18, 12); expect(scheduleDue(undefined, 24, now)).toBe(true); expect(scheduleDue(new Date(now - 23 * 3_600_000), 24, now)).toBe(false); expect(scheduleDue(new Date(now - 24 * 3_600_000), 24, now)).toBe(true); });
  it("reads only the claimed id from a raw SQL result before loading the mapped job", () => {
    expect(claimedSyncJobId({ id: "job-1", store_id: "nortberg" })).toBe("job-1");
    expect(claimedSyncJobId({ store_id: "nortberg" })).toBeUndefined();
    expect(claimedSyncJobId(undefined)).toBeUndefined();
  });
});
