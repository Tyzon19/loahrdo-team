import { useDeferredValue, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Search,
  TicketCheck,
  Truck,
} from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, PageHeader, Section } from "@/components/app/PageHeader";
import { LoadingPanel } from "@/components/app/LoadingPanel";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getTripArchiveFn } from "@/server-functions";
import { unwrap } from "@/lib/api";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/trip-archive")({
  head: () => ({
    meta: [
      { title: `Trip Archive & Analytics — ${SITE.name}` },
      {
        name: "description",
        content: "Search archived trip tickets and review completed trip activity.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TripArchive,
});

const PAGE_SIZE = 20;

const tripsChartConfig = {
  trips: { label: "Trip tickets", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

const destinationChartConfig = {
  trips: { label: "Trip tickets", color: "var(--color-chart-2)" },
} satisfies ChartConfig;

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function prettyDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function TripArchive() {
  const { viewer } = Route.useRouteContext();
  const now = new Date();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState(localDate(new Date(now.getFullYear(), 0, 1)));
  const [to, setTo] = useState(localDate(now));
  const [page, setPage] = useState(0);
  const search = useDeferredValue(q.trim());
  const archive = useQuery({
    queryKey: ["trip-archive", search, from, to, page],
    queryFn: () => unwrap(getTripArchiveFn({ data: { q: search, from, to, page } })),
    enabled: viewer?.role === "admin",
  });

  if (!viewer) return null;
  if (viewer.role !== "admin") {
    return (
      <Section title="Not available">
        <EmptyState title="Trip analytics are available to administrators only." />
      </Section>
    );
  }

  const data = archive.data;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const monthlyChartData = (data?.monthlyTrips ?? [])
    .slice()
    .reverse()
    .map((entry) => ({
      ...entry,
      label: new Date(`${entry.month}-01T12:00:00`).toLocaleDateString("en-PH", {
        month: "short",
        year: "2-digit",
      }),
    }));
  const destinationChartData = (data?.destinations ?? []).slice(0, 8).slice().reverse();

  function setCurrentDay() {
    const today = localDate(new Date());
    setFrom(today);
    setTo(today);
    setPage(0);
  }

  function setCurrentMonth() {
    const today = new Date();
    setFrom(localDate(new Date(today.getFullYear(), today.getMonth(), 1)));
    setTo(localDate(today));
    setPage(0);
  }

  function setAllDates() {
    setFrom("");
    setTo("");
    setPage(0);
  }

  return (
    <>
      <PageHeader
        title="Trip Archive & Analytics"
        description="Trip volume, workflow status, and destination trends for approved trip tickets."
      />

      <Card className="min-w-0 overflow-hidden border-primary/15 shadow-sm">
        <CardHeader className="gap-3 border-b bg-gradient-to-r from-primary/[0.06] via-card to-card p-4 pb-3 sm:flex-row sm:items-center sm:justify-between sm:p-6 sm:pb-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
              Reporting period
            </CardTitle>
            <CardDescription>
              Filter archived tickets and trip activity by travel date.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            <Button type="button" size="sm" variant="outline" onClick={setCurrentDay}>
              Today
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={setCurrentMonth}>
              This month
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={setAllDates}>
              All time
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-3 p-3 sm:grid-cols-2 sm:gap-4 sm:p-4 lg:grid-cols-[minmax(16rem,1.5fr)_minmax(9rem,0.6fr)_minmax(9rem,0.6fr)]">
          <div>
            <Label htmlFor="trip-search">Search archive</Label>
            <div className="relative mt-1.5">
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="trip-search"
                className="pl-9"
                maxLength={100}
                placeholder="Ticket, destination, requester, driver, vehicle…"
                value={q}
                onChange={(event) => {
                  setQ(event.target.value);
                  setPage(0);
                }}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="trip-from">Travel date from</Label>
            <Input
              id="trip-from"
              className="mt-1.5"
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(0);
              }}
            />
          </div>
          <div>
            <Label htmlFor="trip-to">Travel date to</Label>
            <Input
              id="trip-to"
              className="mt-1.5"
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(0);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {archive.isPending ? (
        <LoadingPanel label="Loading trip archive" rows={5} />
      ) : archive.isError ? (
        <Section title="Trip archive">
          <div className="p-6 text-center" role="alert">
            <p className="font-medium">We couldn&apos;t load the trip archive.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Check your connection and try again.
            </p>
            <Button className="mt-4" variant="outline" onClick={() => void archive.refetch()}>
              Try again
            </Button>
          </div>
        </Section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <Metric
              icon={TicketCheck}
              label="Archived tickets"
              value={data?.summary.tickets ?? 0}
              hint="Final-approved and onward"
              detail="Approved, dispatched, and completed requests"
            />
            <Metric
              icon={CheckCircle2}
              label="Completed"
              value={data?.summary.completedTrips ?? 0}
              hint="Marked completed in the workflow"
              detail="Counts requests with completed status"
            />
            <Metric
              icon={Truck}
              label="Dispatched"
              value={data?.summary.dispatched ?? 0}
              hint="Marked as dispatched"
              detail="Trips currently recorded as dispatched"
            />
            <Metric
              icon={Clock3}
              label="Awaiting dispatch"
              value={data?.summary.approved ?? 0}
              hint="Approved trip tickets"
              detail="Approved, not yet marked dispatched"
            />
          </div>

          <div className="grid min-w-0 gap-3 sm:gap-4 xl:grid-cols-5">
            <Card className="min-w-0 xl:col-span-3">
              <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
                <CardTitle className="text-base">Monthly trip volume</CardTitle>
                <CardDescription>
                  Approved trip tickets grouped by scheduled start month · up to 12 months
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                {monthlyChartData.length ? (
                  <ChartContainer
                    config={tripsChartConfig}
                    className="h-[210px] w-full aspect-auto sm:h-[260px]"
                  >
                    <AreaChart
                      accessibilityLayer
                      data={monthlyChartData}
                      margin={{ left: 4, right: 12, top: 12 }}
                    >
                      <defs>
                        <linearGradient id="tripAreaFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-trips)" stopOpacity={0.28} />
                          <stop offset="95%" stopColor="var(--color-trips)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                      <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent indicator="line" />}
                      />
                      <Area
                        type="monotone"
                        dataKey="trips"
                        stroke="var(--color-trips)"
                        strokeWidth={2.5}
                        fill="url(#tripAreaFill)"
                        activeDot={{ r: 5 }}
                      />
                    </AreaChart>
                  </ChartContainer>
                ) : (
                  <div className="flex h-[210px] items-center justify-center sm:h-[260px]">
                    <EmptyState title="No trip tickets in this period." />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0 xl:col-span-2">
              <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-4 w-4 text-primary" aria-hidden />
                  Most requested destinations
                </CardTitle>
                <CardDescription>
                  Destinations across approved trip tickets in this period
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                {destinationChartData.length ? (
                  <ChartContainer
                    config={destinationChartConfig}
                    className="h-[230px] w-full aspect-auto sm:h-[260px]"
                  >
                    <BarChart
                      accessibilityLayer
                      data={destinationChartData}
                      layout="vertical"
                      margin={{ left: 4, right: 18, top: 4, bottom: 4 }}
                    >
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" allowDecimals={false} hide />
                      <YAxis
                        dataKey="name"
                        type="category"
                        tickLine={false}
                        axisLine={false}
                        width={122}
                        tick={{ fontSize: 11 }}
                      />
                      <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                      <Bar
                        dataKey="trips"
                        fill="var(--color-trips)"
                        radius={[0, 5, 5, 0]}
                        barSize={18}
                      />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <div className="flex h-[230px] items-center justify-center sm:h-[260px]">
                    <EmptyState title="No destination data in this period." />
                  </div>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  A multi-stop trip counts once for each destination.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="space-y-1">
                <CardTitle className="text-base">Trip ticket archive</CardTitle>
                <CardDescription>
                  {data?.total ?? 0} saved ticket{data?.total === 1 ? "" : "s"} · Search and open
                  the original record.
                </CardDescription>
              </div>
              <Badge variant="outline" className="w-fit">
                {from && to ? `${prettyDate(from)} – ${prettyDate(to)}` : "All travel dates"}
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              {data?.rows.length ? (
                <>
                  <div className="grid gap-2 p-3 sm:grid-cols-2 sm:gap-3 sm:p-4 xl:hidden">
                    {data.rows.map((row) => (
                      <article key={row.id} className="min-w-0 rounded-lg border bg-muted/20 p-3">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-muted-foreground">Ticket</p>
                            <p className="break-words text-sm font-semibold">{row.number}</p>
                          </div>
                          <Badge
                            variant={row.status === "completed" ? "default" : "secondary"}
                            className={
                              row.status === "completed"
                                ? "shrink-0 border-success/20 bg-success-soft text-success shadow-none"
                                : "shrink-0"
                            }
                          >
                            {row.status}
                          </Badge>
                        </div>
                        <dl className="mt-3 grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 text-sm">
                          <div className="min-w-0">
                            <dt className="text-[11px] text-muted-foreground">Travel date</dt>
                            <dd className="break-words text-xs">
                              {prettyDate(row.dateStart)}
                              {row.dateEnd !== row.dateStart ? ` – ${prettyDate(row.dateEnd)}` : ""}
                            </dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-[11px] text-muted-foreground">Passengers</dt>
                            <dd className="text-xs">{row.passengers}</dd>
                          </div>
                          <div className="col-span-2 min-w-0">
                            <dt className="text-[11px] text-muted-foreground">
                              Requisitioner / office
                            </dt>
                            <dd className="break-words text-xs">
                              {row.requisitionerName}
                              <span className="block text-muted-foreground">{row.department}</span>
                            </dd>
                          </div>
                          <div className="col-span-2 min-w-0">
                            <dt className="text-[11px] text-muted-foreground">Destination(s)</dt>
                            <dd className="break-words text-xs">{row.destinations || "—"}</dd>
                          </div>
                          <div className="col-span-2 min-w-0">
                            <dt className="text-[11px] text-muted-foreground">Vehicle / driver</dt>
                            <dd className="break-words text-xs">
                              {row.vehicle || "—"}
                              <span className="block text-muted-foreground">
                                {row.driver || "Driver not recorded"}
                              </span>
                            </dd>
                          </div>
                        </dl>
                        <Link
                          to="/print/$id"
                          params={{ id: row.id }}
                          className="mt-3 inline-flex min-h-9 items-center gap-1 font-medium text-primary hover:underline"
                        >
                          Open ticket <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                        </Link>
                      </article>
                    ))}
                  </div>
                  <div className="hidden xl:block">
                    <Table className="min-w-[1050px]">
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead>Ticket</TableHead>
                          <TableHead>Travel date</TableHead>
                          <TableHead>Requisitioner / office</TableHead>
                          <TableHead>Destination(s)</TableHead>
                          <TableHead>Vehicle / driver</TableHead>
                          <TableHead>Passengers</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Ticket</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.rows.map((row) => (
                          <TableRow key={row.id} className="align-top">
                            <TableCell className="font-semibold">{row.number}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              {prettyDate(row.dateStart)}
                              {row.dateEnd !== row.dateStart ? ` – ${prettyDate(row.dateEnd)}` : ""}
                            </TableCell>
                            <TableCell>
                              {row.requisitionerName}
                              <span className="block text-xs text-muted-foreground">
                                {row.department}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-xs">{row.destinations || "—"}</TableCell>
                            <TableCell>
                              {row.vehicle || "—"}
                              <span className="block text-xs text-muted-foreground">
                                {row.driver || "Driver not recorded"}
                              </span>
                            </TableCell>
                            <TableCell>{row.passengers}</TableCell>
                            <TableCell>
                              <Badge
                                variant={row.status === "completed" ? "default" : "secondary"}
                                className={
                                  row.status === "completed"
                                    ? "border-success/20 bg-success-soft text-success shadow-none"
                                    : ""
                                }
                              >
                                {row.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Link
                                to="/print/$id"
                                params={{ id: row.id }}
                                className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-primary hover:underline"
                              >
                                Open ticket <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {pages > 1 && (
                    <div className="flex items-center justify-center gap-2 border-t p-3 text-sm sm:justify-end sm:gap-3 sm:p-4">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 0}
                        onClick={() => setPage((current) => current - 1)}
                      >
                        Previous
                      </Button>
                      <span>
                        Page {page + 1} of {pages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= pages - 1}
                        onClick={() => setPage((current) => current + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-8">
                  <EmptyState title="No trip tickets match these filters." />
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  detail,
}: {
  icon: typeof TicketCheck;
  label: string;
  value: number;
  hint: string;
  detail: string;
}) {
  return (
    <Card className="min-w-0 transition-shadow hover:shadow-md">
      <CardHeader className="flex-row items-start justify-between gap-1 space-y-0 p-3 pb-1 sm:p-4 sm:pb-2 xl:p-6 xl:pb-2">
        <CardDescription className="min-w-0 text-[11px] leading-tight sm:text-sm">
          {label}
        </CardDescription>
        <span className="shrink-0 rounded-md border bg-muted/40 p-1.5 text-primary sm:p-2">
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
        </span>
      </CardHeader>
      <CardContent className="min-w-0 p-3 pt-0 sm:p-4 sm:pt-0 xl:p-6 xl:pt-0">
        <div className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
          {value.toLocaleString()}
        </div>
        <p className="mt-1 text-[10px] leading-tight text-muted-foreground sm:text-xs">{hint}</p>
        <p className="mt-2 border-t pt-2 text-[10px] leading-tight text-muted-foreground sm:mt-3 sm:text-[11px]">
          {detail}
        </p>
      </CardContent>
    </Card>
  );
}
