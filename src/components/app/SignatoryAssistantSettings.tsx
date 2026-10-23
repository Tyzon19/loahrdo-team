import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/app/PageHeader";
import { LoadingPanel } from "@/components/app/LoadingPanel";
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
    const result = await saveSignatoryAssistantsFn({ data: form });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Signatory assistant names saved.");
    await queryClient.invalidateQueries({ queryKey: ["signatory-assistants"] });
    await queryClient.invalidateQueries({ queryKey: ["request"] });
  }

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    if (accountBusy) return;
    setAccountBusy(true);
    setCreatedAccount(null);
    const result = await createAssistantAccountFn({ data: accountForm });
    setAccountBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setCreatedAccount(result.data);
    setAccountForm({
      name: "",
      email: "",
      department: "",
    });
    toast.success("Assistant account created. Copy the temporary password now.");
    await queryClient.invalidateQueries({ queryKey: ["signatory-assistants"] });
  }

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault();
    if (resetBusy || !resetUserId) return;
    setResetBusy(true);
    setResetCredentials(null);
    const result = await resetUserPasswordFn({ data: { userId: resetUserId } });
    setResetBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setResetCredentials(result.data);
    toast.success("Password reset. Copy the temporary password and share it securely.");
  }

  return (
    <div className="space-y-4">
      <Section title="Create Assistant Account">
        <p className="mb-4 text-sm text-muted-foreground">
          Create an individual institutional account for an assistant. The temporary password is
          shown once; share it securely. New accounts have the Assistant role and must change their
          password at first sign-in.
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
            {accountBusy ? "Creating…" : "Create assistant account"}
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
              This password is shown only in this result. The assistant must change it on first
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
                    {user.name} — {user.email} ({user.role.replaceAll("_", " ")})
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="outline" disabled={resetBusy || !resetUserId}>
              {resetBusy ? "Resetting…" : "Issue new temporary password"}
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
          Choose an assistant account for each signatory. The assigned assistant signs in with
          their own account when needed; their signature, name, and actual signing time are recorded
          separately beside the primary signatory.
        </p>
      {query.isPending ? (
        <LoadingPanel label="Loading assistant names" rows={3} />
      ) : query.isError ? (
        <div className="p-4 text-sm" role="alert">
          <p className="font-medium">We couldn&apos;t load signatory assistant names.</p>
          <Button className="mt-3" variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <form className="max-w-xl space-y-4" onSubmit={save}>
          {FIELDS.map(({ key, label }) => (
            <div key={key}>
              <Label htmlFor={`assistant-${key}`}>{label} assistant account</Label>
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
                    {user.name} — {user.role.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Assistant name: {form[key].name || "Not assigned"}
              </p>
            </div>
          ))}
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save alternate signatories"}
          </Button>
        </form>
      )}
      </Section>
    </div>
  );
}
