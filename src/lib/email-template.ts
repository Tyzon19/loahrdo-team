import type { EmailMessage } from "./types";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface EmailTicketPreview {
  department: string;
  purpose: string;
  destinations: string[];
  passengers: number;
  dateStart: string;
  dateEnd: string;
}

export interface RegistrationOtpEmailInput {
  recipientName: string;
  code: string;
  expiresInMinutes: number;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function requestPath(message: EmailMessage): string {
  if (message.kind === "returned") return `/revise/${encodeURIComponent(message.requestId)}`;
  if (message.kind === "approved_requester") {
    return `/print/${encodeURIComponent(message.requestId)}`;
  }
  return `/requests/${encodeURIComponent(message.requestId)}`;
}

function absoluteActionUrl(baseUrl: string, path: string): string {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new Error("The email template requires a valid application URL.");
  }

  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) {
    throw new Error("The email template application URL must use HTTP or HTTPS.");
  }

  return new URL(path, base.origin).toString();
}

export function renderEmailTemplate(
  message: EmailMessage,
  baseUrl: string,
  actionPath = requestPath(message),
  logoContentId = "loa-header-logo",
  ticketImageContentId?: string,
  ticketPreview?: EmailTicketPreview,
): RenderedEmail {
  if (!actionPath.startsWith("/") || actionPath.startsWith("//")) {
    throw new Error("The email action path must be an application-relative path.");
  }
  const actionUrl = absoluteActionUrl(baseUrl, actionPath);
  const safe = {
    actionUrl: escapeHtml(actionUrl),
    body: escapeHtml(message.body).replace(/\r?\n/g, "<br>"),
    ctaLabel: escapeHtml(message.ctaLabel),
    heading: escapeHtml(message.heading),
    name: escapeHtml(message.toName),
    number: escapeHtml(message.requestNumber),
    subject: escapeHtml(message.subject),
    logoContentId: escapeHtml(logoContentId),
    ticketContentId: ticketImageContentId ? escapeHtml(ticketImageContentId) : undefined,
  };
  const ticketRows = ticketPreview
    ? [
        ["Office", ticketPreview.department],
        ["Purpose", ticketPreview.purpose],
        ["Destination", ticketPreview.destinations.join(", ")],
        [
          "Travel date",
          ticketPreview.dateStart === ticketPreview.dateEnd
            ? ticketPreview.dateStart
            : `${ticketPreview.dateStart} to ${ticketPreview.dateEnd}`,
        ],
        ["Passengers", String(ticketPreview.passengers)],
      ]
    : [];
  const safeTicketRows = ticketRows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 12px;border-bottom:1px solid #e5e9f0;color:#687386;font-size:12px;line-height:1.45;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:10px 12px;border-bottom:1px solid #e5e9f0;color:#353b45;font-size:13px;line-height:1.45;vertical-align:top;font-weight:600;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const text = [
    `Dear ${message.toName},`,
    "",
    message.heading,
    message.body,
    "",
    `Request number: ${message.requestNumber}`,
    ...ticketRows.map(([label, value]) => `${label}: ${value}`),
    ...(ticketImageContentId ? ["The official trip-ticket image is included in this email."] : []),
    `${message.ctaLabel}: ${actionUrl}`,
    "",
    "Lyceum of Alabang",
    "Physical Facilities Management Office",
    "This is an automated notification from the LOA Vehicle Reservation & Trip Ticket system.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${safe.subject}</title>
    <style>
      @media only screen and (max-width: 620px) {
        .email-shell { width: 100% !important; }
        .email-content { padding: 24px 20px !important; }
        .email-button { display: block !important; text-align: center !important; }
        .email-logo { max-width: 170px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#f3f5f8;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${safe.heading} Request ${safe.number}.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3f5f8;">
      <tr>
        <td align="center" style="padding:32px 12px;">
          <table role="presentation" class="email-shell" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e2e7ef;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:30px 32px 8px;">
                <img class="email-logo" src="cid:${safe.logoContentId}" width="190" alt="Lyceum of Alabang" style="display:block;width:190px;max-width:100%;height:auto;border:0;">
              </td>
            </tr>
            <tr>
              <td class="email-content" style="padding:32px;">
                <p style="margin:0 0 18px;color:#353b45;font-size:14px;line-height:1.6;">Dear ${safe.name},</p>
                <h1 style="margin:0 0 14px;color:#202833;font-size:18px;line-height:1.45;font-weight:600;">${safe.heading}</h1>
                <p style="margin:0 0 22px;color:#353b45;font-size:14px;line-height:1.65;">${safe.body}</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;background-color:#f7f8fa;border:1px solid #e5e9f0;border-radius:6px;">
                  <tr>
                    <td colspan="2" style="padding:12px;color:#687386;font-size:11px;line-height:1.4;letter-spacing:.06em;">REQUEST NUMBER</td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding:0 12px 12px;color:#172b4d;font-size:15px;line-height:1.4;font-weight:700;">${safe.number}</td>
                  </tr>
                  ${safeTicketRows}
                </table>
                ${safe.ticketContentId ? `<h2 style="margin:0 0 10px;color:#202833;font-size:15px;line-height:1.4;">Official trip ticket</h2><p style="margin:0 0 12px;color:#687386;font-size:12px;line-height:1.5;">A copy is included below. You can also download the image from this email.</p><img src="cid:${safe.ticketContentId}" alt="Approved trip ticket ${safe.number}" width="536" style="display:block;width:100%;max-width:536px;height:auto;margin:0 0 24px;border:1px solid #d9dee7;">` : ""}
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#1f3b68" style="border-radius:5px;">
                      <a class="email-button" href="${safe.actionUrl}" style="display:inline-block;padding:13px 22px;border:1px solid #1f3b68;border-radius:5px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;line-height:1.2;">${safe.ctaLabel}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:22px 0 0;color:#687386;font-size:12px;line-height:1.6;">For your security, sign in to the LOA Vehicle Reservation &amp; Trip Ticket system before viewing or taking action on this request.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px 26px;">
                <p style="margin:0;color:#353b45;font-size:14px;line-height:1.6;">Kind regards,<br><strong>Lyceum of Alabang<br>Vehicle Reservation &amp; Trip Ticket Team</strong></p>
                <p style="margin:20px 0 0;color:#687386;font-size:11px;line-height:1.6;">This is an automated notification. Please do not reply to this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject: message.subject, html, text };
}

export function renderRegistrationOtpEmail(
  input: RegistrationOtpEmailInput,
  logoContentId = "loa-header-logo",
): RenderedEmail {
  if (!/^\d{6}$/.test(input.code)) {
    throw new Error("The registration verification code must contain six digits.");
  }
  if (!Number.isInteger(input.expiresInMinutes) || input.expiresInMinutes < 1) {
    throw new Error("The registration code expiry must be a positive number of minutes.");
  }

  const name = escapeHtml(input.recipientName);
  const code = escapeHtml(input.code);
  const logo = escapeHtml(logoContentId);
  const ignoredNotice = "If you did not request this code, you can safely ignore this email.";
  const subject = "[LOA Vehicle Request] Verify your email address";
  const text = [
    `Dear ${input.recipientName},`,
    "",
    "Use this verification code to continue creating your LOA Vehicle Reservation & Trip Ticket account:",
    input.code,
    "",
    `This code expires in ${input.expiresInMinutes} minutes.`,
    ignoredNotice,
    "",
    "Lyceum of Alabang",
    "Vehicle Reservation & Trip Ticket Team",
    "This is an automated message. Please do not reply.",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3f5f8;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3f5f8;">
      <tr><td align="center" style="padding:32px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e2e7ef;border-radius:8px;overflow:hidden;">
          <tr><td style="padding:30px 32px 8px;">
            <img src="cid:${logo}" width="190" alt="Lyceum of Alabang" style="display:block;width:190px;max-width:100%;height:auto;border:0;">
          </td></tr>
          <tr><td style="padding:24px 32px 32px;">
            <p style="margin:0 0 18px;color:#353b45;font-size:14px;line-height:1.6;">Dear ${name},</p>
            <h1 style="margin:0 0 14px;color:#202833;font-size:20px;line-height:1.4;font-weight:700;">Verify your institutional email</h1>
            <p style="margin:0 0 22px;color:#353b45;font-size:14px;line-height:1.65;">Use this one-time verification code to continue creating your LOA Vehicle Reservation &amp; Trip Ticket account.</p>
            <div style="margin:0 0 20px;padding:22px 16px;background-color:#f2f5fa;border:1px solid #dfe6f0;border-radius:6px;text-align:center;">
              <p style="margin:0 0 8px;color:#687386;font-size:11px;line-height:1.4;letter-spacing:.08em;">YOUR VERIFICATION CODE</p>
              <p style="margin:0;color:#172b4d;font-size:32px;line-height:1.3;font-weight:700;letter-spacing:.22em;">${code}</p>
            </div>
            <p style="margin:0 0 20px;color:#353b45;font-size:13px;line-height:1.6;">This code expires in <strong>${input.expiresInMinutes} minutes</strong>. For your security, do not share it with anyone.</p>
            <p style="margin:0;padding:12px 14px;background-color:#f7f8fa;border-left:3px solid #1f3b68;color:#454f5e;font-size:12px;line-height:1.6;">${escapeHtml(ignoredNotice)}</p>
          </td></tr>
          <tr><td style="padding:0 32px 26px;">
            <p style="margin:0;color:#353b45;font-size:14px;line-height:1.6;">Kind regards,<br><strong>Lyceum of Alabang<br>Vehicle Reservation &amp; Trip Ticket Team</strong></p>
            <p style="margin:18px 0 0;color:#687386;font-size:11px;line-height:1.6;">This is an automated message. Please do not reply to this email.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
