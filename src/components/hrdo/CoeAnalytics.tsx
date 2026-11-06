import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Section } from "@/components/app/PageHeader";
import { LoadingPanel } from "@/components/app/LoadingPanel";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { getHrdoCoeAnalyticsFn } from "@/server-functions";
import { unwrap } from "@/lib/api";
import { COE_COPY_TYPE_LABELS, COE_STATUS_LABELS, type CoeStatus } from "@/lib/hrdo";

const STATUS_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-primary)",
  "var(--color-success)",
  "var(--color-muted-foreground)",
];
const statusChartConfig = Object.fromEntries(
  Object.entries(COE_STATUS_LABELS).map(([status, label], index) => [
    status,
    { label, color: STATUS_COLORS[index % STATUS_COLORS.length] },
  ]),
) satisfies ChartConfig;

const volumeChartConfig = {
  requested: { label: "Requests submitted", color: "var(--color-chart-1)" },
  released: { label: "Certificates released", color: "var(--color-chart-2)" },
} satisfies ChartConfig;

const departmentChartConfig = {
  total: { label: "COE requests", color: "var(--color-chart-3)" },
} satisfies ChartConfig;

function monthLabel(month: string) {
  return new Date(`${month}-01T12:00:00`).toLocaleDateString("en-PH", {
    month: "short",
    year: "2-digit",
  });
}

function displayNumber(value: number | null, digits = 0) {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-PH", { maximumFractionDigits: digits }).format(value);
}

