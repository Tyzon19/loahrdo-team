import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Mail, MailOpen, RefreshCw } from "lucide-react";
import { PageHeader, Section, EmptyState } from "@/components/app/PageHeader";
import { LoadingPanel } from "@/components/app/LoadingPanel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  getRequestFn,
  listNotificationsFn,
  notificationImageFn,
  markNotificationReadFn,
} from "@/server-functions";
import { unwrap } from "@/lib/api";
import { fmtDateTime, fmtRange } from "@/lib/format";
import { splitReturnedReason } from "@/lib/email-template";
import { STAGES, STATUS_LABELS } from "@/lib/workflow";
import type { EmailMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/notifications")({
  validateSearch: (search: Record<string, unknown>) => ({
    view: search["view"] === "detail" || search["view"] === "list" ? search["view"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: `Notifications — ${SITE.name}` },
      { name: "description", content: "In-app notifications for vehicle requests." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Notifications,
});

function Notifications() {
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => unwrap(listNotificationsFn()),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const items = notifications.data ?? [];
  const selectedEmail = items.find((item) => item.id === selectedId) ?? null;
  const email = selectedEmail ?? items[0] ?? null;
  const showMobileDetails = search.view === "detail" && Boolean(selectedEmail);

  async function openEmail(item: EmailMessage) {
    setSelectedId(item.id);
    await navigate({ search: { view: "detail" }, resetScroll: false });
    if (item.read || item.kind === "trip_ticket_reminder") return;

    try {
      const result = await markNotificationReadFn({ data: item.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch {
      toast.error("We couldn't mark this notification as read. Please try again.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className={cn(showMobileDetails && "hidden lg:block")}>
        <PageHeader
          title="Notifications"
          description="In-app alerts for requests that need your attention."
        />
      </div>
      {notifications.isPending ? (
        <LoadingPanel label="Loading notifications" />
      ) : notifications.isError ? (
        <Section title="Inbox">
          <div className="p-6 text-center" role="alert">
            <p className="font-medium">We couldn&apos;t load notifications.</p>
            <Button className="mt-4" variant="outline" onClick={() => void notifications.refetch()}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Try again
            </Button>
          </div>
        </Section>
      ) : items.length === 0 ? (
        <Section title="Notifications">
          <EmptyState title="No notifications yet.">
            You&apos;ll see an alert here when a request needs your review, approval, or revision.
          </EmptyState>
        </Section>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div
            className={cn(
              "panel min-w-0 overflow-hidden lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto",
              showMobileDetails && "hidden lg:block",
            )}
          >
            <ul aria-label="Your notifications">
              {items.map((item) => {
                const preview = `${item.heading} ${item.body}`.trim();
                return (
                  <li key={item.id} className="min-w-0">
                    <button
                      onClick={() => void openEmail(item)}
                      aria-label={`Open notification: ${item.subject}`}
                      aria-current={email?.id === item.id ? "true" : undefined}
                      className={cn(
                        "flex w-full min-w-0 items-start gap-3 border-b px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4 sm:py-3",
                        email?.id === item.id && "bg-accent",
                      )}
                    >
                      {item.read ? (
                        <MailOpen
                          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      ) : (
                        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-sm leading-5",
                            !item.read && "font-semibold text-foreground",
                          )}
                        >
                          {item.subject}
                        </span>
                        <span className="mt-0.5 block h-4 truncate text-xs leading-4 text-muted-foreground">
                          {preview}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                          {fmtDateTime(item.at)}
                        </span>
                      </span>
                      {!item.read && (
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                          aria-label="Unread"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {email && (
            <div className={cn("min-w-0", !showMobileDetails && "hidden lg:block")}>
              <div className="mb-3 flex items-center gap-2 lg:hidden">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-ml-2"
                  onClick={() => {
                    setSelectedId(null);
                    void navigate({ search: { view: "list" }, resetScroll: false });
                  }}
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  Notifications
                </Button>
              </div>
              <NotificationPreview email={email} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationPreview({ email }: { email: EmailMessage }) {
  const request = useQuery({
    queryKey: ["request", email.requestId],
    queryFn: () => unwrap(getRequestFn({ data: email.requestId })),
  });
  const image = useQuery({
    queryKey: ["notification-image", email.id],
    queryFn: () => unwrap(notificationImageFn({ data: email.id })),
    enabled: email.kind === "approved_requester",
  });
  const photo = image.data ?? null;
  const stage = email.stage ? STAGES.find((item) => item.key === email.stage) : undefined;
  const r = request.data?.request;
  const returnedMessage = email.kind === "returned" ? splitReturnedReason(email.body) : undefined;
  const deliveryStatus = (email.emailDeliveryStatus ?? "").trim().toLowerCase();
  const deliveryStatusText =
    deliveryStatus === "sent"
      ? `Email sent to ${email.toEmail}.`
      : deliveryStatus === "failed"
        ? `Email not sent.${email.emailDeliveryMessage ? ` ${email.emailDeliveryMessage}` : ""}`
        : deliveryStatus === "pending"
          ? "Email delivery is pending or the delivery result has not been recorded yet."
          : "This is an in-app notification. Email status is unavailable for older notifications.";

  function openRequest() {
    const target =
      email.kind === "returned"
        ? `/revise/${email.requestId}`
        : email.kind === "approved_requester" || email.kind === "trip_ticket_reminder"
          ? `/print/${email.requestId}`
          : `/requests/${email.requestId}`;
    window.location.assign(target);
  }

  return (
    <article className="panel min-w-0 overflow-hidden" aria-label="Notification details">
      <div className="min-w-0 border-b bg-muted px-4 py-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">
        <p>
          <strong className="font-medium">To:</strong>{" "}
          <span className="font-medium">
            {email.toName} &lt;{email.toEmail}&gt;
          </span>
        </p>
        <p className="mt-1 break-words">
          <strong className="font-medium">Subject:</strong>{" "}
          <span className="font-medium [overflow-wrap:anywhere]">{email.subject}</span>
        </p>
        <p
          className={cn(
            "mt-1",
            deliveryStatus === "failed" && "text-destructive",
            deliveryStatus === "sent" && "text-success",
            deliveryStatus === "pending" && "text-warning",
          )}
        >
          {deliveryStatusText}
        </p>
      </div>
      <div className="mx-auto min-w-0 max-w-xl p-4 sm:p-5">
        <div className="border-b-4 border-primary pb-3">
          <p className="font-serif text-base font-bold text-primary">Lyceum of Alabang Inc.</p>
          <p className="text-xs text-muted-foreground">
            Physical Facilities Management Office / Vehicle Reservation and Trip Ticket
          </p>
        </div>
        <p className="mt-4 text-sm">
          Dear <span className="font-medium">{email.toName}</span>,
        </p>
        <p className="mt-2 break-words text-base font-semibold [overflow-wrap:anywhere]">
          {email.heading}
        </p>
        {!photo && returnedMessage ? (
          <div className="mt-2 space-y-1 break-words text-sm [overflow-wrap:anywhere]">
            {returnedMessage.body && <p>{returnedMessage.body}</p>}
            {returnedMessage.reason && (
              <p className="text-[13px] font-bold text-[#ff3333]">
                Reason: {returnedMessage.reason}
              </p>
            )}
          </div>
        ) : (
          !photo && (
            <p className="mt-2 break-words text-sm [overflow-wrap:anywhere]">{email.body}</p>
          )
        )}
        {photo && (
          <img
            src={photo}
            alt={`Trip ticket ${r?.number ?? ""}`}
            className="mt-4 block h-auto max-w-full border border-foreground/40 bg-white"
          />
        )}
        {!photo && r && (
          <table className="data-table mt-4 w-full table-fixed text-sm">
            <tbody className="[&_td]:break-words [&_td]:border-b [&_td]:py-1.5 [&_td]:align-top [&_td]:[overflow-wrap:anywhere] [&_td:first-child]:w-28 [&_td:first-child]:pr-2 [&_td:first-child]:text-muted-foreground sm:[&_td:first-child]:w-40 sm:[&_td:first-child]:pr-3">
              <tr>
                <td className="font-medium">Request Number</td>
                <td className="font-medium">{r.number}</td>
              </tr>
              <tr>
                <td className="font-medium">Requisitioner</td>
                <td className="font-medium">
                  {r.requisitionerName}, {r.department}
                </td>
              </tr>
              <tr>
                <td className="font-medium">Purpose</td>
                <td className="font-medium">{r.purpose}</td>
              </tr>
              <tr>
                <td className="font-medium">Destination</td>
                <td className="font-medium">{r.destinations.join("; ")}</td>
              </tr>
              <tr>
                <td className="font-medium">Travel Dates</td>
                <td className="font-medium">{fmtRange(r.dateStart, r.dateEnd)}</td>
              </tr>
              <tr>
                <td className="font-medium">Current Stage</td>
                <td className="font-medium">
                  {stage ? `${stage.label} — ${stage.title}` : STATUS_LABELS[r.status]}
                </td>
              </tr>
            </tbody>
          </table>
        )}
        <button
          onClick={openRequest}
          className="mt-5 inline-flex w-full items-center justify-center rounded-sm bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:w-auto"
        >
          {email.ctaLabel}
        </button>
      </div>
    </article>
  );
}
