import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Section } from "@/components/app/PageHeader";
import { LoadingPanel } from "@/components/app/LoadingPanel";
import { getTripArchiveFn } from "@/server-functions";
import { unwrap } from "@/lib/api";
function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
export function AdminAnalytics() {
  const today = new Date();
  const from = localDate(new Date(today.getFullYear(), today.getMonth() - 11, 1));
  const to = localDate(today);
  const analytics = useQuery({
    queryKey: ["trip-analytics-dashboard", from, to],
    queryFn: () => unwrap(getTripArchiveFn({ data: { from, to } })),
    staleTime: 60_000,
  });
  const monthlyTrips = analytics.data?.monthlyTrips ?? [];
  const maxTrips = Math.max(1, ...monthlyTrips.map((month) => month.trips));

  return (
    <Section
      title="Trip analytics"
      actions={
        <Button asChild size="sm" variant="outline">
          <Link to="/trip-archive">Open trip archive</Link>
        </Button>
      }
    >
      {analytics.isPending ? (
        <LoadingPanel label="Loading trip analytics" rows={3} />
      ) : analytics.isError ? (
        <div className="p-4 text-center" role="alert">
          <p className="font-medium">We couldn&apos;t load trip analytics.</p>
          <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
          <Button className="mt-4" variant="outline" onClick={() => void analytics.refetch()}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Try again
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {[
              {
                label: "Archived tickets",
                value: analytics.data.summary.tickets,
                hint: "Final-approved and onward · last 12 months",
              },
              {
                label: "Completed",
                value: analytics.data.summary.completedTrips,
                hint: "Trips marked completed · last 12 months",
              },
              {
                label: "Dispatched",
                value: analytics.data.summary.dispatched,
                hint: "Trips currently dispatched · last 12 months",
              },
              {
                label: "Awaiting dispatch",
                value: analytics.data.summary.approved,
                hint: "Approved tickets · last 12 months",
              },
            ].map((metric) => (
              <div key={metric.label} className="rounded-md border bg-card p-3">
                <dt className="text-xs font-medium text-muted-foreground">{metric.label}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">{metric.value}</dd>
                <p className="mt-1 text-xs text-muted-foreground">{metric.hint}</p>
              </div>
            ))}
          </dl>

          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base">Monthly trip volume</CardTitle>
                <CardDescription>Approved trips over the last 12 months</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {monthlyTrips.length ? (
                  <ol className="space-y-2">
                    {monthlyTrips
                      .slice()
                      .reverse()
                      .map((month) => {
                        const label = new Date(`${month.month}-01T12:00:00`).toLocaleDateString(
                          "en-PH",
                          { month: "short", year: "numeric" },
                        );
                        return (
                          <li
                            key={month.month}
                            className="grid grid-cols-[5.5rem_minmax(0,1fr)_2rem] items-center gap-2 text-sm"
                          >
                            <span className="text-muted-foreground">{label}</span>
                            <span
                              className="h-2.5 rounded-full bg-muted"
                              role="progressbar"
                              aria-label={`${label} trip volume`}
                              aria-valuemin={0}
                              aria-valuemax={maxTrips}
                              aria-valuenow={month.trips}
                            >
                              <span
                                className="block h-full rounded-full bg-primary"
                                style={{ width: `${(month.trips / maxTrips) * 100}%` }}
                              />
                            </span>
                            <span className="text-right tabular-nums">{month.trips}</span>
                          </li>
                        );
                      })}
                  </ol>
                ) : (
                  <EmptyState title="No approved trips in the last 12 months." />
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base">Top destinations</CardTitle>
                <CardDescription>Most requested destinations in the same period</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {analytics.data.destinations.length ? (
                  <ol className="space-y-2">
                    {analytics.data.destinations.slice(0, 6).map((destination) => (
                      <li
                        key={destination.name}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 truncate">{destination.name}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {destination.trips} {destination.trips === 1 ? "trip" : "trips"}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <EmptyState title="No destination data in the last 12 months." />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </Section>
  );
}