export function CoeAnalytics() {
  const analytics = useQuery({
    queryKey: ["hrdo-coe-analytics"],
    queryFn: () => unwrap(getHrdoCoeAnalyticsFn()),
    staleTime: 60_000,
  });

  return (
    <Section title="Overview">
      <p className="mb-4 text-sm text-muted-foreground">
        Key workload and service indicators.
      </p>
      {analytics.isPending ? (
        <LoadingPanel label="Loading COE analytics" rows={4} />
      ) : analytics.isError ? (
        <div className="rounded-md border p-5 text-center" role="alert">
          <p className="font-medium">We couldn&apos;t load COE analytics.</p>
          <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
          <Button className="mt-3" variant="outline" onClick={() => void analytics.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {[
              { label: "All requests", value: displayNumber(analytics.data.summary.total), hint: "All time" },
              { label: "Open requests", value: displayNumber(analytics.data.summary.open), hint: "Still in progress" },
              { label: "Due soon", value: displayNumber(analytics.data.summary.dueSoon), hint: "Next 24 hours" },
              { label: "Overdue", value: displayNumber(analytics.data.summary.overdue), hint: "Past deadline" },
              { label: "Released", value: displayNumber(analytics.data.summary.released), hint: "All time" },
              {
                label: "Avg. release time",
                value:
                  analytics.data.summary.averageReleaseDays === null
                    ? "—"
                    : `${displayNumber(analytics.data.summary.averageReleaseDays, 1)} days`,
                hint: "Released requests",
              },
            ].map((metric) => (
              <div key={metric.label} className="rounded-md border bg-card p-3">
                <dt className="text-xs font-medium text-muted-foreground">{metric.label}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">{metric.value}</dd>
                <p className="mt-1 text-xs text-muted-foreground">{metric.hint}</p>
              </div>
            ))}
          </dl>

          <div className="grid min-w-0 gap-4 xl:grid-cols-12">
            <Card className="min-w-0 xl:col-span-7">
              <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
                <CardTitle className="text-base">Monthly request and release volume</CardTitle>
                <CardDescription>Last 12 months</CardDescription>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <ChartContainer config={volumeChartConfig} className="h-[240px] w-full aspect-auto">
                  <AreaChart data={analytics.data.monthly} margin={{ left: 4, right: 10, top: 10 }}>
                    <defs>
                      <linearGradient id="coeRequestsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-requested)" stopOpacity={0.24} />
                        <stop offset="95%" stopColor="var(--color-requested)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="month"
                      tickFormatter={monthLabel}
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={18}
                    />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Area
                      type="monotone"
                      dataKey="requested"
                      stroke="var(--color-requested)"
                      fill="url(#coeRequestsFill)"
                      strokeWidth={2.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="released"
                      stroke="var(--color-released)"
                      fill="transparent"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card className="min-w-0 xl:col-span-5">
              <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
                <CardTitle className="text-base">Current request status</CardTitle>
                <CardDescription>All requests grouped by their latest status</CardDescription>
              </CardHeader>
              <CardContent className="grid items-center gap-3 p-3 pt-0 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,1fr)] sm:p-6 sm:pt-0">
                {analytics.data.statuses.length ? (
                  <ChartContainer config={statusChartConfig} className="mx-auto h-[210px] w-full max-w-[250px] aspect-square">
                    <PieChart>
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            hideLabel
                            nameKey="status"
                            formatter={(value, name) => (
                              <span className="flex w-full items-center justify-between gap-3">
                                <span>{COE_STATUS_LABELS[name as CoeStatus] ?? name}</span>
                                <span className="font-mono font-medium tabular-nums">{value}</span>
                              </span>
                            )}
                          />
                        }
                      />
                      <Pie
                        data={analytics.data.statuses}
                        dataKey="total"
                        nameKey="status"
                        innerRadius={54}
                        outerRadius={82}
                        paddingAngle={2}
                        strokeWidth={2}
                      >
                        {analytics.data.statuses.map((entry, index) => (
                          <Cell
                            key={entry.status}
                            fill={STATUS_COLORS[index % STATUS_COLORS.length]}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                ) : (
                  <div className="flex h-[210px] items-center justify-center">
                    <EmptyState title="No COE requests yet." />
                  </div>
                )}
                <ul className="grid gap-2 text-sm">
                  {analytics.data.statuses.map((entry, index) => (
                    <li key={entry.status} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: STATUS_COLORS[index % STATUS_COLORS.length] }}
                        />
                        <span className="truncate">{COE_STATUS_LABELS[entry.status]}</span>
                      </span>
                      <span className="font-medium tabular-nums">{entry.total}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="min-w-0 xl:col-span-7">
              <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
                <CardTitle className="text-base">Requests by department</CardTitle>
                <CardDescription>Top departments by submissions · last 12 months</CardDescription>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                {analytics.data.departments.length ? (
                  <ChartContainer config={departmentChartConfig} className="h-[250px] w-full aspect-auto">
                    <BarChart
                      data={analytics.data.departments}
                      layout="vertical"
                      margin={{ left: 4, right: 16, top: 4, bottom: 4 }}
                    >
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" allowDecimals={false} hide />
                      <YAxis
                        dataKey="department"
                        type="category"
                        tickLine={false}
                        axisLine={false}
                        width={140}
                        tick={{ fontSize: 11 }}
                      />
                      <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                      <Bar dataKey="total" fill="var(--color-total)" radius={[0, 5, 5, 0]} barSize={18} />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <div className="flex h-[250px] items-center justify-center">
                    <EmptyState title="No department data in the last 12 months." />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0 xl:col-span-5">
              <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
                <CardTitle className="text-base">Requested copy type</CardTitle>
                <CardDescription>Last 12 months</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-4 pt-2 sm:p-6 sm:pt-2">
                {analytics.data.copyTypes.length ? (
                  (() => {
                    const max = Math.max(...analytics.data.copyTypes.map((entry) => entry.total), 1);
                    return analytics.data.copyTypes.map((entry, index) => (
                      <div key={entry.copyType} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span>{COE_COPY_TYPE_LABELS[entry.copyType]}</span>
                          <span className="font-medium tabular-nums">{entry.total}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(entry.total / max) * 100}%`,
                              backgroundColor: STATUS_COLORS[index % STATUS_COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    ));
                  })()
                ) : (
                  <EmptyState title="No copy-type data in the last 12 months." />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </Section>
  );
}
