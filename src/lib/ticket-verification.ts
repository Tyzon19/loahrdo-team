import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface TicketVerificationClaims {
  requestId: string;
  approvedAt: string;
  ticketDigest: string;
}

export interface TicketVerificationData {
  requestDate: string;
  dateStart: string;
  dateEnd: string;
  destinations: string[];
}

function assertSecretStrength(secret: string) {
  if (Buffer.byteLength(secret) < 32) {
    throw new Error("TICKET_VERIFICATION_SECRET must contain at least 32 bytes.");
  }
}

export function ticketDataDigest(data: TicketVerificationData): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

export function createTicketVerificationToken(
  claims: TicketVerificationClaims,
  secret: string,
): string {
  assertSecretStrength(secret);
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readTicketVerificationToken(
  token: string,
  secret: string,
): TicketVerificationClaims | null {
  assertSecretStrength(secret);
  if (token.length > 512) return null;
  const [payload, signature, extra] = token.split(".");
  if (
    !payload ||
    !signature ||
    extra ||
    !/^[A-Za-z0-9_-]+$/.test(payload) ||
    !/^[A-Za-z0-9_-]+$/.test(signature)
  ) {
    return null;
  }

  const expected = createHmac("sha256", secret).update(payload).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
    if (typeof claims !== "object" || claims === null) return null;
    const requestId = "requestId" in claims ? claims.requestId : undefined;
    const approvedAt = "approvedAt" in claims ? claims.approvedAt : undefined;
    const ticketDigest = "ticketDigest" in claims ? claims.ticketDigest : undefined;
    if (
      typeof requestId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(requestId) ||
      typeof approvedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(approvedAt) ||
      typeof ticketDigest !== "string" ||
      !/^[a-f0-9]{64}$/.test(ticketDigest)
    ) {
      return null;
    }
    return {
      requestId,
      approvedAt,
      ticketDigest,
    };
  } catch {
    return null;
  }
}

export function isoApprovalTimestamp(value: string): string {
  return `${value.replace(" ", "T")}Z`;
}
