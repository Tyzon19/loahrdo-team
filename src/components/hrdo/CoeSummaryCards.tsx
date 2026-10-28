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
  columns?: 4 | 5;
  label: string;
}) {
  return (
    <div
      className={cn(
        "mb-4 grid gap-2 sm:gap-3",
        columns === 5 ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5" : "grid-cols-2 lg:grid-cols-4",
      )}
      role="group"
      aria-label={label}
    >
      {cards.map((card) => {
        const active = activeKey === card.key;
        const content = (
          <>
            <span className="block break-words text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground sm:text-xs">
              {card.label}
            </span>
            <span
              className={cn(
                "mt-1 block break-words text-xl font-semibold tabular-nums sm:text-2xl",
                VALUE_TONE[card.tone ?? "default"],
              )}
            >
              {loading ? "—" : card.value}
            </span>
            <span className="mt-1 block break-words text-[10px] leading-tight text-muted-foreground sm:text-xs">
              {card.hint}
            </span>
          </>
        );

        if (!onSelect) {
          return (
            <div key={card.key} className="panel min-w-0 p-3 sm:p-4">
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
              "panel block h-full w-full p-3 text-left transition-colors hover:bg-muted/60 sm:p-4",
              active && "border-primary/50 ring-1 ring-primary/30",
            )}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
