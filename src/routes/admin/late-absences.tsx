import { useState, type ReactNode } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock3, Database, RefreshCw, Save, Users } from "lucide-react";
import { PageHeader, Section, EmptyState } from "@/components/app/PageHeader";
import { LoadingPanel } from "@/components/app/LoadingPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unwrap } from "@/lib/api";
import { canManageHrdoAccounts } from "@/lib/hrdo";
import { STAFF_GROUPS, type StaffGroup } from "@/lib/late-absences";
import {
  listAttendanceAdminFn,
  resolveAttendanceFlagFn,
  saveAttendanceMappingFn,
  syncAttendanceGroupFn,
} from "@/server-functions";


export const Route = createFileRoute("/admin/late-absences")({
  beforeLoad: ({ context }) => {
    if (!(
      context.viewer?.role === "admin" ||
      context.viewer?.isSuperAdmin ||
      canManageHrdoAccounts(context.hrdoViewer)
    )) {
      throw redirect({ to: "/login", search: { redirect: "/admin/late-absences" } });
    }
  },
  head: () => ({ meta: [{ title: "Late & Absences Admin | LOA HRDO Desk" }] }),
  component: LateAbsencesAdmin,
});

const labels: Record<StaffGroup, string> = {
  NON_TEACHING: "Non-Teaching Staff",
  COLLEGE: "College",
  BASIC_ED: "Basic Education Staff",
};

