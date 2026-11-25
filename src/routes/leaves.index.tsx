import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, RefreshCw } from "lucide-react";
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
import { ATTENDANCE_CODES } from "@/lib/late-absences";
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

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <PageHeader
        title="My Leaves & Attendance"
        description="Your leave credits and synced attendance records."
        actions={
          <Button variant="outline" onClick={() => void attendance.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
            Refresh
          </Button>
        }
      />
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
          <section className="overflow-hidden rounded-2xl border bg-card p-5 shadow-sm lg:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {DEPARTMENT_LABELS[profile.departmentGroup]}
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">{profile.fullName}</h2>
              </div>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarRange className="h-4 w-4" aria-hidden />
                {fmtRange(profile.cycleStart, profile.cycleEnd)}
              </p>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Summary
                title="Total Remaining"
                amount={
                  profile.remainingEl +
                  profile.remainingSl +
                  profile.remainingVl +
                  profile.remainingBl
                }
              />
              <Summary title="TOTAL EL" amount={profile.remainingEl} />
              <Summary title="TOTAL SL" amount={profile.remainingSl} />
              <Summary title="TOTAL VL" amount={profile.remainingVl} />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Total includes {profile.remainingBl.toFixed(1)} birthday leave day(s), calculated from
              the sheet's birthday total and BL carry over. Used in the sheet-selected month:{" "}
              {profile.leavesThisMonth.toFixed(1)} · Cycle used: {profile.leavesThisYear.toFixed(1)}
              . Last synced: {fmtDateTime(profile.syncedAt)} (server time).
            </p>
            {profile.remarks && (
              <p className="mt-2 text-sm text-muted-foreground">{profile.remarks}</p>
            )}
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
                  {attendanceMonths(profile.cycleStart).map((m) => (
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
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <caption className="sr-only">Your synced leave and attendance history</caption>
                  <thead className="border-b text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3">Date</th>
                      <th className="px-3 py-3">Type</th>
                      <th className="px-3 py-3">Days</th>
                      <th className="px-3 py-3">Acknowledgment</th>
                      <th className="px-3 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((log) => (
                      <tr key={log.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-3 py-4 font-medium">{fmtDate(log.date)}</td>
                        <td className="px-3 py-4">{log.leaveType}</td>
                        <td className="px-3 py-4 tabular-nums">{log.days.toFixed(1)}</td>
                        <td className="px-3 py-4">
                          {["LATE", "ABSENT"].includes(log.code)
                            ? log.acknowledgedAt
                              ? "Acknowledged"
                              : "Awaiting acknowledgment"
                            : "—"}
                          {log.explanation && (
                            <p className="mt-1 max-w-xs whitespace-pre-wrap text-xs text-muted-foreground">
                              {log.explanation}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-4">
                          {["LATE", "ABSENT"].includes(log.code) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => {
                                setExplainId(log.id);
                                setExplanation(log.explanation ?? "");
                              }}
                            >
                              Explain
                            </Button>
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

function Summary({ title, amount }: { title: string; amount: number }) {
  return (
    <Card className="min-w-0 rounded-xl">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <p className="text-2xl font-semibold tabular-nums">
          {amount.toFixed(1)}{" "}
          <span className="text-xs font-normal text-muted-foreground">days</span>
        </p>
      </CardContent>
    </Card>
  );
}
