import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailMessage, VehicleRequest } from "@/lib/types";
import {
  sendCoeStatusEmail,
  sendPermissionSlipEmail,
  sendTemporaryPasswordEmail,
  sendWorkflowEmails,
} from "@/server/gmail";

const request: VehicleRequest = {
  id: "request-1",
  number: "VR-2026-0012",
  createdAt: "2026-10-23T00:00:00.000Z",
  submittedAt: "2026-10-23T00:00:00.000Z",
  requisitionerId: "requester-1",
  requisitionerName: "Alex Requester",
  department: "CCS",
  destinations: ["Godofredo Ragas Street"],
  passengers: 6,
  dateStart: "2026-10-24",
  dateEnd: "2026-10-24",
  timeNeeded: "08:00",
  purpose: "Academic field visit",
  status: "pending_review",
  attempt: 1,
  signatures: [],
  history: [],
  dispatch: {},
};

const message: EmailMessage = {
  id: "notification-1",
  at: "2026-10-23T00:00:00.000Z",
  toUserId: "signatory-1",
  toName: "Alex Signatory",
  toEmail: "signatory@example.edu",
  subject: "[LOA Vehicle Request] Action Required — VR-2026-0012",
  requestId: request.id,
  requestNumber: request.number,
  kind: "action_review",
  stage: "review",
  heading: "A vehicle request is waiting for your review.",
  body: "Please review this request.",
  ctaLabel: "Review and Sign Request",
  read: false,
};

