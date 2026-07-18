import { describe,expect,it } from "vitest";
import { hashAdminPassword,verifyHashedPassword } from "../src/security/admin-identity.js";

describe("administrator identities",()=>{
  it("hashes passwords with a unique scrypt salt",async()=>{const first=await hashAdminPassword("very-secure-password"),second=await hashAdminPassword("very-secure-password");expect(first).not.toBe(second);expect(await verifyHashedPassword("very-secure-password",first)).toBe(true);expect(await verifyHashedPassword("wrong-password",first)).toBe(false)});
  it("rejects short passwords",async()=>{await expect(hashAdminPassword("short")).rejects.toThrow("12")});
});
