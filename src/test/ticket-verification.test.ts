import { describe, expect, it } from "vitest";
import {
  createTicketVerificationToken,
  isoApprovalTimestamp,
  readTicketVerificationToken,
  ticketDataDigest,
} from "@/lib/ticket-verification";

const claims = {
  requestId: "f22d60d3-2a99-4f10-a3f9-78ba139a99aa",
  approvedAt: "2025-05-20T12:30:00Z",
  ticketDigest: "a".repeat(64),
};

describe("ticket verification tokens", () => {
  it("round-trips server-signed approval claims", () => {
    const token = createTicketVerificationToken(claims, "a-test-secret-that-is-not-used-in-prod");
    expect(readTicketVerificationToken(token, "a-test-secret-that-is-not-used-in-prod")).toEqual(
      claims,
    );
  });

  it("rejects tokens with a changed payload, signature, or secret", () => {
    const token = createTicketVerificationToken(claims, "a-test-secret-that-is-not-used-in-prod");
    const [payload, signature] = token.split(".");
    expect(
      readTicketVerificationToken(
        `${payload}A.${signature}`,
        "a-test-secret-that-is-not-used-in-prod",
      ),
    ).toBeNull();
    expect(
      readTicketVerificationToken(
        `${payload}.${signature}A`,
        "a-test-secret-that-is-not-used-in-prod",
      ),
    ).toBeNull();
    expect(
      readTicketVerificationToken(token, "a-different-test-secret-that-is-long-enough"),
    ).toBeNull();
  });

  it("normalizes MySQL approval timestamps", () => {
    expect(isoApprovalTimestamp("2025-05-20 12:30:00")).toBe("2025-05-20T12:30:00Z");
  });

  it("binds the verification reference to the official dates and destinations", () => {
    const original = {
      requestDate: "2025-05-18",
      dateStart: "2025-06-01",
      dateEnd: "2025-06-02",
      destinations: ["Lyceum of Alabang", "Manila"],
    };
    expect(ticketDataDigest(original)).not.toBe(
      ticketDataDigest({ ...original, dateStart: "2025-06-03" }),
    );
    expect(ticketDataDigest(original)).not.toBe(
      ticketDataDigest({ ...original, destinations: ["Different destination"] }),
    );
  });
});
