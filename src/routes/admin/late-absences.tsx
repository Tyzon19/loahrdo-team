import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { AttendanceShell } from "@/components/attendance/AttendanceShell";
import { PageHeader, Section, EmptyState } from "@/components/app/PageHeader";
import { LoadingScreen } from "@/components/app/LoadingPanel";
import { Button } from "@/components/ui/button";
import { unwrap } from "@/lib/api";
import { attendanceAdminAllowed } from "@/lib/attendance-access";
import { DEPARTMENT_LABELS } from "@/lib/attendance";
import { listAttendanceAdminFn, approveAttendanceClaimFn } from "@/server-functions";

export const Route = createFileRoute("/admin/late-absences")({
  beforeLoad: ({ context }) => {
    if (!context.attendanceViewer)
      throw redirect({
        to: "/leaves/login",
        search: { redirect: "/admin/late-absences", error: undefined },
      });
    if (!attendanceAdminAllowed(context.attendanceViewer)) throw redirect({ to: "/leaves" });
    if (
      context.attendanceViewer.mustChangePassword ||
      context.attendanceViewer.needsProfileCompletion
    )
      throw redirect({ to: "/leaves/account" });
  },
  head: () => ({ meta: [{ title: "Attendance Sync & Claims | LOA HRDO Desk" }] }),
  component: AdminAttendancePage,
});

function AdminAttendancePage() {
  const { attendanceViewer } = Route.useRouteContext();
  if (!attendanceViewer) return null;
  return (
    <AttendanceShell user={attendanceViewer}>
      <AttendanceAdmin actorId={attendanceViewer.id} />
    </AttendanceShell>
  );
}

function AttendanceAdmin({ actorId }: { actorId: string }) {
  const cache = useQueryClient();
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const result = useQuery({
    queryKey: ["attendance-admin", actorId],
    queryFn: () => unwrap(listAttendanceAdminFn({ data: {} })),
    refetchInterval: 30_000,
  });
  if (result.isPending) return <LoadingScreen label="Loading attendance administration" />;
  if (result.isError)
    return (
      <Section title="Attendance Sync & Claims">
        <p role="alert">We couldn't load the administration panel.</p>
        <Button variant="outline" onClick={() => void result.refetch()}>
          Try again
        </Button>
      </Section>
    );
  const data = result.data;
  async function approve(claimId: string, profileId: string) {
    if (busy || !profileId) return;
    setBusy(true);
    setError("");
    try {
      await unwrap(approveAttendanceClaimFn({ data: { claimId, profileId } }));
      await cache.invalidateQueries({ queryKey: ["attendance-admin"] });
      await cache.invalidateQueries({ queryKey: ["my-attendance"] });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to approve the claim.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <PageHeader
        title="Attendance Sync & Claims"
        description="Track the three STAFF trackers, verify employee records, and read incident explanations."
        actions={
          <Button variant="outline" onClick={() => void result.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
            Refresh status
          </Button>
        }
      />
      <div className="grid gap-3 lg:grid-cols-3">
        {data.sources.map((source) => (
          <Section key={source.group} title={DEPARTMENT_LABELS[source.group]}>
            <p className="font-semibold">{source.status}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Last successful sync: {source.syncedAt ?? "Never"}
            </p>
            {source.message && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {source.message}
              </p>
            )}
          </Section>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Apps Script pushes each tracker every 15 minutes. To push immediately, run
        syncAllStaffGroupsNow in the script editor.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Section title="HRDO Verification Queue">
        {data.claims.length === 0 ? (
          <EmptyState title="No pending profile claims." />
        ) : (
          <div className="space-y-4">
            {data.claims.map((claim) => {
              const available = claim.candidates.filter((p) => !p.claimed);
              // A duplicate always needs an explicit row selection, even if only one is unclaimed.
              const chosen =
                selection[claim.id] ??
                (claim.status !== "DUPLICATE_REVIEW_REQUIRED" &&
                claim.candidates.length === 1 &&
                available.length === 1
                  ? available[0]!.id
                  : "");
              return (
                <div key={claim.id} className="rounded-lg border p-4 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {claim.accountName} · {claim.email}
                      </p>
                      <p className="mt-1">
                        Submitted: {claim.submittedName} · {DEPARTMENT_LABELS[claim.group]}
                      </p>
                    </div>
                    <p className="text-xs font-medium text-muted-foreground">
                      {claim.status.replaceAll("_", " ")}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <select
                      aria-label={`Exact STAFF row for ${claim.email}`}
                      className="h-10 min-w-0 max-w-full rounded-md border bg-background px-3"
                      disabled={busy}
                      value={chosen}
                      onChange={(event) =>
                        setSelection((current) => ({ ...current, [claim.id]: event.target.value }))
                      }
                    >
                      <option value="">Select the verified STAFF row</option>
                      {claim.candidates.map((profile) => (
                        <option key={profile.id} value={profile.id} disabled={profile.claimed}>
                          Row {profile.row}: {profile.name}
                          {profile.claimed ? " (already linked)" : ""}
                        </option>
                      ))}
                    </select>
                    <Button
                      disabled={busy || !chosen}
                      onClick={() => void approve(claim.id, chosen)}
                    >
                      Approve link
                    </Button>
                  </div>
                  {available.length === 0 && (
                    <p className="mt-2 text-muted-foreground">
                      No available matching row. Confirm the submitted full given name and
                      department with the employee, then refresh after the tracker sync.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>
      <Section title="Employee Explanations">
        {data.explanations.length === 0 ? (
          <EmptyState title="No incident explanations yet." />
        ) : (
          <ul className="divide-y">
            {data.explanations.map((item) => (
              <li key={item.id} className="py-3 text-sm">
                <p className="font-medium">
                  {item.name} · {item.email}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {item.date} · {item.code} · Acknowledged {item.acknowledgedAt}
                  {!item.current && " · Previous tracker revision"}
                </p>
                <p className="mt-2 whitespace-pre-wrap">{item.explanation}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Sync Audit Logs">
        {data.logs.length === 0 ? (
          <EmptyState title="No sync runs yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="sr-only">Latest 50 Sheets sync attempts</caption>
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  {["Started", "Tracker", "Status", "Rows", "Changes", "Message"].map((heading) => (
                    <th key={heading} className="px-3 py-2">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.logs.map((log) => (
                  <tr key={log.id} className="border-b last:border-0">
                    <td className="px-3 py-3">{log.startedAt}</td>
                    <td className="px-3 py-3">{DEPARTMENT_LABELS[log.group]}</td>
                    <td className="px-3 py-3">{log.status}</td>
                    <td className="px-3 py-3">{log.rows}</td>
                    <td className="px-3 py-3">{log.changes}</td>
                    <td className="px-3 py-3">{log.message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
