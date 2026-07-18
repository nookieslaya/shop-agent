import { describe, expect, it } from "vitest";
import { createAdminSession, isAdminRequestAuthorized, sessionFromCookie, verifyAdminPassword, verifyAdminSession } from "../src/api/admin-auth.js";

describe("admin API authentication", () => {
  it("accepts only the exact configured key", () => {
    expect(verifyAdminPassword("secret-key", "secret-key")).toBe(true);
    expect(verifyAdminPassword("wrong-key", "secret-key")).toBe(false);
  });
  it("keeps the admin API disabled without a configured key", () => {
    expect(verifyAdminPassword("anything", undefined)).toBe(false);
    expect(verifyAdminPassword(undefined, "secret-key")).toBe(false);
  });
  it("creates an expiring signed browser session", () => {
    const token = createAdminSession(1_000, "signing-secret");
    expect(verifyAdminSession(token, 2_000, "signing-secret")).toBe(true);
    expect(verifyAdminSession(token, 2_000, "wrong-secret")).toBe(false);
    expect(verifyAdminSession(token, 8 * 24 * 60 * 60 * 1000, "signing-secret")).toBe(false);
    expect(sessionFromCookie(`other=x; shop_agent_admin=${token}`)).toBe(token);
  });
});
