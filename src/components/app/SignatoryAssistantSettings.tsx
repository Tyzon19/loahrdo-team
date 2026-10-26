import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { User } from "@/lib/types";
import { ROLE_TITLES } from "@/lib/workflow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/app/PageHeader";
import { ButtonLoading, LoadingPanel } from "@/components/app/LoadingPanel";
import {
  createAssistantAccountFn,
  getSignatoryAssistantsFn,
  resetUserPasswordFn,
  saveSignatoryAssistantsFn,
} from "@/server-functions";
import { unwrap } from "@/lib/api";
import type { StageKey } from "@/lib/types";

const FIELDS: { key: StageKey; label: string }[] = [
  { key: "review", label: "Head of Transport Services" },
  { key: "recommend", label: "Director" },
  { key: "approve", label: "President" },
];

type AssistantEntry = { name: string; userId: string };
type AssistantForm = Record<StageKey, AssistantEntry>;
type NewAssistantAccount = {
  name: string;
  email: string;
  department: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resultError(value: unknown, fallback: string): string {
  return isRecord(value) && value["ok"] === false && typeof value["error"] === "string"
    ? value["error"]
    : fallback;
}

const EMPTY_FORM: AssistantForm = {
  review: { name: "", userId: "" },
  recommend: { name: "", userId: "" },
  approve: { name: "", userId: "" },
};
export function SignatoryAssistantSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["signatory-assistants"],
    queryFn: () => unwrap(getSignatoryAssistantsFn()),
  });
  const [form, setForm] = useState<AssistantForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [accountForm, setAccountForm] = useState<NewAssistantAccount>({
    name: "",
    email: "",
    department: "",
  });
  const [accountBusy, setAccountBusy] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<{
    email: string;
    temporaryPassword: string;
  } | null>(null);
  const [resetUserId, setResetUserId] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetCredentials, setResetCredentials] = useState<{
    email: string;
    temporaryPassword: string;
  } | null>(null);

  useEffect(() => {
    if (!query.data) return;
    setForm({
      review: {
        name: query.data.names.review ?? "",
        userId: query.data.userIds.review ?? "",
      },
      recommend: {
        name: query.data.names.recommend ?? "",
        userId: query.data.userIds.recommend ?? "",
      },
      approve: {
        name: query.data.names.approve ?? "",
        userId: query.data.userIds.approve ?? "",
      },
    });
  }, [query.data]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const result: unknown = await saveSignatoryAssistantsFn({ data: form });
      if (!isRecord(result) || result["ok"] !== true) {
        toast.error(resultError(result, "We couldn't save the alternate signatories."));
        return;
      }
      toast.success("Alternate signatories saved.");
      await queryClient.invalidateQueries({ queryKey: ["signatory-assistants"] });
      await queryClient.invalidateQueries({ queryKey: ["request"] });
    } catch {
      toast.error("We couldn't save the alternate signatories. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    if (accountBusy) return;
    setAccountBusy(true);
    setCreatedAccount(null);
    try {
      const result: unknown = await createAssistantAccountFn({ data: accountForm });
      const data = isRecord(result) ? result["data"] : undefined;
      const email = isRecord(data) ? data["email"] : undefined;
      const temporaryPassword = isRecord(data) ? data["temporaryPassword"] : undefined;
      if (
        !isRecord(result) ||
        result["ok"] !== true ||
        typeof email !== "string" ||
        typeof temporaryPassword !== "string"
      ) {
        toast.error(resultError(result, "We couldn't create the alternate signatory account."));
        return;
      }
      setCreatedAccount({
        email,
        temporaryPassword,
      });
      setAccountForm({
        name: "",
        email: "",
        department: "",
      });
      toast.success("Alternate signatory account created. Copy the temporary password now.");
      await queryClient.invalidateQueries({ queryKey: ["signatory-assistants"] });
    } catch {
      toast.error("We couldn't create the alternate signatory account. Please try again.");
    } finally {
      setAccountBusy(false);
    }
  }
  async function resetPassword(event: React.FormEvent) {
    event.preventDefault();
    if (resetBusy || !resetUserId) return;
    setResetBusy(true);
    setResetCredentials(null);
    try {
      const result: unknown = await resetUserPasswordFn({ data: { userId: resetUserId } });
      const data = isRecord(result) ? result["data"] : undefined;
      const email = isRecord(data) ? data["email"] : undefined;
      const temporaryPassword = isRecord(data) ? data["temporaryPassword"] : undefined;
      if (
        !isRecord(result) ||
        result["ok"] !== true ||
        typeof email !== "string" ||
        typeof temporaryPassword !== "string"
      ) {
        toast.error(resultError(result, "We couldn't reset the user's password."));
        return;
      }
      setResetCredentials({
        email,
        temporaryPassword,
      });
      toast.success("Password reset. Copy the temporary password and share it securely.");
    } catch {
      toast.error("We couldn't reset the user's password. Please try again.");
    } finally {
      setResetBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <Section title="Create Alternate Signatory Account">
        <p className="mb-4 text-sm text-muted-foreground">
          Create an individual institutional account for an alternate signatory. The temporary
          password is shown once; share it securely. New accounts must change their password at
          first sign-in.
        </p>
        <form className="grid max-w-3xl gap-4 sm:grid-cols-2" onSubmit={createAccount}>
          <div>
            <Label htmlFor="assistant-account-name">Full name</Label>
            <Input
              id="assistant-account-name"
              className="mt-1"
              maxLength={120}
              required
              value={accountForm.name}
              onChange={(event) =>
                setAccountForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="assistant-account-email">Institutional email</Label>
            <Input
              id="assistant-account-email"
              type="email"
              className="mt-1"
              maxLength={190}
              required
              value={accountForm.email}
              onChange={(event) =>
                setAccountForm((current) => ({ ...current, email: event.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="assistant-account-department">Department / Office</Label>
            <Input
              id="assistant-account-department"
              className="mt-1"
              maxLength={190}
              required
              value={accountForm.department}
              onChange={(event) =>
                setAccountForm((current) => ({ ...current, department: event.target.value }))
              }
            />
          </div>
          <Button className="sm:col-span-2" type="submit" disabled={accountBusy}>
            {accountBusy ? (
              <ButtonLoading label="Creating…" />
            ) : (
              "Create alternate signatory account"
            )}
          </Button>
        </form>
        {createdAccount && (
          <div className="mt-4 rounded-sm border border-success/40 bg-success-soft p-4">
            <p className="font-semibold">Account created: {createdAccount.email}</p>
            <Label htmlFor="assistant-temporary-password" className="mt-3 block">
              Temporary password — copy and share securely now
            </Label>
            <Input
              id="assistant-temporary-password"
              className="mt-1 select-all font-mono"
              value={createdAccount.temporaryPassword}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
            <p className="mt-2 text-xs">
              This password is shown only in this result. The account holder must change it on first
              sign-in.
            </p>
          </div>
        )}
      </Section>
      <Section title="Reset User Password">
        <p className="mb-4 text-sm text-muted-foreground">
          Issue a new one-time temporary password for a non-administrator account. This signs the
          user out of active sessions and requires a password change at their next sign-in.
        </p>
        {query.isPending ? (
          <LoadingPanel label="Loading user accounts" rows={2} />
        ) : query.isError ? (
          <div className="p-4 text-sm" role="alert">
            <p className="font-medium">We couldn&apos;t load user accounts.</p>
            <Button className="mt-3" variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <form className="max-w-xl space-y-3" onSubmit={resetPassword}>
            <div>
              <Label htmlFor="reset-password-user">User account</Label>
              <select
                id="reset-password-user"
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
                value={resetUserId}
                onChange={(event) => {
                  setResetUserId(event.target.value);
                  setResetCredentials(null);
                }}
              >
                <option value="">Choose a user</option>
                {query.data.resettableUsers.map((user: User) => (
                  <option key={user.id} value={user.id}>
                    {user.name} — {user.email} ({ROLE_TITLES[user.role]})
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="outline" disabled={resetBusy || !resetUserId}>
              {resetBusy ? <ButtonLoading label="Resetting…" /> : "Issue new temporary password"}
            </Button>
          </form>
        )}
        {resetCredentials && (
          <div className="mt-4 rounded-sm border border-success/40 bg-success-soft p-4">
            <p className="font-semibold">Password reset for: {resetCredentials.email}</p>
            <Label htmlFor="reset-temporary-password" className="mt-3 block">
              Temporary password — copy and share securely now
            </Label>
            <Input
              id="reset-temporary-password"
              className="mt-1 select-all font-mono"
              value={resetCredentials.temporaryPassword}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
            <p className="mt-2 text-xs">
              It is shown only here. The user must change it at their next sign-in.
            </p>
          </div>
        )}
      </Section>
      <Section title="Assign Alternate Signatories">
        <p className="mb-4 text-sm text-muted-foreground">
          Choose an alternate signatory account for each stage. When needed, the assigned person
          signs in with their own account; their name, signature, and signing time are recorded
          separately from the primary signatory.
        </p>
        {query.isPending ? (
          <LoadingPanel label="Loading alternate signatories" rows={3} />
        ) : query.isError ? (
          <div className="p-4 text-sm" role="alert">
            <p className="font-medium">We couldn&apos;t load alternate signatories.</p>
            <Button className="mt-3" variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <form className="max-w-xl space-y-4" onSubmit={save}>
            {FIELDS.map(({ key, label }) => (
              <div key={key}>
                <Label htmlFor={`assistant-${key}`}>{label} alternate signatory</Label>
                <select
                  id={`assistant-${key}`}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form[key].userId}
                  onChange={(event) => {
                    const userId = event.target.value;
                    const user = query.data.users.find((entry: User) => entry.id === userId);
                    setForm((current) => ({
                      ...current,
                      [key]: { userId, name: user?.name ?? "" },
                    }));
                  }}
                >
                  <option value="">No alternate signer</option>
                  {query.data.users.map((user: User) => (
                    <option key={user.id} value={user.id}>
                      {user.name} — {ROLE_TITLES[user.role]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Alternate signatory: {form[key].name || "Not assigned"}
                </p>
              </div>
            ))}
            <Button type="submit" disabled={busy}>
              {busy ? <ButtonLoading label="Saving…" /> : "Save alternate signatories"}
            </Button>
          </form>
        )}
      </Section>
    </div>
  );
}
