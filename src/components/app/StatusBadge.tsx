import { CheckCircle2, CircleDot, Clock, CornerUpLeft, Flag, Truck } from "lucide-react";
import type { Status } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/workflow";
import { cn } from "@/lib/utils";
const MAP: Record<Status, { icon: typeof Clock; cls: string }> = {
  pending_review: { icon: Clock, cls: "bg-info-soft text-primary border-primary/25" },
  pending_recommendation: { icon: Clock, cls: "bg-info-soft text-primary border-primary/25" },
  pending_approval: { icon: CircleDot, cls: "bg-warning-soft text-warning border-warning/30" },
  returned: { icon: CornerUpLeft, cls: "bg-danger-soft text-destructive border-destructive/30" },
  approved: { icon: CheckCircle2, cls: "bg-success-soft text-success border-success/30" },
  dispatched: { icon: Truck, cls: "bg-success-soft text-success border-success/30" },
  completed: { icon: Flag, cls: "bg-muted text-muted-foreground border-border" },
};
export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const { icon: Icon, cls } = MAP[status];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-medium", cls, className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}