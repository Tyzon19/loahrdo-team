import { describe, expect, it } from "vitest";
import { isClientDisconnectError } from "@/lib/request-errors";

describe("client disconnect errors", () => {
  it("recognizes aborted requests", () => {
    expect(isClientDisconnectError(new Error("aborted"))).toBe(true);
    expect(
      isClientDisconnectError(
        Object.assign(new Error("socket closed"), {
          cause: Object.assign(new Error("connection reset"), { code: "ECONNRESET" }),
        }),
      ),
    ).toBe(true);
    expect(
      isClientDisconnectError(Object.assign(new Error("cancelled"), { name: "AbortError" })),
    ).toBe(true);
  });

  it("does not suppress unrelated server errors", () => {
    expect(isClientDisconnectError(new Error("database unavailable"))).toBe(false);
    expect(
      isClientDisconnectError(Object.assign(new Error("socket error"), { code: "EPIPE" })),
    ).toBe(false);
  });
});
