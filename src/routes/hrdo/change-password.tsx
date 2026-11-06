import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AlertCircle, KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, Section } from "@/components/app/PageHeader";
import { ButtonLoading } from "@/components/app/LoadingPanel";
import { passwordIssues } from "@/lib/validation";
import { hrdoChangePasswordFn } from "@/server-functions";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/hrdo/change-password")({
  beforeLoad: ({ context }) => {
    if (!context.hrdoViewer) {
      throw redirect({ to: "/hrdo/login" });
    }
  },
  head: () => ({
    meta: [
      { title: `Change password — ${SITE.name}` },
      { name: "description", content: "Choose a new password for your HRDO account." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: HrdoChangePassword,
});

function HrdoChangePassword() {
  const { hrdoViewer } = Route.useRouteContext();
  const router = useRouter();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (!hrdoViewer) return null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const dashboardTarget =
      hrdoViewer?.role === "hrdo_staff" || hrdoViewer?.role === "hrdo_admin"
        ? "/hrdo/dashboard"
        : "/hrdo/coe";
    setError(null);
    setFieldErrors({});

    const issues = passwordIssues(newPassword);
    if (issues.length) {
      setFieldErrors({ newPassword: `Password must contain ${issues.join(", ")}.` });
      return;
    }
    if (newPassword !== confirm) {
      setFieldErrors({ confirm: "The passwords do not match." });
      return;
    }

    setBusy(true);
    const result = await hrdoChangePasswordFn({ data: { currentPassword, newPassword } });
    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      setBusy(false);
      return;
    }

    await router.invalidate();
    toast.success("Password updated.");
    await navigate({ to: dashboardTarget });
  }

  return (
    <>
      <PageHeader
        title="Change password"
        description={
          hrdoViewer.mustChangePassword
            ? "Your HRDO account was issued an initial password. Choose a new one before continuing."
            : "Choose a new password for your HRDO account."
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Section title="Account password">
          <form className="max-w-md space-y-4" onSubmit={onSubmit} noValidate>
            {error && (
              <div role="alert" className="flex gap-2 rounded-sm border border-destructive/40 bg-danger-soft p-3 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                <span>{error}</span>
              </div>
            )}
            <div>
              <Label htmlFor="current">Current password</Label>
              <Input
                id="current"
                type="password"
                autoComplete="current-password"
                required
                className="mt-1"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                aria-invalid={Boolean(fieldErrors["currentPassword"])}
              />
              {fieldErrors["currentPassword"] && (
                <p className="mt-1 text-sm text-destructive">{fieldErrors["currentPassword"]}</p>
              )}
            </div>
            <div>
              <Label htmlFor="new">New password</Label>
              <Input
                id="new"
                type="password"
                autoComplete="new-password"
                required
                maxLength={128}
                className="mt-1"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                aria-invalid={Boolean(fieldErrors["newPassword"])}
                aria-describedby="new-password-help"
              />
              <p id="new-password-help" className="mt-1 text-xs text-muted-foreground">
                At least 12 characters, with upper and lower case, a number and a symbol.
              </p>
              {fieldErrors["newPassword"] && (
                <p className="mt-1 text-sm text-destructive">{fieldErrors["newPassword"]}</p>
              )}
            </div>
            <div>
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                maxLength={128}
                className="mt-1"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                aria-invalid={Boolean(fieldErrors["confirm"])}
              />
              {fieldErrors["confirm"] && (
                <p className="mt-1 text-sm text-destructive">{fieldErrors["confirm"]}</p>
              )}
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? <ButtonLoading label="Saving…" /> : "Update password"}
            </Button>
          </form>
        </Section>
        <aside className="panel h-fit p-4 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <KeyRound className="h-4 w-4 text-primary" aria-hidden />
            Security
          </div>
          <p className="mt-2 text-muted-foreground">
            Use a strong password and avoid reusing credentials from other systems.
          </p>
          <div className="mt-4 flex items-center gap-2 text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            Session protected by your HRDO account.
          </div>
        </aside>
      </div>
    </>
  );
}
