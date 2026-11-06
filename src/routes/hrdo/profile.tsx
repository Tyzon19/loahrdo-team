import { useEffect, useState } from "react";
import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, Section } from "@/components/app/PageHeader";
import { ButtonLoading } from "@/components/app/LoadingPanel";
import { HrdoProcessorSettings } from "@/components/app/HrdoProcessorSettings";
import { hrdoUpdateProfileFn } from "@/server-functions";
import { canManageHrdoAccounts } from "@/lib/hrdo";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/hrdo/profile")({
  beforeLoad: ({ context }) => {
    if (!context.hrdoViewer) {
      throw redirect({ to: "/hrdo/login" });
    }
  },
  head: () => ({
    meta: [
      { title: `Profile — ${SITE.name}` },
      { name: "description", content: "Your HRDO account details." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Profile,
});

function Profile() {
  const { hrdoViewer } = Route.useRouteContext();
  const router = useRouter();
  const [form, setForm] = useState({
    name: hrdoViewer?.name ?? "",
    department: hrdoViewer?.department ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (hrdoViewer) setForm({ name: hrdoViewer.name, department: hrdoViewer.department });
  }, [hrdoViewer?.id, hrdoViewer?.name, hrdoViewer?.department]);

  if (!hrdoViewer) return null;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors({});
    const result = await hrdoUpdateProfileFn({ data: form });
    setBusy(false);
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast.error(result.error);
      return;
    }
    toast.success("Profile saved.");
    await router.invalidate();
  }

  return (
    <>
      <PageHeader title="Profile" description="Your HRDO account details are used on COE requests." />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Section title="Account">
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={save} noValidate>
            <div>
              <Label htmlFor="profile-name">Full Name</Label>
              <Input
                id="profile-name"
                className="mt-1"
                maxLength={120}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                aria-invalid={Boolean(errors["name"])}
              />
              {errors["name"] && <p className="mt-1 text-sm text-destructive">{errors["name"]}</p>}
            </div>
            <div>
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" type="email" className="mt-1" value={hrdoViewer.email} readOnly />
            </div>
            <div>
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
              <Button type="submit" disabled={busy}>
                {busy ? <ButtonLoading label="Saving…" /> : "Save profile"}
              </Button>
            </div>
          </form>
        </Section>
        <aside className="panel h-fit p-4 text-sm">
          <p className="font-medium">Password</p>
          <p className="mt-1 text-muted-foreground">
            Change your password regularly and keep it different from other systems.
          </p>
          <Button asChild variant="outline" className="mt-3">
            <Link to="/hrdo/change-password">Change password</Link>
          </Button>
        </aside>
      </div>
      {canManageHrdoAccounts(hrdoViewer) && (
        <section className="mt-6 space-y-4" aria-label="HRDO processor account management">
          <PageHeader
            title="HRDO processor accounts"
            description="Create and manage the accounts staff use to process COE requests."
          />
          <HrdoProcessorSettings />
        </section>
      )}
    </>
  );
}
