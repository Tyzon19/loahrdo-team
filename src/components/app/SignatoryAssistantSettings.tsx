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
  createMainSignatoryAccountFn,
  getSignatoryAssistantsFn,
  resetUserPasswordFn,
  saveMainSignatoriesFn,
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
type MainSignatoryForm = Record<StageKey, string>;
type NewAssistantAccount = {
  name: string;
  email: string;
  department: string;
};
type NewMainSignatoryAccount = NewAssistantAccount & { stage: StageKey };

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
const EMPTY_MAIN_SIGNATORIES: MainSignatoryForm = {
  review: "",
  recommend: "",
  approve: "",
};

export function SignatoryAssistantSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["signatory-assistants"],
    queryFn: () => unwrap(getSignatoryAssistantsFn()),
  });
  const [form, setForm] = useState<AssistantForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [mainForm, setMainForm] = useState<MainSignatoryForm>(EMPTY_MAIN_SIGNATORIES);
  const [mainBusy, setMainBusy] = useState(false);
  const [mainAccountForm, setMainAccountForm] = useState<NewMainSignatoryAccount>({
    stage: "approve",
    name: "",
    email: "",
    department: "",
  });
  const [mainAccountBusy, setMainAccountBusy] = useState(false);
  const [createdMainAccount, setCreatedMainAccount] = useState<{
    name: string;
    email: string;
    temporaryPassword: string;
  } | null>(null);
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
    setMainForm({
      review: query.data.configuredMainSignatoryUserIds.review ?? "",
      recommend: query.data.configuredMainSignatoryUserIds.recommend ?? "",
      approve: query.data.configuredMainSignatoryUserIds.approve ?? "",
    });
  }, [query.data]);

  async function saveMainSignatories(event: React.FormEvent) {
    event.preventDefault();
    if (mainBusy) return;
    setMainBusy(true);
    try {
      const result: unknown = await saveMainSignatoriesFn({
        data: {
          review: mainForm.review || null,
          recommend: mainForm.recommend || null,
          approve: mainForm.approve || null,
        },
      });
      if (!isRecord(result) || result["ok"] !== true) {
        toast.error(resultError(result, "We couldn't save the main signatories."));
        return;
      }
      toast.success("Main signatories saved.");
      await queryClient.invalidateQueries({ queryKey: ["signatory-assistants"] });
      await queryClient.invalidateQueries({ queryKey: ["request"] });
      await queryClient.invalidateQueries({ queryKey: ["requests"] });
    } catch {
      toast.error("We couldn't save the main signatories. Please try again.");
    } finally {
      setMainBusy(false);
    }
  }

  async function createMainAccount(event: React.FormEvent) {
    event.preventDefault();
    if (mainAccountBusy) return;
    setMainAccountBusy(true);
    setCreatedMainAccount(null);
    try {
      const result: unknown = await createMainSignatoryAccountFn({ data: mainAccountForm });
      const data = isRecord(result) ? result["data"] : undefined;
      const id = isRecord(data) ? data["id"] : undefined;
      const email = isRecord(data) ? data["email"] : undefined;
      const name = isRecord(data) ? data["name"] : undefined;
      const temporaryPassword = isRecord(data) ? data["temporaryPassword"] : undefined;
      if (
        !isRecord(result) ||
        result["ok"] !== true ||
        typeof id !== "string" ||
        typeof name !== "string" ||
        typeof email !== "string" ||
        typeof temporaryPassword !== "string"
      ) {
        toast.error(resultError(result, "We couldn't create the main signatory account."));
        return;
      }
      setCreatedMainAccount({ name, email, temporaryPassword });
      setMainForm((current) => ({ ...current, [mainAccountForm.stage]: id }));
      setMainAccountForm((current) => ({ ...current, name: "", email: "", department: "" }));
      toast.success("Main signatory account created and assigned.");
      await queryClient.invalidateQueries({ queryKey: ["signatory-assistants"] });
      await queryClient.invalidateQueries({ queryKey: ["request"] });
      await queryClient.invalidateQueries({ queryKey: ["requests"] });
    } catch {
      toast.error("We couldn't create the main signatory account. Please try again.");
    } finally {
      setMainAccountBusy(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const result: unknown = await saveSignatoryAssistantsFn({
        data: {
          review: { ...form.review, userId: form.review.userId || null },
          recommend: { ...form.recommend, userId: form.recommend.userId || null },
          approve: { ...form.approve, userId: form.approve.userId || null },
        },
      });
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
      <Section title="Assign Main Signatories">
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
          Choose the account responsible for each approval stage. Existing accounts keep their
          system role and permissions; changing this assignment replaces who may sign for that
          stage. The approval order remains unchanged.
        </p>
        {query.isPending ? (
          <LoadingPanel label="Loading main signatories" rows={3} />
        ) : query.isError ? (
          <div className="p-4 text-sm" role="alert">
            <p className="font-medium">We couldn&apos;t load main signatories.</p>
            <Button className="mt-3" variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <form className="max-w-xl space-y-4" onSubmit={saveMainSignatories}>
            {FIELDS.map(({ key, label }) => {
              const selected = query.data.mainSignatoryUsers.find(
                (user: User) => user.id === mainForm[key],
              );
              return (
                <div key={key}>
                  <Label htmlFor={`main-signatory-${key}`}>{label} main signatory</Label>
                  <select
                    id={`main-signatory-${key}`}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={mainForm[key]}
                    onChange={(event) =>
                      setMainForm((current) => ({ ...current, [key]: event.target.value }))
                    }
                  >
                    <option value="">Use the account with this system role</option>
                    {query.data.mainSignatoryUsers.map((user: User) => (
                      <option key={user.id} value={user.id}>
                        {user.name} — {user.email} ({ROLE_TITLES[user.role]})
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Current main signatory:{" "}
                    {selected?.name ?? query.data.mainSignatoryNames[key] ?? "No account found"}
                  </p>
                </div>
              );
            })}
            <Button type="submit" disabled={mainBusy}>
              {mainBusy ? <ButtonLoading label="Saving…" /> : "Save main signatories"}
            </Button>
          </form>
        )}
      </Section>
      <Section title="Create Main Signatory Account">
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
          Create an institutional account for a new Head of Transport Services, Director, or
          President. Creating it assigns that account as the main signatory for the selected stage
          and replaces the current assignment. The temporary password is shown once; the account
          holder must change it at first sign-in.
        </p>
        <form className="grid max-w-3xl gap-4 sm:grid-cols-2" onSubmit={createMainAccount}>
          <div>
            <Label htmlFor="main-account-stage">Approval position</Label>
            <select
              id="main-account-stage"
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={mainAccountForm.stage}
              onChange={(event) => {
                const stage = FIELDS.find(({ key }) => key === event.target.value)?.key;
                if (stage) setMainAccountForm((current) => ({ ...current, stage }));
              }}
            >
              {FIELDS.map(({ key, label }) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="main-account-name">Full name</Label>
            <Input
              id="main-account-name"
              className="mt-1"
              maxLength={120}
              required
              value={mainAccountForm.name}
              onChange={(event) =>
                setMainAccountForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="main-account-email">Institutional email</Label>
            <Input
              id="main-account-email"
              type="email"
              className="mt-1"
              maxLength={190}
              required
              value={mainAccountForm.email}
              onChange={(event) =>
                setMainAccountForm((current) => ({ ...current, email: event.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="main-account-department">Department / Office</Label>
            <Input
              id="main-account-department"
              className="mt-1"
              maxLength={190}
              required
              value={mainAccountForm.department}
              onChange={(event) =>
                setMainAccountForm((current) => ({ ...current, department: event.target.value }))
              }
            />
          </div>
          <Button className="sm:col-span-2" type="submit" disabled={mainAccountBusy}>
            {mainAccountBusy ? (
              <ButtonLoading label="Creating account…" />
            ) : (
              "Create and assign main signatory"
            )}
          </Button>
        </form>
        {createdMainAccount && (
          <div className="mt-4 rounded-sm border border-success/40 bg-success-soft p-4">
            <p className="font-semibold">
              Account created for {createdMainAccount.name}: {createdMainAccount.email}
            </p>
            <Label htmlFor="main-temporary-password" className="mt-3 block">
              Temporary password — copy and share securely now
            </Label>
            <Input
              id="main-temporary-password"
              className="mt-1 select-all font-mono"
              value={createdMainAccount.temporaryPassword}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
            <p className="mt-2 text-xs">
              This password is shown only in this result. The account holder must change it at first
              sign-in.
            </p>
          </div>
        )}
      </Section>
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
