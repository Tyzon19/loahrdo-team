import { useState, type ReactNode } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock3, RefreshCw, Umbrella } from "lucide-react";
import { PageHeader, Section, EmptyState } from "@/components/app/PageHeader";
import { LoadingPanel } from "@/components/app/LoadingPanel";
import { Button } from "@/components/ui/button";
import { unwrap } from "@/lib/api";
import { STAFF_GROUPS, type StaffGroup } from "@/lib/late-absences";
import { listDirectorAttendanceFn } from "@/server-functions";

export const Route = createFileRoute("/director/late-absences")({
  beforeLoad: ({ context }) => {
    if (
      context.viewer?.role !== "director" &&
      context.viewer?.role !== "admin" &&
      !context.viewer?.isSuperAdmin
    ) {
      throw redirect({ to: "/login", search: { redirect: "/director/late-absences" } });
    }
  },
  head: () => ({ meta: [{ title: "Executive Attendance View | LOA HRDO Desk" }] }),
  component: DirectorLateAbsences,
});


const labels: Record<StaffGroup, string> = {
  NON_TEACHING: "Non-Teaching Staff",
  COLLEGE: "College",
  BASIC_ED: "Basic Education Staff",
};

function DirectorLateAbsences() {
  const [staffGroup, setStaffGroup] = useState<StaffGroup | undefined>();
  const data = useQuery({
    queryKey: ["director-attendance", staffGroup],
    queryFn: () => unwrap(listDirectorAttendanceFn({ data: { staffGroup } })),
    refetchInterval: 10_000,
  });

  if (data.isPending) return <LoadingPanel label="Loading executive attendance view" rows={8} />;
  if (data.isError)
    return (
      <Section title="Executive Attendance View">
        <div className="p-6 text-center" role="alert">
          We couldn&apos;t load the executive attendance view.
        </div>
      </Section>
    );

  const totalYear = data.data.balances.reduce(
    (sum, item) => sum + Number(item["leaves_this_year"] ?? 0),
    0,
  );
  const totalLates = data.data.balances.reduce(
    (sum, item) => sum + Number(item["total_lates"] ?? 0),
    0,
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <PageHeader
        title="Executive Attendance View"
        description="Read-only late, absence, and leave balance visibility across all staff groups."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => void data.refetch()}
            className="min-h-11"
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden /> Refresh
          </Button>
        }
      />
      <div
        className="grid grid-cols-1 gap-2 rounded-xl border bg-card p-1.5 sm:grid-cols-4"
        aria-label="Staff group filter"
      >
        <Button
          type="button"
          variant={!staffGroup ? "default" : "outline"}
          onClick={() => setStaffGroup(undefined)}
          className="min-h-11 border-0"
        >
          All groups
        </Button>
        {STAFF_GROUPS.map((group) => (
          <Button
            key={group}
            type="button"
            variant={staffGroup === group ? "default" : "outline"}
            onClick={() => setStaffGroup(group)}
            className="min-h-11 border-0"
          >
            {labels[group]}
          </Button>
        ))}
      </div>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Leaves this year"
          value={String(totalYear)}
          icon={<CalendarDays className="h-4 w-4" aria-hidden />}
        />
        <Kpi
          label="Leaves this month"
          value={String(
            data.data.balances.reduce(
              (sum, item) => sum + Number(item["leaves_this_month"] ?? 0),
              0,
            ),
          )}
          icon={<Umbrella className="h-4 w-4" aria-hidden />}
        />
        <Kpi
          label="Total lates"
          value={String(totalLates)}
          icon={<Clock3 className="h-4 w-4" aria-hidden />}
        />
        <Kpi label="Recent alerts" value={String(data.data.notifications.length)} />
      </section>
      <Section title="Recent late & absence alerts">
        {data.data.logs.length === 0 ? (
          <EmptyState title="No attendance alerts yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Group</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Credited</th>
                </tr>
              </thead>
              <tbody>
                {data.data.logs.map((log) => (
                  <tr key={String(log["id"])} className="border-b last:border-0">
                    <td className="px-3 py-3 font-medium">
                      {formatIncidentDate(String(log["incident_date"]))}
                    </td>
                    <td className="px-3 py-2">{String(log["name"])}</td>
                    <td className="px-3 py-2">
                      {labels[String(log["staff_group"]) as StaffGroup] ??
                        String(log["staff_group"])}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex min-w-12 justify-center rounded-md bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                        {String(log["code"])}
                      </span>
                    </td>
                    <td className="px-3 py-2">{String(log["leave_type"])}</td>
                    <td className="px-3 py-2">{String(log["credited_days"])}</td>
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

function formatIncidentDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function Kpi({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon && <span className="text-primary">{icon}</span>}
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
