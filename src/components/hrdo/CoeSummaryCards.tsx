import { cn } from "@/lib/utils";

export interface CoeSummaryCard {
  key: string;
  label: string;
  value: number;
  hint: string;
  tone?: "default" | "warning" | "danger" | "success";
}

const VALUE_TONE: Record<NonNullable<CoeSummaryCard["tone"]>, string> = {
  default: "text-foreground",
  warning: "text-warning",
  danger: "text-destructive",
  success: "text-success",
};

/**
 * Clickable summary cards. Selecting a card filters the request list; selecting
 * the active card again clears the filter.
 */
export function CoeSummaryCards({
  cards,
  activeKey,
  onSelect,
  loading,
  columns = 4,
  label,
}: {
  cards: CoeSummaryCard[];
  activeKey?: string | undefined;
  onSelect?: ((key: string) => void) | undefined;
  loading?: boolean;
  columns?: 4 | 5 | 6;
  label: string;
}) {
  return (
    <div
      className={cn(
        "mb-5 grid overflow-hidden rounded-lg border bg-card shadow-xs",
        columns === 6
          ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"
          : columns === 5
            ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5"
            : "grid-cols-2 lg:grid-cols-4",
      )}
      role="group"
      aria-label={label}
    >
      {cards.map((card) => {
        const active = activeKey === card.key;
        const content = (
          <>
            <span className="block break-words text-[10px] font-medium leading-tight text-muted-foreground sm:text-xs">
              {card.label}
            </span>
            <span
              className={cn(
                "mt-1 block break-words text-2xl font-semibold tabular-nums tracking-tight sm:text-[1.75rem]",
                VALUE_TONE[card.tone ?? "default"],
              )}
            >
              {loading ? "—" : card.value}
            </span>
            <span className="mt-1 block break-words text-[10px] leading-tight text-muted-foreground sm:text-[11px]">
              {card.hint}
            </span>
          </>
        );

        if (!onSelect) {
          return (
            <div
              key={card.key}
              className="min-w-0 border-b p-3 transition-colors last:border-b-0 sm:border-b-0 sm:border-r sm:p-4 sm:last:border-r-0"
            >
              {content}
            </div>
          );
        }

        return (
          <button
            key={card.key}
            type="button"
            onClick={() => onSelect(card.key)}
            aria-pressed={active}
            aria-label={`${card.label}: ${loading ? "loading" : card.value}. Show these requests.`}
            className={cn(
              "block h-full w-full border-b p-3 text-left transition-colors hover:bg-muted/50 active:bg-muted/70 sm:border-b-0 sm:border-r sm:p-4 sm:last:border-r-0",
              active && "bg-accent/60",
            )}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
