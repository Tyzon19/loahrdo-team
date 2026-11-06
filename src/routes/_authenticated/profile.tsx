import { useEffect, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, Section, Field } from "@/components/app/PageHeader";
import {
  PhoneDirectorySettings,
  SignatoryAccountsSettings,
  SignatoryAssignmentSettings,
} from "@/components/app/SignatorySettings";
import { HrdoProcessorSettings } from "@/components/app/HrdoProcessorSettings";
import { ButtonLoading } from "@/components/app/LoadingPanel";
import { ROLE_TITLES } from "@/lib/workflow";
import { updateProfileFn } from "@/server-functions";
import { joinFullName, splitFullName } from "@/lib/name";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: `Profile | ${SITE.name}` },
      { name: "description", content: "Your account details and settings." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Profile,
});

function Profile() {
  const { viewer } = Route.useRouteContext();
  const router = useRouter();
  const [form, setForm] = useState(() => {
    const split = splitFullName(viewer?.name ?? "");
    return {
      firstName: split.firstName,
      middleName: split.middleName,
      lastName: split.lastName,
      department: viewer?.department ?? "",
    };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!viewer) return;
    const split = splitFullName(viewer.name);
    setForm({
      firstName: split.firstName,
      middleName: split.middleName,
      lastName: split.lastName,
      department: viewer.department,
    });
  }, [viewer?.id, viewer?.name, viewer?.department]);

  if (!viewer) return null;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors({});

    const fullName = joinFullName({
      firstName: form.firstName,
      middleName: form.middleName,
      lastName: form.lastName,
    });

    const result = await updateProfileFn({
      data: {
        name: fullName,
        department: form.department,
      },
    });
    setBusy(false);
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast.error(result.error);
      return;
    }
    toast.success("Profile saved. New requests will use this name.");
    await router.invalidate();
  }

  const accountContent = (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <Section title="Account">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={save} noValidate>
          <div>
            <Label htmlFor="profile-first-name">First name</Label>
            <Input
              id="profile-first-name"
              className="mt-1"
              maxLength={60}
              value={form.firstName}
              onChange={(event) => setForm({ ...form, firstName: event.target.value })}
              aria-invalid={Boolean(errors["name"])}
            />
            {errors["name"] && <p className="mt-1 text-sm text-destructive">{errors["name"]}</p>}
          </div>
          <div>
            <Label htmlFor="profile-middle-name">Middle name</Label>
            <Input
              id="profile-middle-name"
              className="mt-1"
              maxLength={60}
              value={form.middleName}
              onChange={(event) => setForm({ ...form, middleName: event.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="profile-last-name">Last name</Label>
            <Input
              id="profile-last-name"
              className="mt-1"
              maxLength={60}
              value={form.lastName}
              onChange={(event) => setForm({ ...form, lastName: event.target.value })}
              aria-invalid={Boolean(errors["name"])}
            />
            {errors["name"] && <p className="mt-1 text-sm text-destructive">{errors["name"]}</p>}
          </div>
          <dl>
            <Field label="Role">{ROLE_TITLES[viewer.role]}</Field>
          </dl>
          <div className="sm:col-span-2">
            <Label htmlFor="profile-department">Department / Office</Label>
            <Input
              id="profile-department"
              className="mt-1"
              maxLength={190}
              value={form.department}
              onChange={(event) => setForm({ ...form, department: event.target.value })}
              aria-invalid={Boolean(errors["department"])}
            />
            {errors["department"] && (
              <p className="mt-1 text-sm text-destructive">{errors["department"]}</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              type="email"
              className="mt-1"
              value={viewer.email}
              readOnly
              aria-describedby="profile-email-help"
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? <ButtonLoading label="Saving" /> : "Save profile"}
            </Button>
          </div>
        </form>
      </Section>
      <aside className="panel h-fit p-4 text-sm">
        <p className="font-medium">Password</p>
        <p className="mt-1 text-muted-foreground">
          Change your password regularly, especially if your account was issued an initial one.
        </p>
        <Button asChild variant="outline" className="mt-3">
          <Link to="/change-password">Change password</Link>
        </Button>
      </aside>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Profile"
        description={
          viewer.role === "admin"
            ? "Your account details and the signatory settings you manage."
            : "Your account details and password."
        }
      />

      {viewer.role === "admin" ? (
        <Tabs defaultValue="account">
          <TabsList className="mb-4 h-auto w-full flex-wrap justify-start gap-1 p-1 sm:w-auto">
            <TabsTrigger value="account" className="h-11 px-3 sm:h-9">
              My account
            </TabsTrigger>
            <TabsTrigger value="accounts" className="h-11 px-3 sm:h-9">
              Signatory accounts
            </TabsTrigger>
            <TabsTrigger value="hrdo-processors" className="h-11 px-3 sm:h-9">
              HRDO processors
            </TabsTrigger>
            <TabsTrigger value="assignments" className="h-11 px-3 sm:h-9">
              Signatory assignments
            </TabsTrigger>
            <TabsTrigger value="directory" className="h-11 px-3 sm:h-9">
              Phone directory
            </TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="mt-0">
            {accountContent}
          </TabsContent>

          <TabsContent value="accounts" className="mt-0 space-y-4">
            <p className="text-sm text-muted-foreground">
              Create main and alternate signatory logins, and issue a new temporary password for an
              existing account.
            </p>
            <SignatoryAccountsSettings />
          </TabsContent>

          <TabsContent value="hrdo-processors" className="mt-0 space-y-4">
            <p className="text-sm text-muted-foreground">
              Create separate staff accounts for the HRDO COE system. Processor accounts sign in at
              /hrdo/login and do not use the trip-ticket signatory roles. You can also grant HRDO
              administrator access to the first HRDO account.
            </p>
            <HrdoProcessorSettings canCreateAdmin />
          </TabsContent>

          <TabsContent value="assignments" className="mt-0 space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose who signs each approval stage. Main signatories handle the standard flow, while
              alternate signatories cover when the main signatory is unavailable.
            </p>
            <SignatoryAssignmentSettings />
          </TabsContent>

          <TabsContent value="directory" className="mt-0 space-y-4">
            <p className="text-sm text-muted-foreground">
              Publish verified contact numbers for signatories and administrators.
            </p>
            <PhoneDirectorySettings />
          </TabsContent>
        </Tabs>
      ) : (
        accountContent
      )}
    </div>
  );
}
