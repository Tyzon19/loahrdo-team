import { CalendarClock } from "lucide-react";
import { coeDeadlineInfo, type CoeStatus } from "@/lib/hrdo";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  overdue: "border-destructive/30 bg-danger-soft text-destructive",
  due_soon: "border-warning/30 bg-warning-soft text-warning",
  on_track: "border-border bg-muted text-muted-foreground",
  closed: "border-border bg-muted/60 text-muted-foreground",
};

export function CoeDeadlineBadge({
  deadlineAt,
  status,
  className,
}: {
  deadlineAt: string;
  status: CoeStatus;
  className?: string;
}) {
  const info = coeDeadlineInfo(deadlineAt, status);
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 whitespace-normal break-words rounded-sm border px-2 py-0.5 text-xs font-medium sm:whitespace-nowrap",
        TONE[info.state],
        className,
      )}
      title={info.detail}
    >
      <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {deadlineAt ? `Due ${fmtDate(deadlineAt)}` : "No deadline"}
      {info.state === "overdue" || info.state === "due_soon" ? (
        <span className="sr-only"> — {info.detail}</span>
      ) : null}
    </span>
  );
}

export function CoeDeadlineNote({ deadlineAt, status }: { deadlineAt: string; status: CoeStatus }) {
  const info = coeDeadlineInfo(deadlineAt, status);
  return (
    <p
      className={cn(
        "text-xs",
        info.state === "overdue"
          ? "font-medium text-destructive"
          : info.state === "due_soon"
            ? "font-medium text-warning"
            : "text-muted-foreground",
      )}
    >
      {info.label} · {info.detail}
    </p>
  );
}
