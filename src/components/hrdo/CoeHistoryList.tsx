import { Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/app/PageHeader";
import { COE_HISTORY_LABELS, coeReference, type CoeHistoryEntry } from "@/lib/hrdo";
import { fmtDateTime } from "@/lib/format";

/** Paperless audit trail of the request: every status change is recorded. */
export function CoeHistoryList({
  entries,
  showRequest = false,
  empty = "No history has been recorded for this request yet.",
}: {
  entries: Array<CoeHistoryEntry & { employeeName?: string; employeeNumber?: string }>;
  showRequest?: boolean;
  empty?: string;
}) {
  if (!entries.length) return <EmptyState title={empty} />;

  return (
    <ol className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.id} className="relative min-w-0 border-l-2 border-primary/25 pl-3">
          <span
            className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-primary"
            aria-hidden
          />
          <p className="text-sm font-semibold">{COE_HISTORY_LABELS[entry.type]}</p>
          <p className="mt-0.5 break-words text-sm text-muted-foreground">{entry.message}</p>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {entry.actorName} · {fmtDateTime(entry.happenedAt)}
            {showRequest && (
              <>
                {" · "}
                {entry.employeeName ? `${entry.employeeName} — ` : ""}
                <Link
                  to="/hrdo/coe/$id"
                  params={{ id: entry.requestId }}
                  className="font-medium text-primary hover:underline"
                >
                  {coeReference(entry.requestId)}
                </Link>
              </>
            )}
          </p>
        </li>
      ))}
    </ol>
  );
}
