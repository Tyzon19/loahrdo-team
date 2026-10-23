import { CheckCircle2, Circle, CornerUpLeft, FileText, RotateCcw, Truck } from "lucide-react";
import type { HistoryEvent, VehicleRequest } from "@/lib/types";
import { currentSignatures, ROLE_TITLES, STAGES } from "@/lib/workflow";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StageStepper({ r }: { r: VehicleRequest }) {
  const sigs = currentSignatures(r);
  const steps = [{ label: "Submitted", title: "Requisitioner", done: true, current: false, returned: false }, ...STAGES.map((s) => {
    const done = sigs.some((x) => x.stage === s.key);
    return { label: s.label, title: s.title, done, current: r.status === s.status, returned: r.status === "returned" && r.lastReturn?.stage === s.key && r.lastReturn.attempt === r.attempt };
  })];
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Approval progress">
      {steps.map((s, i) => (
        <li key={i} className={cn("flex items-start gap-2 rounded-sm border px-3 py-2", s.current && "border-primary bg-info-soft", s.returned && "border-destructive bg-danger-soft")}>
          {s.returned ? <CornerUpLeft className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <Circle className={cn("mt-0.5 h-4 w-4 shrink-0", s.current ? "text-primary" : "text-muted-foreground")} />}
          <div className="min-w-0">
            <p className="text-xs font-semibold">{i}. {s.label}</p>
            <p className="truncate text-xs text-muted-foreground">{s.title}</p>
            <p className="text-xs">{s.returned ? "Returned" : s.done ? "Completed" : s.current ? "In progress" : "Not started"}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

const ICON: Record<HistoryEvent["type"], typeof Circle> = {
  submitted: FileText, signed: CheckCircle2, approved: CheckCircle2, returned: CornerUpLeft, resubmitted: RotateCcw, dispatch: Truck, completed: Truck,
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
                Attempt {e.attempt}{e.attempt === r.attempt ? " (current)" : " (previous — not valid for current version)"}
              </p>
            )}
            <div className="flex gap-3 border-l py-2 pl-3">
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", e.type === "returned" ? "text-destructive" : "text-primary")} aria-hidden />
              <div className="min-w-0 text-sm">
                <p><strong>{e.actorName}</strong> <span className="text-muted-foreground">· {ROLE_TITLES[e.actorRole]}</span></p>
                <p>{e.message}</p>
                {e.reason && <p className="mt-0.5 text-destructive">Reason: {e.reason}</p>}
                <p className="text-xs text-muted-foreground">{fmtDateTime(e.at)}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
