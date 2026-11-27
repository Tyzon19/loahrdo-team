import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { PageHeader, Section, EmptyState } from "@/components/app/PageHeader";
import { LoadingScreen } from "@/components/app/LoadingPanel";
import { AttendanceClaimCard } from "@/components/attendance/ClaimCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { unwrap } from "@/lib/api";
import { attendanceMonths, ATTENDANCE_REFRESH_MS, DEPARTMENT_LABELS } from "@/lib/attendance";
import { fmtDate, fmtDateTime, fmtRange } from "@/lib/format";
import { ATTENDANCE_CODES, BASE_ALLOCATION } from "@/lib/late-absences";
import {
  listMyAttendanceFn,
  respondToAttendanceIncidentFn,
  markAttendanceNotificationReadFn,
} from "@/server-functions";

const LEAVE_FILTER_CODES = ["S", "V", "M", "P", "B", "E", "SIL", "SP", "HE", "HV", "HS"] as const;
const ATTENDANCE_FILTER_CODES = ["LATE", "ABSENT"] as const;

export const Route = createFileRoute("/leaves/")({ component: AttendancePage });

function AttendancePage() {
  const { attendanceViewer } = Route.useRouteContext();
  return attendanceViewer ? <MyAttendance userId={attendanceViewer.id} /> : null;
}

