import { describe, expect, it } from "vitest";
import { isAdminRequestAuthorized } from "../src/api/admin-auth.js";

describe("admin API authentication", () => {
  it("accepts only the exact configured key", () => {
    expect(isAdminRequestAuthorized("secret-key", "secret-key")).toBe(true);
    expect(isAdminRequestAuthorized("wrong-key", "secret-key")).toBe(false);
  });
  it("keeps the admin API disabled without a configured key", () => {
    expect(isAdminRequestAuthorized("anything", undefined)).toBe(false);
    expect(isAdminRequestAuthorized(undefined, "secret-key")).toBe(false);
  });
});
