import {
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  CornerUpLeft,
  FileText,
  RotateCcw,
  Truck,
  Workflow,
} from "lucide-react";
import type { HistoryEvent, VehicleRequest } from "@/lib/types";
import { currentSignatures, ROLE_TITLES, stageForStatus, STAGES } from "@/lib/workflow";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
export function StageStepper({ r }: { r: VehicleRequest }) {
  const sigs = currentSignatures(r);
  const currentStageKey =
    stageForStatus(r.status)?.key ?? (r.status === "returned" ? r.lastReturn?.stage : undefined);
  const steps = [
    {
      id: "submitted",
      title: "Request submitted",
      approver: r.requisitionerName,
      status: "approved" as const,
      statusText: `Submitted · ${fmtDate(r.submittedAt)}`,
      current: false,
    },
    ...STAGES.map((stage) => {
      const signature = sigs.find((item) => item.stage === stage.key);
      const returned =
        r.status === "returned" &&
        r.lastReturn?.stage === stage.key &&
        r.lastReturn.attempt === r.attempt;
      const status = returned
        ? ("returned" as const)
        : signature
          ? ("approved" as const)
          : currentStageKey === stage.key
            ? ("pending" as const)
            : ("upcoming" as const);
      return {
        id: stage.key,
        title:
          stage.key === "review"
            ? "Transport review"
            : stage.key === "recommend"
              ? "Director recommendation"
              : "Final approval",
        approver: signature?.signerName ?? stage.title,
        status,
        statusText: returned
          ? `Returned · ${fmtDate(r.lastReturn?.at)}`
          : signature
            ? `Approved · ${fmtDate(signature.at)}`
            : status === "pending"
              ? "In progress"
              : "Not started",
        current: currentStageKey === stage.key,
      };
    }),
  ];
  const completedCount = sigs.filter((signature) =>
    STAGES.some((stage) => stage.key === signature.stage),
  ).length;
  return (
    <section className="panel rounded-xl p-4 sm:p-6" aria-label="Approval progress">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-base font-semibold">Approval progress</h2>
          <span className="text-xs text-muted-foreground">
            {completedCount} of {STAGES.length} stages complete
          </span>
        </div>
      </header>
      <ol className="grid grid-cols-1 gap-0 sm:grid-cols-4 sm:gap-4">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className="relative grid min-w-0 grid-cols-[28px_minmax(0,1fr)] gap-x-3 pb-6 last:pb-0 sm:block sm:pb-0"
            aria-current={step.current ? "step" : undefined}
          >
            <div className="flex items-start sm:mb-2 sm:h-7 sm:items-center">
              <span
                className={cn(
                  "relative z-10 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-card text-[11px] font-semibold text-muted-foreground",
                  step.status === "approved" && "border-success bg-success text-primary-foreground",
                  step.status === "pending" && "border-warning bg-warning-soft text-warning",
                  step.status === "returned" &&
                    "border-destructive bg-danger-soft text-destructive",
                )}
              >
                {step.status === "approved" ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : step.status === "returned" ? (
                  <CornerUpLeft className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  index
                )}
              </span>
              {index < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-[13px] top-[38px] bottom-[10px] w-0.5 bg-border sm:static sm:ml-2.5 sm:h-0.5 sm:min-w-0 sm:flex-1",
                    step.status === "approved" && "bg-success/40",
                  )}
                />
              )}
            </div>
            <div className="min-w-0 pt-0.5 sm:pt-0">
              <h3 className="break-words text-[13px] font-semibold leading-5">{step.title}</h3>
              <p className="mb-1.5 break-words text-[11px] leading-[17px] text-muted-foreground sm:truncate">
                {step.approver}
              </p>
              <p
                className={cn(
                  "flex min-w-0 flex-wrap items-center gap-1 break-words text-[11px] leading-[17px] text-muted-foreground",
                  step.status === "approved" && "text-success",
                  step.status === "pending" && "font-semibold text-warning",
                  step.status === "returned" && "font-semibold text-destructive",
                )}
              >
                {step.status === "pending" && <Clock3 className="h-3 w-3 shrink-0" aria-hidden />}
                {step.statusText}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
const ICON: Record<HistoryEvent["type"], typeof Circle> = {
  submitted: FileText,
  signed: CheckCircle2,
  approved: CheckCircle2,
  returned: CornerUpLeft,
  resubmitted: RotateCcw,
  dispatch: Truck,
  completed: Truck,
};
  export function HistoryList({ r }: { r: VehicleRequest }) {
  const items = [...r.history].reverse();
  let lastAttempt = -1;
  return (
    <ol className="space-y-0">
      {items.map((e) => {
        const Icon = ICON[e.type];
        const header = e.attempt !== lastAttempt;
        lastAttempt = e.attempt;
        return (
          <li key={e.id}>
            {header && r.attempt > 1 && (
              <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">
                Attempt {e.attempt}
                {e.attempt === r.attempt
                  ? " (current)"
                  : " (previous — not valid for current version)"}
              </p>
            )}
            <div className="flex gap-3 border-l py-2 pl-3">
              <Icon
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  e.type === "returned" ? "text-destructive" : "text-primary",
                )}
                aria-hidden
              />
              <div className="min-w-0 text-sm">
                <p className="break-words">
                  <strong>{e.actorName}</strong>{" "}
                  <span className="text-muted-foreground">· {ROLE_TITLES[e.actorRole]}</span>
                </p>
                <p className="break-words">{e.message}</p>
                {e.reason && <p className="mt-0.5 break-words text-destructive">Reason: {e.reason}</p>}
                <p className="text-xs text-muted-foreground">{fmtDateTime(e.at)}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}