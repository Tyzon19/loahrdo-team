import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, MailOpen, RefreshCw } from "lucide-react";
import { PageHeader, Section, EmptyState } from "@/components/app/PageHeader";
import { LoadingPanel } from "@/components/app/LoadingPanel";
import { Button } from "@/components/ui/button";
import {
  getRequestFn,
  listNotificationsFn,
  notificationImageFn,
  markNotificationReadFn,
} from "@/server-functions";
import { unwrap } from "@/lib/api";
import { fmtDateTime, fmtRange } from "@/lib/format";
import { STAGES, STATUS_LABELS } from "@/lib/workflow";
import type { EmailMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/notifications")({
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
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => unwrap(listNotificationsFn()),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const items = notifications.data ?? [];
  const email = items.find((item) => item.id === selectedId) ?? items[0];

  async function openEmail(item: EmailMessage) {
    setSelectedId(item.id);
    if (item.read) return;
    const result = await markNotificationReadFn({ data: item.id });
    if (result.ok) {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description="In-app alerts for requests that need your attention."
      />
      {notifications.isPending ? (
        <LoadingPanel label="Loading notifications" rows={6} />
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
        <Section title="Inbox">
          <EmptyState title="No notifications yet.">
            You&apos;ll see an alert here when a request needs your review, approval, or revision.
          </EmptyState>
        </Section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="panel overflow-hidden">
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => void openEmail(item)}
                    className={cn(
                      "flex w-full gap-2 border-b px-3 py-2.5 text-left hover:bg-muted",
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
                    <span className="min-w-0">
                      <span className={cn("block truncate text-sm", !item.read && "font-semibold")}>
                        {item.subject}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {fmtDateTime(item.at)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {email && <NotificationPreview email={email} />}
        </div>
      )}
    </>
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

  function openRequest() {
    const target =
      email.kind === "returned"
        ? `/revise/${email.requestId}`
        : email.kind === "approved_requester"
          ? `/print/${email.requestId}`
          : `/requests/${email.requestId}`;
    window.location.assign(target);
  }

  return (
    <article className="panel overflow-hidden" aria-label="Notification preview">
      <div className="border-b bg-muted px-4 py-2 text-xs text-muted-foreground">
        <p>
          <strong className="font-medium">To:</strong>{" "}
          <span className="font-medium">
            {email.toName} &lt;{email.toEmail}&gt;
          </span>
        </p>
        <p>
          <strong className="font-medium">Subject:</strong>{" "}
          <span className="font-medium">{email.subject}</span>
        </p>
        <p className="mt-1 text-warning">
          In-app notification. Email delivery is not connected yet.
        </p>
      </div>
      <div className="mx-auto max-w-xl p-5">
        <div className="border-b-4 border-primary pb-3">
          <p className="font-serif text-base font-bold text-primary">Lyceum of Alabang Inc.</p>
          <p className="text-xs text-muted-foreground">
            Physical Facilities Management Office / Vehicle Reservation and Trip Ticket
          </p>
        </div>
        <p className="mt-4 text-sm">
          Dear <span className="font-medium">{email.toName}</span>,
        </p>
        <p className="mt-2 text-base font-semibold">{email.heading}</p>
        {!photo && <p className="mt-2 text-sm">{email.body}</p>}
        {photo && (
          <img
            src={photo}
            alt={`Trip ticket ${r?.number ?? ""}`}
            className="mt-4 w-full border border-foreground/40 bg-white"
          />
        )}
        {!photo && r && (
          <table className="mt-4 w-full text-sm">
            <tbody className="[&_td]:border-b [&_td]:py-1.5 [&_td:first-child]:w-40 [&_td:first-child]:text-muted-foreground">
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
        <p className="mt-4 text-xs text-muted-foreground">
          This link opens the request on the LOA website. You will need to sign in, review the
          details, and confirm your decision there — the notification alone does not approve
          anything.
        </p>
      </div>
    </article>
  );
}