describe("Gmail workflow delivery", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SITE_URL", "https://vrtt.example.edu");
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
    vi.stubEnv("GOOGLE_REFRESH_TOKEN", "test-refresh-token");
    vi.stubEnv("GOOGLE_SENDER_EMAIL", "sender@example.com");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends the workflow message to its configured recipient using the verified sender", async () => {
    const sentMessages: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url === "https://oauth2.googleapis.com/token") {
          return Response.json({ access_token: "mock-access-token" });
        }
        if (url === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send") {
          const body = JSON.parse(String(init?.body)) as { raw: string };
          sentMessages.push(Buffer.from(body.raw, "base64url").toString("utf8"));
          return Response.json({});
        }
        throw new Error(`Unexpected email request: ${url}`);
      }),
    );

    const result = await sendWorkflowEmails([message], request);

    expect(result).toEqual({
      sent: true,
      delivered: 1,
      failed: 0,
      recipientResults: [{ notificationId: message.id, sent: true }],
    });
    expect(sentMessages).toHaveLength(1);
    const sentMime = sentMessages[0] ?? "";
    expect(sentMime).toContain("To: signatory@example.edu");
    expect(sentMime).not.toContain("[TEST]");
    const textPart = sentMime.match(
      /Content-Type: text\/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--loa_alt_[^\r\n]+/,
    )?.[1];
    expect(textPart).toBeDefined();
    expect(Buffer.from(textPart?.replace(/\s/g, "") ?? "", "base64").toString("utf8")).toContain(
      "https://vrtt.example.edu/requests/request-1",
    );
  });

  it("emails a generated temporary password to the account address", async () => {
    let sentMime = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url === "https://oauth2.googleapis.com/token") {
          return Response.json({ access_token: "mock-access-token" });
        }
        if (url === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send") {
          const body = JSON.parse(String(init?.body)) as { raw: string };
          sentMime = Buffer.from(body.raw, "base64url").toString("utf8");
          return Response.json({});
        }
        throw new Error(`Unexpected email request: ${url}`);
      }),
    );

    const result = await sendTemporaryPasswordEmail({
      recipientName: "Alex Signatory",
      recipientEmail: "new.signatory@example.edu",
      temporaryPassword: "one-time-secret",
      signatoryTitle: "Head of Transport Services",
    });

    expect(result).toEqual({ sent: true, delivered: 1, failed: 0 });
    expect(sentMime).toContain("To: new.signatory@example.edu");
    const htmlPart = sentMime.match(
      /Content-Type: text\/html; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--loa_alt_[^\r\n]+/,
    )?.[1];
    expect(htmlPart).toBeDefined();
    expect(Buffer.from(htmlPart?.replace(/\s/g, "") ?? "", "base64").toString("utf8")).toContain(
      "one-time-secret",
    );
    expect(sentMime).not.toContain("To: sender@example.com");
  });

  it("highlights a COE rejection reason in the red warning style and escapes its contents", async () => {
    let sentMime = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url === "https://oauth2.googleapis.com/token") {
          return Response.json({ access_token: "mock-access-token" });
        }
        if (url === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send") {
          const body = JSON.parse(String(init?.body)) as { raw: string };
          sentMime = Buffer.from(body.raw, "base64url").toString("utf8");
          return Response.json({});
        }
        throw new Error(`Unexpected email request: ${url}`);
      }),
    );

    const result = await sendCoeStatusEmail({
      recipientName: "Mark Turingan",
      recipientEmail: "mark@example.edu",
      requestId: "coe-request-1",
      status: "rejected",
      title: "Your COE request was not approved.",
      message: "<script>invalid reason</script>",
    });

    expect(result).toMatchObject({ sent: true, delivered: 1, failed: 0 });
    const htmlPart = sentMime.match(
      /Content-Type: text\/html; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--loa_alt_[^\r\n]+/,
    )?.[1];
    const html = Buffer.from(htmlPart?.replace(/\s/g, "") ?? "", "base64").toString("utf8");
    expect(html).toContain("background-color:#fef2f2");
    expect(html).toContain("border-left:4px solid #dc2626");
    expect(html).toContain("Reason for rejection");
    expect(html).toContain("&lt;script&gt;invalid reason&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("This is an automated notification. Please do not reply to this email.");
    expect(sentMime).not.toContain("image/png");
    expect(sentMime).not.toContain("loa-loading.png");
  });

  it("adds a root message id for the first COE status email", async () => {
    let sentMime = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url === "https://oauth2.googleapis.com/token") {
          return Response.json({ access_token: "mock-access-token" });
        }
        if (url === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send") {
          const body = JSON.parse(String(init?.body)) as { raw: string };
          sentMime = Buffer.from(body.raw, "base64url").toString("utf8");
          return Response.json({});
        }
        throw new Error(`Unexpected email request: ${url}`);
      }),
    );

    await sendCoeStatusEmail({
      recipientName: "Mark Turingan",
      recipientEmail: "mark@example.edu",
      requestId: "coe-request-root",
      status: "under_review",
      title: "Your COE request is under review.",
      message: "HRDO has verified your employee information.",
    });

    expect(sentMime).toContain("Message-ID: <coe-coe-request-root@loa.local>");
    expect(sentMime).not.toContain("In-Reply-To:");
  });

  it("reports missing approved sender configuration before attempting delivery", async () => {
    vi.stubEnv("GOOGLE_SENDER_EMAIL", "");
    const fetch = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetch);

    const result = await sendWorkflowEmails([message], request);

    expect(result).toMatchObject({
      sent: false,
      delivered: 0,
      failed: 1,
      message: expect.stringContaining("GOOGLE_SENDER_EMAIL"),
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("Missing Gmail sender configuration: GOOGLE_SENDER_EMAIL"),
    );
  });

  it("sends without requiring the OpenID userinfo endpoint during delivery", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "mock-access-token" });
      }
      if (String(input) === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send") {
        return Response.json({});
      }
      throw new Error(`Unexpected email request: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetch);

    const result = await sendWorkflowEmails([message], request);

    expect(result).toMatchObject({
      sent: true,
      delivered: 1,
      failed: 0,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("explains how to restore Gmail send permission after a Gmail API authorization failure", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "mock-access-token" });
      }
      if (String(input) === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send") {
        return new Response(null, { status: 403 });
      }
      throw new Error(`Unexpected email request: ${String(input)}`);
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetch);

    const result = await sendWorkflowEmails([message], request);

    expect(result).toMatchObject({
      sent: false,
      delivered: 0,
      failed: 1,
      message: expect.stringContaining("grant Gmail send permission"),
    });
    expect(log).toHaveBeenCalledWith("[gmail] Message send failed (403).");
  });

  it("sends a Permission Slip receipt to the employee with its PNG attachment", async () => {
    let sentMime = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url === "https://oauth2.googleapis.com/token") {
          return Response.json({ access_token: "mock-access-token" });
        }
        if (url === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send") {
          const body = JSON.parse(String(init?.body)) as { raw: string };
          sentMime = Buffer.from(body.raw, "base64url").toString("utf8");
          return Response.json({});
        }
        throw new Error(`Unexpected email request: ${url}`);
      }),
    );

    const result = await sendPermissionSlipEmail({
      kind: "employee_approved",
      recipientName: "Alex Requester",
      recipientEmail: "alex@example.edu",
      permissionId: "permission-1",
      employeeName: "Alex Requester",
      department: "HRDO",
      requestedDate: "2026-11-12",
      timeOut: "10:30",
      timeIn: "14:00",
      reason: "Official school errand",
      attachment: {
        filename: "permission-slip-permission-1.png",
        mime: "image/png",
        content: Buffer.from("permission-receipt"),
      },
    });

    expect(result).toEqual({ sent: true, delivered: 1, failed: 0 });
    expect(sentMime).toContain("To: alex@example.edu");
    expect(sentMime).toContain('Content-Disposition: attachment; filename="permission-slip-permission-1.png"');
    expect(sentMime).toContain(Buffer.from("permission-receipt").toString("base64"));
  });
});
