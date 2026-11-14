import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingPanel } from "@/components/app/LoadingPanel";
import { Section } from "@/components/app/PageHeader";
import { unwrap } from "@/lib/api";
import {
  assignPermissionSignatoryFn,
  createPermissionSignatoryFn,
  listPermissionSignatoryCandidatesFn,
  listPermissionSignatoriesFn,
  removePermissionSignatoryFn,
} from "@/server-functions";

type SignatoryForm = { name: string; email: string; department: string };

export function PermissionSignatorySettings() {
  const queryClient = useQueryClient();
  const accounts = useQuery({
    queryKey: ["permission-slip-signatories"],
    queryFn: () => unwrap(listPermissionSignatoriesFn()),
  });
  const candidates = useQuery({
    queryKey: ["permission-slip-signatory-candidates"],
    queryFn: () => unwrap(listPermissionSignatoryCandidatesFn()),
  });
  const [form, setForm] = useState<SignatoryForm>({ name: "", email: "", department: "" });
  const [busy, setBusy] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    name: string;
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
      const result = await createPermissionSignatoryFn({ data: form });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { name, email, emailDelivery, temporaryPassword } = result.data;
      setCreated({
        name,
        email,
        emailSent: emailDelivery.sent,
        ...(!emailDelivery.sent ? { emailMessage: emailDelivery.message } : {}),
        ...(temporaryPassword ? { temporaryPassword } : {}),
      });
      setForm({ name: "", email: "", department: "" });
      if (emailDelivery.sent) {
        toast.success("Permission Slip signatory added. Login details emailed.");
      } else {
        toast.error(emailDelivery.message ?? "Account created, but the email was not sent.");
      }
      await queryClient.invalidateQueries({ queryKey: ["permission-slip-signatories"] });
      await queryClient.invalidateQueries({ queryKey: ["permission-slip-signatory-candidates"] });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't create the Permission Slip signatory.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function assignExistingAccount(event: React.FormEvent) {
    event.preventDefault();
    if (assigning || !selectedCandidateId) return;
    setAssigning(true);
    try {
      await unwrap(assignPermissionSignatoryFn({ data: selectedCandidateId }));
      setSelectedCandidateId("");
      await queryClient.invalidateQueries({ queryKey: ["permission-slip-signatories"] });
      await queryClient.invalidateQueries({ queryKey: ["permission-slip-signatory-candidates"] });
      toast.success("Existing account can now approve and reject Permission Slips.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't assign the Permission Slip signatory.",
      );
    } finally {
      setAssigning(false);
    }
  }

  async function removeAccess(account: NonNullable<typeof accounts.data>[number]) {
    if (removingId) return;
    if (
      !window.confirm(
        `Remove Permission Slip approval access for ${account.name}? Their account will remain active.`,
      )
    ) {
      return;
    }
    setRemovingId(account.id);
    try {
      await unwrap(removePermissionSignatoryFn({ data: account.id }));
      await queryClient.invalidateQueries({ queryKey: ["permission-slip-signatories"] });
      await queryClient.invalidateQueries({ queryKey: ["permission-slip-signatory-candidates"] });
      toast.success("Permission Slip signatory access removed.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't remove Permission Slip signatory access.",
      );
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Section title="Add Permission Slip signatory">
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
          Every active signatory can approve or reject pending slips. The first completed decision
          takes effect. New accounts receive a temporary password and must change it at sign-in.
        </p>
        <form className="grid max-w-3xl gap-4 sm:grid-cols-2" onSubmit={createAccount}>
          <div>
            <Label htmlFor="permission-signatory-name">Full name</Label>
            <Input
              id="permission-signatory-name"
              className="mt-1 min-h-11"
              maxLength={120}
              required
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="permission-signatory-email">Institutional email</Label>
            <Input
              id="permission-signatory-email"
              className="mt-1 min-h-11"
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
          <div className="sm:col-span-2">
            <Label htmlFor="permission-signatory-department">Department / Office</Label>
            <Input
              id="permission-signatory-department"
              className="mt-1 min-h-11"
              maxLength={190}
              required
              value={form.department}
              onChange={(event) =>
                setForm((current) => ({ ...current, department: event.target.value }))
              }
            />
          </div>
          <Button className="min-h-11 sm:col-span-2" type="submit" disabled={busy}>
            {busy ? "Adding signatory…" : "Add signatory"}
          </Button>
        </form>
        {created && (
          <div
            className={`mt-4 rounded-sm border p-4 ${
              created.emailSent
                ? "border-success/40 bg-success-soft"
                : "border-destructive/40 bg-destructive/5"
            }`}
            role={created.emailSent ? "status" : "alert"}
          >
            <p className="font-semibold">
              Signatory added: {created.name} · {created.email}
            </p>
            {created.emailSent ? (
              <p className="mt-2 text-sm">Temporary login details were emailed to the signatory.</p>
            ) : (
              <>
                <p className="mt-2 text-sm">
                  The account was added, but its email was not sent:{" "}
                  {created.emailMessage ?? "Gmail delivery failed."}
                </p>
                {created.temporaryPassword && (
                  <>
                    <Label htmlFor="permission-signatory-temporary-password" className="mt-3 block">
                      Temporary password — share securely with the account holder
                    </Label>
                    <Input
                      id="permission-signatory-temporary-password"
                      className="mt-1 min-h-11 select-all font-mono"
                      value={created.temporaryPassword}
                      readOnly
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  </>
                )}
              </>
            )}
          </div>
        )}
      </Section>

      <Section title="Assign existing account">
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
          Grant Permission Slip signatory access to an existing institutional account. Its other
          system access and password stay unchanged.
        </p>
        {candidates.isPending ? (
          <LoadingPanel label="Loading eligible accounts" rows={2} />
        ) : candidates.isError ? (
          <div role="alert" className="rounded-md border border-destructive/40 p-4">
            <p className="font-medium">We couldn't load eligible accounts.</p>
            <Button
              className="mt-3 min-h-11"
              variant="outline"
              onClick={() => void candidates.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : candidates.data.length === 0 ? (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">
            No unassigned institutional accounts are available.
          </p>
        ) : (
          <form
            className="flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={assignExistingAccount}
          >
            <div className="min-w-0 flex-1">
              <Label htmlFor="permission-signatory-existing-account">Institutional account</Label>
              <select
                id="permission-signatory-existing-account"
                className="mt-1 flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedCandidateId}
                onChange={(event) => setSelectedCandidateId(event.target.value)}
                required
              >
                <option value="">Choose an account</option>
                {candidates.data.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} — {account.email}
                  </option>
                ))}
              </select>
            </div>
            <Button
              className="min-h-11 shrink-0"
              type="submit"
              disabled={assigning || !selectedCandidateId}
            >
              {assigning ? "Assigning…" : "Assign signatory"}
            </Button>
          </form>
        )}
      </Section>

      <Section title="Active signatories">
        {accounts.isPending ? (
          <LoadingPanel label="Loading Permission Slip signatories" rows={3} />
        ) : accounts.isError ? (
          <div role="alert" className="rounded-md border border-destructive/40 p-4">
            <p className="font-medium">We couldn't load Permission Slip signatories.</p>
            <Button
              className="mt-3 min-h-11"
              variant="outline"
              onClick={() => void accounts.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : accounts.data.length === 0 ? (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">
            No Permission Slip signatories are assigned.
          </p>
        ) : (
          <ul className="divide-y rounded-md border bg-background">
            {accounts.data.map((account) => (
              <li
                key={account.id}
                className="flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium">{account.name}</p>
                  <p className="break-all text-sm text-muted-foreground">{account.email}</p>
                  <p className="text-sm text-muted-foreground">{account.department}</p>
                  {account.mustChangePassword && (
                    <p className="mt-1 text-xs text-warning">Temporary password change required</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 shrink-0"
                  disabled={accounts.data.length <= 1 || Boolean(removingId)}
                  onClick={() => void removeAccess(account)}
                >
                  {removingId === account.id ? "Removing…" : "Remove access"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
