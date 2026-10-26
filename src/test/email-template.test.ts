import { describe, expect, it } from "vitest";
import {
  renderEmailTemplate,
  renderRegistrationOtpEmail,
  splitReturnedReason,
} from "@/lib/email-template";
import type { EmailMessage } from "@/lib/types";

const message: EmailMessage = {
  id: "notification-id",
  at: "2026-10-23T00:00:00.000Z",
  toUserId: "user-id",
  toName: "Alex User",
  toEmail: "alex@example.com",
  subject: "[LOA Vehicle Request] Trip Ticket Ready — VR-2026-0012",
  requestId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  requestNumber: "VR-2026-0012",
  kind: "approved_requester",
  heading: "Your vehicle request has received final approval.",
  body: "Your request has been approved.\nThe trip ticket is ready.",
  ctaLabel: "View Trip Ticket",
  read: false,
};

describe("professional email template", () => {
  it("separates return reasons from the notification body", () => {
    expect(
      splitReturnedReason(
        "Returned by the assigned alternate for the Director. Reason: cancelled due to bad weather",
      ),
    ).toEqual({
      body: "Returned by the assigned alternate for the Director.",
      reason: "cancelled due to bad weather",
    });
    expect(splitReturnedReason("A request is waiting for your review.")).toEqual({
      body: "A request is waiting for your review.",
      reason: undefined,
    });
  });

  it("renders a responsive HTML email and a plain-text alternative", () => {
    const rendered = renderEmailTemplate(
      message,
      "http://localhost:8080",
      undefined,
      "loa-header-logo",
    );

    expect(rendered.subject).toBe(message.subject);
    expect(rendered.html).toContain('name="viewport"');
    expect(rendered.html).toContain('src="cid:loa-header-logo"');
    expect(rendered.html).toContain("Kind regards,");
    expect(rendered.html).toContain("Lyceum of Alabang");
    expect(rendered.html).toContain("http://localhost:8080/print/");
    expect(rendered.html).toContain("View Trip Ticket");
    expect(rendered.text).toContain("Dear Alex User,");
    expect(rendered.text).toContain("http://localhost:8080/print/");
  });

  describe("registration verification email template", () => {
    it("renders a branded OTP email in HTML and plain text", () => {
      const rendered = renderRegistrationOtpEmail(
        {
          recipientName: "Mark Joseph Turingan",
          code: "482913",
          expiresInMinutes: 10,
        },
        "loa-logo",
      );

      expect(rendered.subject).toContain("Verify your email address");
      expect(rendered.html).toContain('src="cid:loa-logo"');
      expect(rendered.html).toContain("482913");
      expect(rendered.html).toContain("expires in <strong>10 minutes</strong>");
      expect(rendered.text).toContain("482913");
      expect(rendered.text).toContain("This code expires in 10 minutes.");
    });

    it("uses standard verification copy and escapes user-controlled content", () => {
      const rendered = renderRegistrationOtpEmail({
        recipientName: "<script>Test</script>",
        code: "482913",
        expiresInMinutes: 10,
      });

      expect(rendered.subject).toBe("[LOA Vehicle Request] Verify your email address");
      expect(rendered.html).toContain("&lt;script&gt;Test&lt;/script&gt;");
      expect(rendered.html).not.toMatch(/sample|preview|demo/i);
      expect(rendered.text).not.toMatch(/sample|preview|demo/i);
      expect(rendered.html).not.toContain("<script>Test</script>");
    });

    it("rejects malformed codes and invalid expiry values", () => {
      expect(() =>
        renderRegistrationOtpEmail({
          recipientName: "Alex User",
          code: "12345",
          expiresInMinutes: 10,
        }),
      ).toThrow("six digits");
      expect(() =>
        renderRegistrationOtpEmail({
          recipientName: "Alex User",
          code: "123456",
          expiresInMinutes: 0,
        }),
      ).toThrow("positive number");
    });
  });

  it("includes escaped trip details and the inline approved ticket image", () => {
    const rendered = renderEmailTemplate(
      message,
      "https://vrtt.example.edu",
      `/print/${message.requestId}`,
      "loa-logo",
      "ticket-image",
      {
        department: "CCS",
        purpose: "<field trip>",
        destinations: ["SMX"],
        passengers: 6,
        dateStart: "Oct 24, 2026",
        dateEnd: "Oct 24, 2026",
        currentStage: "Reviewed By — Head of Transport Services",
      },
    );

    expect(rendered.html).toContain('src="cid:ticket-image"');
    expect(rendered.html).toContain("Official trip ticket");
    expect(rendered.html).toContain("&lt;field trip&gt;");
    expect(rendered.text).toContain("The official trip-ticket image is included in this email.");
    expect(rendered.text).toContain("Destination: SMX");
    expect(rendered.text).toContain("Current Stage: Reviewed By — Head of Transport Services");
  });

  it("uses the correct destination for returned and approval-action emails", () => {
    const returned = renderEmailTemplate(
      {
        ...message,
        kind: "returned",
        body: "Returned by the Director for Administration. Reason: Please correct the travel dates.",
      },
      "https://vrtt.example.edu",
    );
    const action = renderEmailTemplate(
      { ...message, kind: "action_approve" },
      "https://vrtt.example.edu",
    );
    const reminder = renderEmailTemplate(
      { ...message, kind: "trip_ticket_reminder", ctaLabel: "Prepare Trip Ticket" },
      "https://vrtt.example.edu",
    );
    expect(returned.html).toContain("https://vrtt.example.edu/revise/");
    expect(returned.html).toContain("background-color:#fef2f2");
    expect(returned.html).toContain("border-left:4px solid #dc2626");
    expect(returned.html).toContain("<strong");
    expect(returned.html).toContain("Reason for return");
    expect(returned.html).toContain("Please correct the travel dates.");
    expect(returned.html).not.toContain("Reason: Please correct the travel dates.</p>");
    expect(returned.text).toContain("Reason: Please correct the travel dates.");
    expect(action.html).toContain("https://vrtt.example.edu/requests/");
    expect(reminder.html).toContain("https://vrtt.example.edu/print/");
    expect(reminder.html).toContain("Prepare Trip Ticket");
  });
  it("escapes the return reason inside the warning block", () => {
    const returned = renderEmailTemplate(
      {
        ...message,
        kind: "returned",
        body: "Returned by the Director. Reason: <script>Update the dates</script>",
      },
      "https://vrtt.example.edu",
    );
    expect(returned.html).toContain("&lt;script&gt;Update the dates&lt;/script&gt;");
    expect(returned.html).not.toContain("<script>");
  });
  it("escapes message content before inserting it into HTML", () => {
    const rendered = renderEmailTemplate(
      { ...message, toName: "<script>alert(1)</script>", body: "<img src=x onerror=alert(1)>" },
      "https://vrtt.example.edu",
    );

    expect(rendered.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(rendered.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(rendered.html).not.toContain("<script>");
  });

  it("rejects invalid or unsafe application URLs", () => {
    expect(() => renderEmailTemplate(message, "javascript:alert(1)")).toThrow(
      "must use HTTP or HTTPS",
    );
    expect(() => renderEmailTemplate(message, "not a URL")).toThrow(
      "requires a valid application URL",
    );
    expect(() =>
      renderEmailTemplate(message, "https://vrtt.example.edu", "//evil.example"),
    ).toThrow("application-relative path");
  });
});
