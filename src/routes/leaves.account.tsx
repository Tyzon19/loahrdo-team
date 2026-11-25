import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Section } from "@/components/app/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { unwrap } from "@/lib/api";
import { completeAttendanceProfileFn, changeAttendancePasswordFn } from "@/server-functions";

export const Route = createFileRoute("/leaves/account")({
  head: () => ({ meta: [{ title: "Attendance Account | LOA Leave & Attendance" }] }),
  component: AttendanceAccountPage,
});
function AttendanceAccountPage() {
  const { attendanceViewer: user } = Route.useRouteContext();
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!user) return null;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !user) return;
    setBusy(true);
    setError("");
    try {
      if (user.needsProfileCompletion)
        await unwrap(
          completeAttendanceProfileFn({ data: { firstName, middleName: "", lastName } }),
        );
      else
        await unwrap(
          changeAttendancePasswordFn({ data: { currentPassword, newPassword, confirmPassword } }),
        );
      window.location.assign("/leaves");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to update your account.");
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Section title="Attendance Account">
        <p className="font-medium">{user.name}</p>
        <p className="text-sm text-muted-foreground">{user.email}</p>
        <p className="mt-2 text-sm text-muted-foreground">{user.role.replaceAll("_", " ")}</p>
      </Section>
      {user.needsProfileCompletion || user.canChangePassword ? (
        <Section title={user.needsProfileCompletion ? "Complete your name" : "Change password"}>
          <form className="space-y-4" onSubmit={(e) => void submit(e)}>
            {user.mustChangePassword && (
              <p className="text-sm">Update your password before continuing to attendance.</p>
            )}
            {user.needsProfileCompletion ? (
              <>
                <div>
                  <Label htmlFor="attendance-first-name">First Name</Label>
                  <Input
                    id="attendance-first-name"
                    required
                    value={firstName}
                    onChange={(e) => setFirst(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="attendance-last-name">Last Name</Label>
                  <Input
                    id="attendance-last-name"
                    required
                    value={lastName}
                    onChange={(e) => setLast(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="attendance-current-password">Current password</Label>
                  <Input
                    id="attendance-current-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrent(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="attendance-new-password">New password</Label>
                  <Input
                    id="attendance-new-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={newPassword}
                    onChange={(e) => setNew(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="attendance-confirm-password">Confirm new password</Label>
                  <Input
                    id="attendance-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button disabled={busy} type="submit">
              {busy ? "Saving…" : "Save attendance account"}
            </Button>
          </form>
        </Section>
      ) : (
        <Section title="Institutional Google account">
          <p className="text-sm text-muted-foreground">
            Continue signing in with institutional Google. Contact HRDO for password assistance.
          </p>
        </Section>
      )}
    </div>
  );
}