function MyAttendance({ userId }: { userId: string }) {
  const cache = useQueryClient();
  const [month, setMonth] = useState("");
  const [code, setCode] = useState("");
  const [explainId, setExplainId] = useState<string | null>(null);
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attendance = useQuery({
    queryKey: ["my-attendance", userId],
    queryFn: () => unwrap(listMyAttendanceFn()),
    refetchInterval: ATTENDANCE_REFRESH_MS,
    refetchIntervalInBackground: true,
  });
  if (attendance.isPending) return <LoadingScreen label="Loading your attendance" />;
  if (attendance.isError)
    return (
      <Section title="My Leaves & Attendance">
        <p role="alert">We couldn't load your attendance records.</p>
        <Button variant="outline" onClick={() => void attendance.refetch()}>
          Try again
        </Button>
      </Section>
    );
  const data = attendance.data,
    profile = data.profile;
  const unacknowledged = data.logs.filter(
    (log) => ["LATE", "ABSENT"].includes(log.code) && !log.acknowledgedAt,
  );
  const visible = data.logs.filter(
    (log) => (!month || log.date.startsWith(month)) && (!code || log.code === code),
  );
  const selected = data.logs.find((log) => log.id === explainId);
  const trackerRemaining = profile
    ? profile.remainingEl + profile.remainingSl + profile.remainingVl + profile.remainingBl
    : 0;
  const remaining = profile ? Math.min(BASE_ALLOCATION, Math.max(0, trackerRemaining)) : 0;

  async function respond(log: (typeof data.logs)[number], text?: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await unwrap(
        respondToAttendanceIncidentFn({
          data: {
            incidentId: log.id,
            revision: log.revision,
            ...(text ? { explanation: text } : {}),
          },
        }),
      );
      setExplainId(null);
      setExplanation("");
      await cache.invalidateQueries({ queryKey: ["my-attendance"] });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save your response.");
    } finally {
      setBusy(false);
    }
  }

  async function readNotification(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await unwrap(markAttendanceNotificationReadFn({ data: id }));
      await cache.invalidateQueries({ queryKey: ["my-attendance"] });
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Unable to mark the notification as read.",
      );
    } finally {
      setBusy(false);
    }
  }

  const refresh = (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm">
        <Link to="/leaves/requests">Request leave</Link>
      </Button>
      <Button variant="outline" size="sm" onClick={() => void attendance.refetch()}>
        <RefreshCw className="mr-2 size-4" aria-hidden />
        Refresh
      </Button>
    </div>
  );
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      {!profile?.active && <PageHeader title="My Leaves & Attendance" actions={refresh} />}
      {!profile ? (
        <AttendanceClaimCard pending={Boolean(data.claim)} claim={data.claim} />
      ) : !profile.active ? (
        <Section title="Attendance record unavailable">
          <p role="alert">
            Your linked row is no longer present in the latest tracker. Contact HRDO to verify your
            record.
          </p>
        </Section>
      ) : (
        <>
          <section
            aria-labelledby="hrdo-summary"
            className="overflow-hidden rounded-2xl border border-t-4 border-t-primary bg-card shadow-sm"
          >
            <div className="flex items-center gap-3 px-5 pt-5 sm:px-7 sm:pt-7">
              <img
                src="/HRDO%20LOGO.png"
                alt=""
                width="44"
                height="44"
                className="size-11 shrink-0 object-contain"
              />
              <div>
                <h1 id="hrdo-summary" className="text-sm font-semibold tracking-wide">
                  HRDO · Leave summary
                </h1>
                <p className="text-xs text-muted-foreground">
                  {DEPARTMENT_LABELS[profile.departmentGroup]}
                </p>
              </div>
              <div className="ml-auto">{refresh}</div>
            </div>
            <div className="grid gap-5 px-5 py-5 sm:px-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <Greeting key={profile.fullName} name={profile.fullName} />
                <p className="mt-2 text-sm leading-relaxed">
                  {profile.leavesThisMonth === 0
                    ? "You have no leave recorded for the month selected in the HR tracker."
                    : `You used ${days(profile.leavesThisMonth)} of leave in the month selected in the HR tracker.`}{" "}
                  You have used {days(profile.leavesThisYear)} this cycle.
                </p>
              </div>
              <div className="rounded-xl bg-primary/5 px-5 py-3 lg:min-w-48">
                <p className="text-sm font-medium">Available leave</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-primary tabular-nums">
                  {days(remaining)}
                </p>
              </div>
            </div>
            <div className="px-5 sm:px-7">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-y py-4 text-sm sm:grid-cols-4">
                {(
                  [
                    ["Emergency", profile.remainingEl],
                    ["Sick", profile.remainingSl],
                    ["Vacation", profile.remainingVl],
                    ["Birthday", profile.remainingBl],
                  ] as const
                ).map(([label, balance]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums">{days(balance)}</dd>
                  </div>
                ))}
              </dl>
              <details className="py-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  Leave cycle and credit details
                </summary>
                <p className="mt-2 leading-relaxed text-muted-foreground">
                  Your current leave cycle runs from{" "}
                  {fmtRange(profile.cycleStart, profile.cycleEnd)}. The combined annual credit is
                  capped at 17 days. Emergency, Sick, Vacation, and Birthday balances come directly
                  from the latest HR tracker totals; history rows do not recalculate those balances.
                  Approved requests waiting to sync are reserved during HR approval.
                </p>
              </details>
              {profile.remarks && <p className="pb-3 text-sm">{profile.remarks}</p>}
              <p className="border-t py-3 text-xs text-muted-foreground">
                Last synced {fmtDateTime(profile.syncedAt)}
              </p>
            </div>
          </section>
          {unacknowledged.length > 0 && (
            <section
              role="alert"
              className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
            >
              <h2 className="font-semibold">
                {unacknowledged.length} late / absence{" "}
                {unacknowledged.length === 1 ? "entry needs" : "entries need"} your acknowledgment
              </h2>
              <ul className="mt-3 space-y-3">
                {unacknowledged.map((log) => (
                  <li key={log.id} className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="mr-auto">
                      {fmtDate(log.date)} · {log.leaveType}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void respond(log)}
                    >
                      Acknowledge {fmtDate(log.date)}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setExplainId(log.id);
                        setExplanation(log.explanation ?? "");
                      }}
                    >
                      Explain {fmtDate(log.date)}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {selected && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Explain {selected.code} on {fmtDate(selected.date)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Label htmlFor="incident-explanation">Explanation for HRDO</Label>
                <Textarea
                  id="incident-explanation"
                  maxLength={1000}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    disabled={busy || explanation.trim().length < 3}
                    onClick={() => void respond(selected, explanation.trim())}
                  >
                    Submit explanation
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setExplainId(null)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {data.notifications.some((notice) => !notice.read) && (
            <Section title="Attendance Notifications">
              <ul className="divide-y">
                {data.notifications
                  .filter((notice) => !notice.read)
                  .map((notice) => (
                    <li key={notice.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                      <div className="mr-auto">
                        <p className="font-medium">{notice.heading}</p>
                        <p className="mt-1 text-muted-foreground">{notice.body}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => void readNotification(notice.id)}
                      >
                        Mark as read
                      </Button>
                    </li>
                  ))}
              </ul>
            </Section>
          )}
          <Section
            title="Leave & Attendance History"
            actions={
              <span className="text-xs text-muted-foreground">{visible.length} records</span>
            }
          >
            <div className="mb-4 flex flex-wrap gap-3">
              <div className="space-y-1">
                <Label htmlFor="attendance-month">Month</Label>
                <select
                  id="attendance-month"
                  className="block h-10 rounded-md border bg-background px-3 text-sm"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                >
                  <option value="">All months</option>
                  {attendanceMonths(data.logs.map((log) => log.date)).map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="attendance-code">Type</Label>
                <select
                  id="attendance-code"
                  className="block h-10 rounded-md border bg-background px-3 text-sm"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                >
                  <option value="">All types</option>
                  <optgroup label="Leaves">
                    {LEAVE_FILTER_CODES.map((value) => (
                      <option key={value} value={value}>
                        {ATTENDANCE_CODES[value].leaveType}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Attendance">
                    {ATTENDANCE_FILTER_CODES.map((value) => (
                      <option key={value} value={value}>
                        {ATTENDANCE_CODES[value].leaveType}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>
            {visible.length === 0 ? (
              <EmptyState title="No attendance entries for these filters." />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="data-table w-full min-w-[680px] border-collapse text-left text-sm">
                  <caption className="sr-only">Your synced leave and attendance history</caption>
                  <thead className="bg-muted/70 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="border-b border-r px-4 py-3">
                        Date
                      </th>
                      <th scope="col" className="border-b border-r px-4 py-3">
                        Type
                      </th>
                      <th scope="col" className="border-b border-r px-4 py-3 text-right">
                        Days
                      </th>
                      <th scope="col" className="border-b border-r px-4 py-3">
                        Status
                      </th>
                      <th scope="col" className="border-b px-4 py-3">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((log) => (
                      <tr key={log.id} className="border-b last:border-b-0 hover:bg-muted/30">
                        <td className="whitespace-nowrap border-r px-4 py-3 font-medium">
                          {fmtDate(log.date)}
                        </td>
                        <td className="border-r px-4 py-3">{log.leaveType}</td>
                        <td className="border-r px-4 py-3 text-right tabular-nums">
                          {log.days.toFixed(1)}
                        </td>
                        <td className="border-r px-4 py-3">
                          <span
                            className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${["LATE", "ABSENT"].includes(log.code) && !log.acknowledgedAt ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"}`}
                          >
                            {["LATE", "ABSENT"].includes(log.code)
                              ? log.acknowledgedAt
                                ? "Acknowledged"
                                : "Needs acknowledgment"
                              : "Recorded"}
                          </span>
                          {log.explanation && (
                            <p className="mt-2 max-w-xs whitespace-pre-wrap text-xs text-muted-foreground">
                              {log.explanation}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {["LATE", "ABSENT"].includes(log.code) ? (
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0"
                              disabled={busy}
                              onClick={() => {
                                setExplainId(log.id);
                                setExplanation(log.explanation ?? "");
                              }}
                            >
                              Explain
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function days(value: number) {
  return `${value} ${value === 1 ? "day" : "days"}`;
}

function Greeting({ name }: { name: string }) {
  const greeting = `Hello, ${name}.`.replace(/\.{2}$/, ".");
  const [length, setLength] = useState(greeting.length);
  useEffect(() => {
    if (!window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let position = 0;
    setLength(0);
    const timer = window.setInterval(
      () => {
        position += 1;
        setLength(position);
        if (position >= greeting.length) window.clearInterval(timer);
      },
      Math.min(32, 1200 / greeting.length),
    );
    return () => window.clearInterval(timer);
  }, [greeting]);
  return (
    <p className="min-h-8 break-words text-2xl font-semibold tracking-tight sm:text-3xl">
      <span className="sr-only">{greeting}</span>
      <span aria-hidden="true">{greeting.slice(0, length)}</span>
    </p>
  );
}
