import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/password";
describe("password hashing", () => {
  it("stores a salted scrypt hash instead of the password", async () => {
    const hash = await hashPassword("PFMO-trip-2026!");
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain("PFMO-trip-2026!");
    expect(await hashPassword("PFMO-trip-2026!")).not.toBe(hash);
  });

  it("verifies the correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("PFMO-trip-2026!");
    expect(await verifyPassword("PFMO-trip-2026!", hash)).toBe(true);
    expect(await verifyPassword("Wrong-password-2026!", hash)).toBe(false);
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("anything", "plain-text")).toBe(false);
    expect(await verifyPassword("anything", "scrypt$1$1$1$abc$def")).toBe(false);
  });
});