function LateAbsencesAdmin() {
  const queryClient = useQueryClient();
  const [staffGroup, setStaffGroup] = useState<StaffGroup>("NON_TEACHING");
  const [mappingUser, setMappingUser] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [reply, setReply] = useState<Record<string, string>>({});
  const data = useQuery({
    queryKey: ["attendance-admin", staffGroup],
    queryFn: () => unwrap(listAttendanceAdminFn({ data: { staffGroup } })),
  });

  if (data.isPending) return <LoadingPanel label="Loading attendance administration" rows={8} />;
  if (data.isError) {
    return (
      <Section title="Late & Absences">
        <div className="p-6 text-center" role="alert">
          We couldn&apos;t load the attendance administration view.
        </div>
      </Section>
    );
  }

  function formatSyncTime(value: string) {
    const date = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("en-PH", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function AdminStat({
    icon,
    label,
    value,
    detail,
  }: {
    icon: ReactNode;
    label: string;
    value: string;
    detail?: string;
  }) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className="text-primary">{icon}</span>
          {label}
        </div>
        <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
        {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
      </div>
    );
  }

  const currentMappings = data.data.mappings.filter((item) => item.staff_group === staffGroup);
  const source = data.data.sources.find((item) => item.staff_group === staffGroup);
  async function sync() {
    if (syncing) return;
    setSyncing(true);
    try {
      await unwrap(syncAttendanceGroupFn({ data: { staffGroup } }));
      await queryClient.invalidateQueries({ queryKey: ["attendance-admin", staffGroup] });
    } finally {
      setSyncing(false);
    }
  }


  async function saveMapping() {
    if (!mappingUser || sheetName.trim().length < 2) return;
    await unwrap(
      saveAttendanceMappingFn({
        data: { userId: mappingUser, staffGroup, sheetEmployeeName: sheetName },
      }),
    );
    setMappingUser("");
    setSheetName("");
    await queryClient.invalidateQueries({ queryKey: ["attendance-admin", staffGroup] });
  }

  async function resolve(flagId: string) {
    const message = reply[flagId]?.trim();
    if (!message) return;
    await unwrap(resolveAttendanceFlagFn({ data: { flagId, message } }));
    await queryClient.invalidateQueries({ queryKey: ["attendance-admin", staffGroup] });
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <PageHeader
        title="Late & Absences Administration"
        description="Manage the three HRDO Google Sheets trackers and resolve employee discrepancies."
        actions={
          <Button type="button" onClick={() => void sync()} disabled={syncing} className="min-h-11">
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} aria-hidden />
            {syncing ? "Syncing…" : "Sync Google Sheets Now"}
          </Button>
        }
      />
      <div
        className="grid grid-cols-1 gap-2 rounded-xl border bg-card p-1.5 sm:grid-cols-3"
        role="tablist"
        aria-label="Staff groups"
      >
        {STAFF_GROUPS.map((group) => (
          <Button
            key={group}
            type="button"
            variant={staffGroup === group ? "default" : "outline"}
            onClick={() => setStaffGroup(group)}
            role="tab"
            aria-selected={staffGroup === group}
            className="min-h-11 border-0"
          >
            {labels[group]}
          </Button>
        ))}
      </div>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStat
          icon={<Users className="h-4 w-4" aria-hidden />}
          label="Mapped employees"
          value={String(currentMappings.length)}
        />
        <AdminStat
          icon={<Database className="h-4 w-4" aria-hidden />}
          label="Attendance records"
          value={String(data.data.attendanceLogs.length)}
        />
        <AdminStat
          icon={<AlertCircle className="h-4 w-4" aria-hidden />}
          label="Open inquiries"
          value={String(data.data.flags.length)}
        />
        <AdminStat
          icon={
            source?.sync_status === "SUCCESS" ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            ) : (
              <Clock3 className="h-4 w-4" aria-hidden />
            )
          }
          label="Last sync"
          value={source?.last_synced_at ? formatSyncTime(source.last_synced_at) : "Never"}
          detail={source?.sync_status ?? "NEVER"}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Employee Name-to-Account Mapper">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={mappingUser}
              onChange={(event) => setMappingUser(event.target.value)}
              aria-label="System account"
            >
              <option value="">Select account</option>
              {data.data.users.map((user) => (
                <option key={String(user["id"])} value={String(user["id"])}>
                  {String(user["name"])} · {String(user["email"])}
                </option>
              ))}
            </select>
            <Input
              value={sheetName}
              onChange={(event) => setSheetName(event.target.value)}
              placeholder="SURNAME, FIRST NAME M.I."
              aria-label="Sheet employee name"
            />
            <Button
              type="button"
              onClick={() => void saveMapping()}
              disabled={!mappingUser || sheetName.trim().length < 2}
            >
              <Save className="mr-2 h-4 w-4" aria-hidden /> Save
            </Button>
          </div>
          {currentMappings.length === 0 ? (
            <EmptyState title="No mappings for this staff group." />
          ) : (
            <ul className="mt-4 divide-y text-sm">
              {currentMappings.map((item) => (
                <li key={item.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>{item.sheet_employee_name}</span>
                  <span className="text-muted-foreground">
                    {item.name} · {item.email}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Employee Discrepancy Flag Inbox">
          {data.data.flags.length === 0 ? (
            <EmptyState title="No open discrepancy flags." />
          ) : (
            <div className="space-y-3">
              {data.data.flags.map((flag) => (
                <div key={String(flag["id"])} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">
                    {String(flag["name"])} · {String(flag["email"])}
                  </p>
                  <p className="mt-1">{String(flag["message"])}</p>
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={reply[String(flag["id"])] ?? ""}
                      onChange={(event) =>
                        setReply((current) => ({
                          ...current,
                          [String(flag["id"])]: event.target.value,
                        }))
                      }
                      placeholder="HR reply"
                      aria-label={`Reply to ${String(flag["name"])}`}
                    />
                    <Button
                      type="button"
                      onClick={() => void resolve(String(flag["id"]))}
                      disabled={!reply[String(flag["id"])]?.trim()}
                    >
                      Resolve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section title="Sync Logs">
        {data.data.logs.length === 0 ? (
          <EmptyState title="No sync runs yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Started</th>
                  <th className="px-3 py-2">Group</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Rows</th>
                  <th className="px-3 py-2">Changes</th>
                  <th className="px-3 py-2">Message</th>
                </tr>
              </thead>
              <tbody>
                {data.data.logs.map((log) => (
                  <tr key={String(log["id"])} className="border-b last:border-0">
                    <td className="px-3 py-2">{String(log["started_at"])}</td>
                    <td className="px-3 py-2">
                      {labels[String(log["staff_group"]) as StaffGroup] ??
                        String(log["staff_group"])}
                    </td>
                    <td className="px-3 py-2">{String(log["status"])}</td>
                    <td className="px-3 py-2">{String(log["rows_seen"])}</td>
                    <td className="px-3 py-2">{String(log["changes_applied"])}</td>
                    <td className="px-3 py-2">{String(log["message"] ?? "—")}</td>
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
