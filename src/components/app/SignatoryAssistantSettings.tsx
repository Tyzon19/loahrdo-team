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
  getPhoneDirectoryFn,
  getSignatoryAssistantsFn,
  resetUserPasswordFn,
  saveMainSignatoriesFn,
  saveSignatoryPhoneNumberFn,
  saveSignatoryAssistantsFn,
} from "@/server-functions";
import { unwrap } from "@/lib/api";
import type { StageKey } from "@/lib/types";

const FIELDS: { key: StageKey; label: string }[] = [
  { key: "review", label: "Head of Transport Services" },
  { key: "recommend", label: "Director for Administration" },
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
  const phoneDirectory = useQuery({
    queryKey: ["phone-directory"],
    queryFn: () => unwrap(getPhoneDirectoryFn()),
  });
  const [phoneNumbers, setPhoneNumbers] = useState<Record<string, string>>({});
  const [savingPhoneUserId, setSavingPhoneUserId] = useState<string | null>(null);
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
    emailSent: boolean;
    emailMessage?: string;
    temporaryPassword?: string;
  } | null>(null);
  const [accountForm, setAccountForm] = useState<NewAssistantAccount>({
    name: "",
    email: "",
    department: "",
  });
  const [accountBusy, setAccountBusy] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<{
    email: string;
    emailSent: boolean;
    emailMessage?: string;
    temporaryPassword?: string;
  } | null>(null);
  const [resetUserId, setResetUserId] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetCredentials, setResetCredentials] = useState<{
    email: string;
    emailSent: boolean;
    emailMessage?: string;
    temporaryPassword?: string;
  } | null>(null);

  useEffect(() => {
    if (!phoneDirectory.data) return;
    setPhoneNumbers(
      Object.fromEntries(
        phoneDirectory.data.map((contact) => [contact.userId, contact.phoneNumber ?? ""]),
      ),
    );
  }, [phoneDirectory.data]);

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

  async function savePhoneNumber(userId: string) {
    if (savingPhoneUserId) return;
    setSavingPhoneUserId(userId);
    try {
      const result = await saveSignatoryPhoneNumberFn({
        data: {
          userId,
          phoneNumber: phoneNumbers[userId]?.trim() || null,
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("LOA phone directory updated.");
      await queryClient.invalidateQueries({ queryKey: ["phone-directory"] });
    } catch {
      toast.error("We couldn't save that contact number. Please try again.");
    } finally {
      setSavingPhoneUserId(null);
    }
  }

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
      const emailDelivery = isRecord(data) ? data["emailDelivery"] : undefined;
      const emailSent = isRecord(emailDelivery) && emailDelivery["sent"] === true;
      const emailMessage =
        isRecord(emailDelivery) && typeof emailDelivery["message"] === "string"
          ? emailDelivery["message"]
          : undefined;
      const temporaryPassword = isRecord(data) ? data["temporaryPassword"] : undefined;
      if (
        !isRecord(result) ||
        result["ok"] !== true ||
        typeof id !== "string" ||
        typeof name !== "string" ||
        typeof email !== "string" ||
        !isRecord(emailDelivery) ||
        (!emailSent && typeof temporaryPassword !== "string")
      ) {
        toast.error(resultError(result, "We couldn't create the main signatory account."));
        return;
      }
      setCreatedMainAccount({
        name,
        email,
        emailSent,
        ...(emailMessage ? { emailMessage } : {}),
        ...(typeof temporaryPassword === "string" ? { temporaryPassword } : {}),
      });
      setMainForm((current) => ({ ...current, [mainAccountForm.stage]: id }));
      setMainAccountForm((current) => ({ ...current, name: "", email: "", department: "" }));
      if (emailSent) {
        toast.success("Main signatory account created and assigned. Login details emailed.");
      } else {
        toast.error(emailMessage ?? "Account created, but the signatory email was not sent.");
      }
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
      const emailDelivery = isRecord(data) ? data["emailDelivery"] : undefined;
      const emailSent = isRecord(emailDelivery) && emailDelivery["sent"] === true;
      const emailMessage =
        isRecord(emailDelivery) && typeof emailDelivery["message"] === "string"
          ? emailDelivery["message"]
          : undefined;
      const temporaryPassword = isRecord(data) ? data["temporaryPassword"] : undefined;
      if (
        !isRecord(result) ||
        result["ok"] !== true ||
        typeof email !== "string" ||
        !isRecord(emailDelivery) ||
        (!emailSent && typeof temporaryPassword !== "string")
      ) {
        toast.error(resultError(result, "We couldn't create the alternate signatory account."));
        return;
      }
      setCreatedAccount({
        email,
        emailSent,
        ...(emailMessage ? { emailMessage } : {}),
        ...(typeof temporaryPassword === "string" ? { temporaryPassword } : {}),
      });
      setAccountForm({
        name: "",
        email: "",
        department: "",
      });
      if (emailSent) {
        toast.success("Alternate signatory account created. Login details emailed.");
      } else {
        toast.error(emailMessage ?? "Account created, but the signatory email was not sent.");
      }
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
      const emailDelivery = isRecord(data) ? data["emailDelivery"] : undefined;
      const emailSent = isRecord(emailDelivery) && emailDelivery["sent"] === true;
      const emailMessage =
        isRecord(emailDelivery) && typeof emailDelivery["message"] === "string"
          ? emailDelivery["message"]
          : undefined;
      const temporaryPassword = isRecord(data) ? data["temporaryPassword"] : undefined;
      if (
        !isRecord(result) ||
        result["ok"] !== true ||
        typeof email !== "string" ||
        !isRecord(emailDelivery) ||
        (!emailSent && typeof temporaryPassword !== "string")
      ) {
        toast.error(resultError(result, "We couldn't reset the user's password."));
        return;
      }
      setResetCredentials({
        email,
        emailSent,
        ...(emailMessage ? { emailMessage } : {}),
        ...(typeof temporaryPassword === "string" ? { temporaryPassword } : {}),
      });
      if (emailSent) {
        toast.success("Password reset. The temporary login details were emailed to the user.");
      } else {
        toast.error(emailMessage ?? "Password reset, but the user email was not sent.");
      }
    } catch {
      toast.error("We couldn't reset the user's password. Please try again.");
    } finally {
      setResetBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <Section title="Manage LOA Phone Directory">
        <p className="mb-4 text-sm text-muted-foreground">
          Add verified contact numbers for administrators and assigned signatories. Numbers are
          visible to signed-in users in the LOA Phone Directory.
        </p>
        {phoneDirectory.isPending ? (
          <LoadingPanel label="Loading signatory phone numbers" rows={3} />
        ) : phoneDirectory.isError ? (
          <div className="p-4 text-sm" role="alert">
            <p className="font-medium">We couldn&apos;t load phone directory contacts.</p>
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => void phoneDirectory.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : phoneDirectory.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No signatory accounts have been assigned.</p>
        ) : (
          <div className="space-y-3">
            {phoneDirectory.data.map((contact) => (
              <form
                key={contact.userId}
                className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)_auto] sm:items-end"
                onSubmit={(event) => {
                  event.preventDefault();
                  void savePhoneNumber(contact.userId);
                }}
              >
                <div>
                  <p className="font-medium">{contact.name}</p>
                  <p className="text-xs text-muted-foreground">{ROLE_TITLES[contact.role]}</p>
                </div>
                <div>
                  <Label htmlFor={`phone-${contact.userId}`}>Telephone / mobile</Label>
                  <Input
                    id={`phone-${contact.userId}`}
                    className="mt-1"
                    type="tel"
                    maxLength={32}
                    value={phoneNumbers[contact.userId] ?? ""}
                    onChange={(event) =>
                      setPhoneNumbers((current) => ({
                        ...current,
                        [contact.userId]: event.target.value,
                      }))
                    }
                    placeholder="Not provided"
                  />
                </div>
                <Button type="submit" variant="outline" disabled={savingPhoneUserId !== null}>
                  {savingPhoneUserId === contact.userId ? (
                    <ButtonLoading label="Saving…" />
                  ) : (
                    "Save number"
                  )}
                </Button>
              </form>
            ))}
          </div>
        )}
      </Section>
      <Section title="Create Main Signatory Account">
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
          Create an institutional account for a new Head of Transport Services, Director for
          Administration, or President. Creating an account assigns it as the main signatory for the
          selected stage and replaces the current assignment. The system emails a one-time temporary
          password to the new signatory, who must change it at first sign-in.
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
          <div
            className={`mt-4 rounded-sm border p-4 ${
              createdMainAccount.emailSent
                ? "border-success/40 bg-success-soft"
                : "border-destructive/40 bg-destructive/5"
            }`}
          >
            <p className="font-semibold">
              Account created for {createdMainAccount.name}: {createdMainAccount.email}
            </p>
            {createdMainAccount.emailSent ? (
              <p className="mt-2 text-sm">Temporary login details were emailed to the signatory.</p>
            ) : (
              <>
                <p className="mt-2 text-sm">
                  The account is assigned, but its email was not sent:{" "}
                  {createdMainAccount.emailMessage ?? "Gmail delivery failed."}
                </p>
                {createdMainAccount.temporaryPassword && (
                  <>
                    <Label htmlFor="main-temporary-password" className="mt-3 block">
                      Temporary password — share securely with the account holder
                    </Label>
                    <Input
                      id="main-temporary-password"
                      className="mt-1 select-all font-mono"
                      value={createdMainAccount.temporaryPassword}
                      readOnly
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <p className="mt-2 text-xs">
                      The account holder must change it at first sign-in.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </Section>
      <Section title="Assign Main Signatories">
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
          Assign all three approval stages in order: Head of Transport Services → Director for
          Administration → President.
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
                    <option value="">Select a main signatory account</option>
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

      <Section title="Create Alternate Signatory Account">
        <p className="mb-4 text-sm text-muted-foreground">
          Create an individual institutional account for an alternate signatory. The system emails a
          one-time temporary password to the account holder, who must change it at first sign-in.
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
          <div
            className={`mt-4 rounded-sm border p-4 ${
              createdAccount.emailSent
                ? "border-success/40 bg-success-soft"
                : "border-destructive/40 bg-destructive/5"
            }`}
          >
            <p className="font-semibold">Account created: {createdAccount.email}</p>
            {createdAccount.emailSent ? (
              <p className="mt-2 text-sm">
                Temporary login details were emailed to the account holder.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm">
                  The account was created, but its email was not sent:{" "}
                  {createdAccount.emailMessage ?? "Gmail delivery failed."}
                </p>
                {createdAccount.temporaryPassword && (
                  <>
                    <Label htmlFor="assistant-temporary-password" className="mt-3 block">
                      Temporary password — share securely with the account holder
                    </Label>
                    <Input
                      id="assistant-temporary-password"
                      className="mt-1 select-all font-mono"
                      value={createdAccount.temporaryPassword}
                      readOnly
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <p className="mt-2 text-xs">
                      The account holder must change it at first sign-in.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </Section>
      <Section title="Reset User Password">
        <p className="mb-4 text-sm text-muted-foreground">
          Issue a new one-time temporary password for a non-administrator account. This signs the
          user out of active sessions and emails the new temporary password. The user must change it
          at their next sign-in.
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
          <div
            className={`mt-4 rounded-sm border p-4 ${
              resetCredentials.emailSent
                ? "border-success/40 bg-success-soft"
                : "border-destructive/40 bg-destructive/5"
            }`}
          >
            <p className="font-semibold">Password reset for: {resetCredentials.email}</p>
            {resetCredentials.emailSent ? (
              <p className="mt-2 text-sm">
                The new temporary login details were emailed to the user.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm">
                  Password reset, but the email was not sent:{" "}
                  {resetCredentials.emailMessage ?? "Gmail delivery failed."}
                </p>
                {resetCredentials.temporaryPassword && (
                  <>
                    <Label htmlFor="reset-temporary-password" className="mt-3 block">
                      Temporary password — share securely with the account holder
                    </Label>
                    <Input
                      id="reset-temporary-password"
                      className="mt-1 select-all font-mono"
                      value={resetCredentials.temporaryPassword}
                      readOnly
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <p className="mt-2 text-xs">The user must change it at their next sign-in.</p>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </Section>
      <Section title="Assign Alternate Signatories">
        <p className="mb-4 text-sm text-muted-foreground">
          Choose an alternate account for each approval stage. When needed, the assigned person
          signs in with their own account; their name, signature, and signing time are recorded.
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
