import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ButtonLoading, LoadingPanel } from "@/components/app/LoadingPanel";
import { Section } from "@/components/app/PageHeader";
import {
  createHrdoProcessorAccountFn,
  listHrdoProcessorAccountsFn,
  resetHrdoProcessorPasswordFn,
} from "@/server-functions";
import { unwrap } from "@/lib/api";
import { FORMAL_NAME_PREFIXES } from "@/lib/name";

type ProcessorForm = {
  prefix: string;
  name: string;
  email: string;
  department: string;
  isHrdoAdmin?: boolean;
};

export function HrdoProcessorSettings({
  canCreateAdmin = false,
  canResetPasswords = false,
}: {
  canCreateAdmin?: boolean;
  canResetPasswords?: boolean;
}) {
  const queryClient = useQueryClient();
  const accounts = useQuery({
    queryKey: ["hrdo-processor-accounts"],
    queryFn: () => unwrap(listHrdoProcessorAccountsFn()),
  });
  const [form, setForm] = useState<ProcessorForm>({
    prefix: "",
    name: "",
    email: "",
    department: "",
    isHrdoAdmin: false,
  });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{
    name: string;
    email: string;
    role: "hrdo_staff" | "hrdo_admin";
    emailSent: boolean;
    emailMessage?: string;
    temporaryPassword?: string;
  } | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetCredentials, setResetCredentials] = useState<{
    email: string;
    emailSent: boolean;
    emailMessage?: string;
    temporaryPassword?: string;
  } | null>(null);

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setCreated(null);
    try {
      const result = await createHrdoProcessorAccountFn({
        data: {
          ...form,
          name: `${form.prefix ? `${form.prefix} ` : ""}${form.name.trim()}`,
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { name, email, role, emailDelivery, temporaryPassword } = result.data;
      setCreated({
        name,
        email,
        role,
        emailSent: emailDelivery.sent,
        ...(!emailDelivery.sent ? { emailMessage: emailDelivery.message } : {}),
        ...(temporaryPassword ? { temporaryPassword } : {}),
      });
      setForm({ prefix: "", name: "", email: "", department: "", isHrdoAdmin: false });
      if (emailDelivery.sent) {
        toast.success("HRDO account created. Login details emailed.");
      } else {
        toast.error(emailDelivery.message ?? "Account created, but its email was not sent.");
      }
      await queryClient.invalidateQueries({ queryKey: ["hrdo-processor-accounts"] });
    } catch {
      toast.error("We couldn't create the HRDO processor account. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(account: NonNullable<typeof accounts.data>[number]) {
    if (resettingId) return;
    if (!window.confirm(`Issue a temporary password for ${account.name}?`)) return;
    setResettingId(account.id);
    setResetCredentials(null);
    try {
      const result = await resetHrdoProcessorPasswordFn({ data: { userId: account.id } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { email, emailDelivery, temporaryPassword } = result.data;
      setResetCredentials({
        email,
        emailSent: emailDelivery.sent,
        ...(!emailDelivery.sent ? { emailMessage: emailDelivery.message } : {}),
        ...(temporaryPassword ? { temporaryPassword } : {}),
      });
      if (emailDelivery.sent) {
        toast.success("Temporary password sent. The processor must change it at next sign-in.");
      } else {
        toast.error(emailDelivery.message ?? "Password reset, but the email was not sent.");
      }
      await queryClient.invalidateQueries({ queryKey: ["hrdo-processor-accounts"] });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "We couldn't reset the processor password.",
      );
    } finally {
      setResettingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Section title="Create HRDO processor account">
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
          Add an HRDO staff member who can review and process COE requests. The account holder will
          receive a temporary password and must change it at first sign-in.
        </p>
        <form className="grid max-w-3xl gap-4 sm:grid-cols-2" onSubmit={createAccount}>
          <div>
            <Label htmlFor="hrdo-processor-prefix">Name prefix</Label>
            <select
              id="hrdo-processor-prefix"
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.prefix}
              onChange={(event) =>
                setForm((current) => ({ ...current, prefix: event.target.value }))
              }
            >
              <option value="">No prefix</option>
              {FORMAL_NAME_PREFIXES.map((prefix) => (
                <option key={prefix} value={prefix}>
                  {prefix}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="hrdo-processor-name">Full name</Label>
            <Input
              id="hrdo-processor-name"
              className="mt-1"
              maxLength={120}
              required
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="hrdo-processor-email">Institutional email</Label>
            <Input
              id="hrdo-processor-email"
              className="mt-1"
              type="email"
              pattern="[A-Za-z0-9._%+\x2d]+@lyceumalabang[.]edu[.]ph"
              title="Use an @lyceumalabang.edu.ph email address."
              maxLength={190}
              required
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="hrdo-processor-department">Department / Office</Label>
            <Input
              id="hrdo-processor-department"
              className="mt-1"
              maxLength={190}
              required
              value={form.department}
              onChange={(event) =>
                setForm((current) => ({ ...current, department: event.target.value }))
              }
            />
          </div>
          {canCreateAdmin && (
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-primary"
                checked={Boolean(form.isHrdoAdmin)}
                onChange={(event) =>
                  setForm((current) => ({ ...current, isHrdoAdmin: event.target.checked }))
                }
              />
              <span>
                <span className="block font-medium">Grant HRDO administrator access</span>
                <span className="block text-muted-foreground">
                  This person can create and manage processor accounts in HRDO Profile.
                </span>
              </span>
            </label>
          )}
          <Button className="sm:col-span-2" type="submit" disabled={busy}>
            {busy ? "Creating account…" : "Create processor account"}
          </Button>
        </form>
        {created && (
          <div
            className={`mt-4 rounded-sm border p-4 ${
              created.emailSent
                ? "border-success/40 bg-success-soft"
                : "border-destructive/40 bg-destructive/5"
            }`}
          >
            <p className="font-semibold">
              {created.role === "hrdo_admin" ? "HRDO administrator" : "HRDO processor"} account
              created for {created.name}: {created.email}
            </p>
            {created.emailSent ? (
              <p className="mt-2 text-sm">Temporary login details were emailed to the processor.</p>
            ) : (
              <>
                <p className="mt-2 text-sm">
                  The account was created, but its email was not sent:{" "}
                  {created.emailMessage ?? "Gmail delivery failed."}
                </p>
                {created.temporaryPassword && (
                  <>
                    <Label htmlFor="hrdo-processor-temporary-password" className="mt-3 block">
                      Temporary password — share securely with the account holder
                    </Label>
                    <Input
                      id="hrdo-processor-temporary-password"
                      className="mt-1 select-all font-mono"
                      value={created.temporaryPassword}
                      readOnly
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <p className="mt-2 text-xs">
                      The account holder must change it at first sign-in. They can sign in at{" "}
                      <a className="font-medium text-primary underline" href="/hrdo/login">
                        /hrdo/login
                      </a>
                      .
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </Section>

      <Section title="HRDO accounts">
        {accounts.isPending ? (
          <LoadingPanel label="Loading HRDO processor accounts" rows={3} />
        ) : accounts.isError ? (
          <p className="text-sm text-destructive" role="alert">
            We couldn't load HRDO processor accounts. Refresh the page and try again.
          </p>
        ) : accounts.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No HRDO processor accounts have been created.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {accounts.data.map((account) => (
              <li
                key={account.id}
                className="flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium">{account.name}</p>
                  <p className="break-all text-sm text-muted-foreground">{account.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {account.role === "hrdo_admin" ? "HRDO Administrator" : "COE Processor"}
                    {account.department ? ` · ${account.department}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {account.mustChangePassword && (
                    <span className="rounded-full bg-warning-soft px-2 py-1 text-xs text-warning">
                      Password change required
                    </span>
                  )}
                  {canResetPasswords && (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={Boolean(resettingId)}
                      onClick={() => void resetPassword(account)}
                    >
                      {resettingId === account.id ? (
                        <ButtonLoading label="Resetting" />
                      ) : (
                        "Reset password"
                      )}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {resetCredentials && (
          <div
            className={`mt-4 rounded-sm border p-4 ${
              resetCredentials.emailSent
                ? "border-success/40 bg-success-soft"
                : "border-destructive/40 bg-destructive/5"
            }`}
            role={resetCredentials.emailSent ? "status" : "alert"}
          >
            <p className="font-semibold">Password reset for {resetCredentials.email}</p>
            {resetCredentials.emailSent ? (
              <p className="mt-2 text-sm">Login details were emailed to the processor.</p>
            ) : (
              <>
                <p className="mt-2 text-sm">
                  The password was reset, but its email was not sent:{" "}
                  {resetCredentials.emailMessage ?? "Gmail delivery failed."}
                </p>
                {resetCredentials.temporaryPassword && (
                  <>
                    <Label htmlFor="hrdo-reset-temporary-password" className="mt-3 block">
                      Temporary password — share securely with the account holder
                    </Label>
                    <Input
                      id="hrdo-reset-temporary-password"
                      className="mt-1 select-all font-mono"
                      value={resetCredentials.temporaryPassword}
                      readOnly
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <p className="mt-2 text-xs">
                      The account holder must change it at next sign-in.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}
