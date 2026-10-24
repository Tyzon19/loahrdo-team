import type { DashboardStats } from "@/lib/types";
import { LoadingStats } from "./LoadingPanel";
export function StatsCards({
  stats,
  loading,
}: {
  stats: DashboardStats | undefined;
  loading: boolean;
}) {
  if (loading || !stats) return <LoadingStats />;

  const cards = [
    {
      label: "Waiting for you",
      value: stats.awaitingYou,
      hint: "Requests that need your action",
    },
    {
      label: "In progress",
      value: stats.pending,
      hint: "Still moving through approvals",
    },
    {
      label: "Approved",
      value: stats.approved,
      hint: "Approved, dispatched or completed",
    },
    {
      label: "Returned",
      value: stats.returned,
      hint: "Sent back for revision",
    },
  ];
  return (
    <dl className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="panel min-w-0 p-3 sm:p-4">
          <dt className="break-words text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground sm:text-xs">
            {card.label}
          </dt>
          <dd className="mt-1 break-words text-xl font-semibold tabular-nums sm:text-2xl">
            {card.value}
          </dd>
          <p className="mt-1 break-words text-[10px] leading-tight text-muted-foreground sm:text-xs">
            {card.hint}
          </p>
        </div>
      ))}
    </dl>
  );
}
