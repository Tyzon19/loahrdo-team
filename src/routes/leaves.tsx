import { useState, type ReactNode } from "react";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Clock3, Flag, LogOut, RefreshCw, Umbrella } from "lucide-react";
import { PageHeader, Section, EmptyState } from "@/components/app/PageHeader";
import { LoadingPanel } from "@/components/app/LoadingPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { unwrap } from "@/lib/api";
import { institutionalEmailAllowed } from "@/lib/validation";
import { createAttendanceFlagFn, listMyAttendanceFn, logoutFn } from "@/server-functions";

export const Route = createFileRoute("/leaves")({
  beforeLoad: ({ context }) => {
    if (!context.viewer) {
      throw redirect({ to: "/login", search: { redirect: "/leaves" } });
    }
    if (!institutionalEmailAllowed(context.viewer.email)) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({ meta: [{ title: "My Leaves & Attendance | LOA HRDO Desk" }] }),
  component: MyAttendance,
});

function value(value: unknown, fallback = "0") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function codeClass(code: string) {
  if (code === "L" || code === "LATE") {
    return "inline-flex min-w-12 items-center justify-center rounded-md bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900";
  }
  return "inline-flex min-w-12 items-center justify-center rounded-md bg-primary/10 px-2 py-1 text-xs font-bold text-primary";
}

function MyAttendance() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [flagId, setFlagId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const attendance = useQuery({
    queryKey: ["my-attendance"],
    queryFn: () => unwrap(listMyAttendanceFn()),
    refetchInterval: 10_000,
  });

  if (attendance.isPending) return <LoadingPanel label="Loading your attendance" rows={6} />;
  if (attendance.isError) {
    return (
      <Section title="My Leaves & Attendance">
        <div className="p-6 text-center" role="alert">
          <p>We couldn&apos;t load your attendance records.</p>
          <Button className="mt-4" variant="outline" onClick={() => void attendance.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden /> Try again
          </Button>
        </div>
      </Section>
    );
  }

  const data = attendance.data;
  const balance = data.balance;
  const selectedLog = data.logs.find((log) => String(log["id"]) === flagId);

  async function submitFlag() {
    if (!selectedLog || message.trim().length < 3) return;
    await unwrap(
      createAttendanceFlagFn({ data: { attendanceLogId: String(selectedLog["id"]), message } }),
    );
    setFlagId(null);
    setMessage("");
    await queryClient.invalidateQueries({ queryKey: ["my-attendance"] });
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await unwrap(logoutFn());
      queryClient.clear();
      await router.navigate({ href: "/login" });
    } finally {
      setSigningOut(false);
    }
  }

  const remainingBalance = (
    Number(balance?.["rem_el"] ?? 0) +
    Number(balance?.["rem_sl"] ?? 0) +
    Number(balance?.["rem_vl"] ?? 0) +
    Number(balance?.["rem_bl"] ?? 0)
  ).toFixed(1);
  const staffGroupLabel =
    data.mapping?.staff_group === "NON_TEACHING"
      ? "Non-Teaching Staff"
      : data.mapping?.staff_group === "COLLEGE"
        ? "College"
        : data.mapping?.staff_group === "BASIC_ED"
          ? "Basic Education Staff"
          : "Staff group not mapped";

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <PageHeader
        title="My Leaves & Attendance"
        description="Your leave credits and synced attendance records."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => void signOut()}
            disabled={signingOut}
            className="min-h-11"
          >
            <LogOut className="mr-2 h-4 w-4" aria-hidden />
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        }
      />

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
          <div className="border-b p-5 lg:border-b-0 lg:border-r lg:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{staffGroupLabel}</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                  Attendance cycle
                </h2>
              </div>
              <div className="rounded-lg bg-primary/8 px-3 py-2 text-sm font-medium text-primary">
                June 2026 – May 2027
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi
                title="Available"
                value={remainingBalance}
                suffix="days"
                icon={<Umbrella className="h-4 w-4" aria-hidden />}
              />
              <Kpi title="This Year" value={value(balance?.["leaves_this_year"])} suffix="used" />
              <Kpi title="This Month" value={value(balance?.["leaves_this_month"])} suffix="used" />
              <Kpi
                title="Lates"
                value={value(balance?.["total_lates"])}
                suffix="recorded"
                icon={<Clock3 className="h-4 w-4" aria-hidden />}
              />
            </div>
            <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarRange className="h-4 w-4 shrink-0" aria-hidden />
              All unused credits expire on May 31, 2027
              {Number(balance?.["carry_over_bl"] ?? 0) > 0 && (
                <span className="ml-auto rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                  {value(balance?.["carry_over_bl"])} BL carry over
                </span>
              )}
            </div>
          </div>

          <div className="p-5 lg:p-7">
            <p className="text-sm font-semibold text-foreground">Leave allocations</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Bucket
                title="Emergency"
                code="E/L"
                value={value(balance?.["rem_el"], "6")}
                max={6}
              />
              <Bucket title="Sick" code="S/L" value={value(balance?.["rem_sl"], "5")} max={5} />
              <Bucket title="Vacation" code="V/L" value={value(balance?.["rem_vl"], "5")} max={5} />
              <Bucket
                title="Birthday"
                code="B/L"
                value={value(balance?.["rem_bl"], "1")}
                max={Number(balance?.["carry_over_bl"] ?? 0) > 0 ? 2 : 1}
              />
            </div>
          </div>
        </div>
      </section>

      <Section
        title="Late & Absences History"
        actions={
          <span className="text-xs font-medium text-muted-foreground">
            {data.logs.length} {data.logs.length === 1 ? "record" : "records"}
          </span>
        }
      >
        {data.logs.length === 0 ? (
          <EmptyState title="No synced attendance entries yet">
            <p>New codes added to the staff tracker will appear here automatically.</p>
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Day</th>
                  <th className="px-3 py-3">Code</th>
                  <th className="px-3 py-3">Leave / Attendance</th>
                  <th className="px-3 py-3">Credits</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((log) => (
                  <tr key={String(log["id"])} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-3 py-4 font-medium">
                      {formatDate(String(log["incident_date"]))}
                    </td>
                    <td className="px-3 py-4 text-muted-foreground">
                      {String(log["day_of_week"])}
                    </td>
                    <td className="px-3 py-4">
                      <span className={codeClass(String(log["code"]))}>{String(log["code"])}</span>
                    </td>
                    <td className="px-3 py-4">{String(log["leave_type"])}</td>
                    <td className="px-3 py-4 tabular-nums">{String(log["credited_days"])}</td>
                    <td className="px-3 py-4 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFlagId(String(log["id"]))}
                        className="min-h-11"
                      >
                        <Flag className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Inquire
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {selectedLog && (
        <Card className="mt-4 border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">
              Flag {String(selectedLog["code"])} on {String(selectedLog["incident_date"])}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Tell HR Allysa what needs to be checked."
              aria-label="Inquiry message"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void submitFlag()}
                disabled={message.trim().length < 3}
              >
                Send inquiry
              </Button>
              <Button type="button" variant="ghost" onClick={() => setFlagId(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Kpi({
  title,
  value: amount,
  suffix,
  icon,
}: {
  title: string;
  value: string;
  suffix?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border bg-background p-3 sm:p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        <span>{title}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
        {amount}
        {suffix && <span className="ml-1 text-xs font-normal text-muted-foreground">{suffix}</span>}
      </p>
    </div>
  );
}

function Bucket({
  title,
  code,
  value: amount,
  max,
}: {
  title: string;
  code: string;
  value: string;
  max: number;
}) {
  const numericAmount = Number(amount);
  const percent = max > 0 ? Math.min(100, Math.max(0, (numericAmount / max) * 100)) : 0;
  return (
    <div className="min-w-0">
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{title}</p>
          <p className="mt-0.5 text-xs font-bold text-primary">{code}</p>
        </div>
        <p className="text-lg font-semibold tabular-nums">{amount}</p>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`${title} leave balance`}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Number.isFinite(numericAmount) ? numericAmount : 0}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
