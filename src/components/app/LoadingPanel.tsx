import { Skeleton } from "@/components/ui/skeleton";
export function LoadingPanel({ label = "Loading", rows = 5 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="panel p-4">
      <span className="sr-only">{label}</span>
      <div className="space-y-2.5">
        <Skeleton className="h-4 w-40" />
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}
export function LoadingStats() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-5"
    >
      <span className="sr-only">Loading overview statistics</span>
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="panel min-w-0 p-3 sm:p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-7 w-12" />
        </div>
      ))}
    </div>
  );
}