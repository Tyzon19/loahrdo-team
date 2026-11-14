import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ButtonLoading } from "@/components/app/LoadingPanel";
import { passwordIssues } from "@/lib/validation";
import { permissionChangePasswordFn, permissionUpdateProfileFn } from "@/server-functions";

export const Route = createFileRoute("/permission-slips/profile")({
  component: PermissionProfilePage,
});

function PermissionProfilePage() {
  const { permissionViewer } = Route.useRouteContext();
  const router = useRouter();
  const [name, setName] = useState(permissionViewer?.name ?? "");
  const [department, setDepartment] = useState(permissionViewer?.department ?? "");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileFieldErrors, setProfileFieldErrors] = useState<Record<string, string>>({});
  const [profileBusy, setProfileBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordFieldErrors, setPasswordFieldErrors] = useState<Record<string, string>>({});
  const [passwordBusy, setPasswordBusy] = useState(false);
  const hasViewer = Boolean(permissionViewer);
  const viewerName = permissionViewer?.name ?? "";
  const viewerDepartment = permissionViewer?.department ?? "";

  useEffect(() => {
    if (!hasViewer) return;
    setName(viewerName);
    setDepartment(viewerDepartment);
  }, [hasViewer, viewerName, viewerDepartment]);

  if (!permissionViewer) return null;

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (profileBusy) return;
    setProfileBusy(true);
    setProfileError(null);
    setProfileFieldErrors({});

    const result = await permissionUpdateProfileFn({ data: { name, department } });
    setProfileBusy(false);
    if (!result.ok) {
      setProfileError(result.error);
      setProfileFieldErrors(result.fieldErrors ?? {});
      return;
    }

    await router.invalidate();
    toast.success("Profile saved.");
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (passwordBusy) return;
    setPasswordError(null);
    setPasswordFieldErrors({});

    const issues = passwordIssues(newPassword);
    if (issues.length) {
      setPasswordFieldErrors({ newPassword: `Password must contain ${issues.join(", ")}.` });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFieldErrors({ confirmPassword: "The passwords do not match." });
      return;
    }

    setPasswordBusy(true);
    const result = await permissionChangePasswordFn({
      data: { currentPassword, newPassword },
    });
    setPasswordBusy(false);
    if (!result.ok) {
      setPasswordError(result.error);
      setPasswordFieldErrors(result.fieldErrors ?? {});
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    await router.invalidate();
    toast.success("Password updated.");
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <UserRound className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Profile &amp; account
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Update the name and department used in Permission Slip requests.
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-background p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-foreground">Profile details</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Email and Permission Slip access are managed by the administrator.
        </p>
        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={saveProfile} noValidate>
          {profileError && (
            <p role="alert" className="sm:col-span-2 text-sm text-destructive">
              {profileError}
            </p>
          )}
          <div>
            <Label htmlFor="permission-profile-name">Full name</Label>
            <Input
              id="permission-profile-name"
              className="mt-1 min-h-11"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={Boolean(profileFieldErrors["name"])}
              required
            />
            {profileFieldErrors["name"] && (
              <p className="mt-1 text-sm text-destructive">{profileFieldErrors["name"]}</p>
            )}
          </div>
          <div>
            <Label htmlFor="permission-profile-email">Email</Label>
            <Input
              id="permission-profile-email"
              className="mt-1 min-h-11"
              value={permissionViewer.email}
              readOnly
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="permission-profile-department">Department / Office</Label>
            <Input
              id="permission-profile-department"
              className="mt-1 min-h-11"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              aria-invalid={Boolean(profileFieldErrors["department"])}
              required
            />
            {profileFieldErrors["department"] && (
              <p className="mt-1 text-sm text-destructive">{profileFieldErrors["department"]}</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" className="min-h-11" disabled={profileBusy}>
              {profileBusy ? <ButtonLoading label="Saving" /> : "Save profile"}
            </Button>
          </div>
        </form>
      </section>

      {permissionViewer.mustChangePassword && (
        <p
          role="alert"
          className="rounded-md border border-warning/40 bg-warning-soft p-3 text-sm text-warning"
        >
          Change your temporary password before continuing to Permission Slip.
        </p>
      )}

      <section className="rounded-xl border border-border bg-background p-4 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Password</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use your current password to set a new one.
            </p>
          </div>
        </div>
        <form className="mt-5 max-w-md space-y-4" onSubmit={changePassword} noValidate>
          {passwordError && (
            <p role="alert" className="text-sm text-destructive">
              {passwordError}
            </p>
          )}
          <div>
            <Label htmlFor="permission-current-password">Current password</Label>
            <Input
              id="permission-current-password"
              type="password"
              autoComplete="current-password"
              className="mt-1 min-h-11"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              aria-invalid={Boolean(passwordFieldErrors["currentPassword"])}
              required
            />
            {passwordFieldErrors["currentPassword"] && (
              <p className="mt-1 text-sm text-destructive">
                {passwordFieldErrors["currentPassword"]}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="permission-new-password">New password</Label>
            <Input
              id="permission-new-password"
              type="password"
              autoComplete="new-password"
              className="mt-1 min-h-11"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              aria-invalid={Boolean(passwordFieldErrors["newPassword"])}
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              At least 12 characters, with upper and lower case, a number and a symbol.
            </p>
            {passwordFieldErrors["newPassword"] && (
              <p className="mt-1 text-sm text-destructive">{passwordFieldErrors["newPassword"]}</p>
            )}
          </div>
          <div>
            <Label htmlFor="permission-confirm-password">Confirm new password</Label>
            <Input
              id="permission-confirm-password"
              type="password"
              autoComplete="new-password"
              className="mt-1 min-h-11"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              aria-invalid={Boolean(passwordFieldErrors["confirmPassword"])}
              required
            />
            {passwordFieldErrors["confirmPassword"] && (
              <p className="mt-1 text-sm text-destructive">
                {passwordFieldErrors["confirmPassword"]}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" className="min-h-11" disabled={passwordBusy}>
              {passwordBusy ? <ButtonLoading label="Saving" /> : "Update password"}
            </Button>
            <Link
              to="/forgot-password"
              className="min-h-11 inline-flex items-center text-sm font-semibold text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}
