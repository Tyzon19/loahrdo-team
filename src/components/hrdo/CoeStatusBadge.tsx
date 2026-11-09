import {
  CheckCircle2,
  CircleDot,
  Clock,
  Eye,
  PackageCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import type { CoeStatus } from "@/lib/hrdo";
import { COE_REQUESTOR_STATUS_LABELS, COE_STATUS_LABELS } from "@/lib/hrdo";
import { cn } from "@/lib/utils";

const MAP: Record<CoeStatus, { icon: typeof Clock; cls: string }> = {
  pending: { icon: Clock, cls: "bg-info-soft text-primary border-primary/25" },
  under_review: { icon: Eye, cls: "bg-info-soft text-primary border-primary/25" },
  correction_requested: {
    icon: TriangleAlert,
    cls: "bg-warning-soft text-warning border-warning/30",
  },
  processing: { icon: CircleDot, cls: "bg-warning-soft text-warning border-warning/30" },
  awaiting_review: { icon: Eye, cls: "bg-info-soft text-primary border-primary/25" },
  ready_for_pickup: {
    icon: PackageCheck,
    cls: "bg-success-soft text-success border-success/30",
  },
  released: { icon: CheckCircle2, cls: "bg-success-soft text-success border-success/30" },
  rejected: { icon: XCircle, cls: "bg-danger-soft text-destructive border-destructive/30" },
};


export function CoeStatusBadge({
  status,
  audience = "requestor",
  className,
}: {
  status: CoeStatus;
  audience?: "requestor" | "staff";
  className?: string;
}) {
  const { icon: Icon, cls } = MAP[status];
  const labels = audience === "staff" ? COE_STATUS_LABELS : COE_REQUESTOR_STATUS_LABELS;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 whitespace-normal break-words rounded-sm border px-2 py-0.5 text-xs font-medium sm:whitespace-nowrap",
        cls,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {labels[status]}
    </span>
  );
}
