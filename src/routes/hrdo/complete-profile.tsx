import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AlertCircle, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, Section } from "@/components/app/PageHeader";
import { ButtonLoading } from "@/components/app/LoadingPanel";
import { joinFullName } from "@/lib/name";
import { hrdoCompleteProfileNameFn } from "@/server-functions";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/hrdo/complete-profile")({
  beforeLoad: ({ context }) => {
    if (!context.hrdoViewer) {
      throw redirect({ to: "/hrdo/login" });
    }
  },
  head: () => ({
    meta: [
      { title: `Complete your details — ${SITE.name}` },
      {
        name: "description",
        content: "Add your name so it appears correctly on receipts and official documents.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: HrdoCompleteProfile,
});

function HrdoCompleteProfile() {
  const { hrdoViewer } = Route.useRouteContext();
  const router = useRouter();
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: "", middleName: "", lastName: "" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!hrdoViewer) return null;

  const dashboardTarget =
    hrdoViewer.role === "hrdo_staff" || hrdoViewer.role === "hrdo_admin"
      ? "/hrdo/dashboard"
      : "/hrdo/coe";
  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);

    const nextErrors: Record<string, string> = {};
    if (!form.firstName.trim()) nextErrors["firstName"] = "Enter your first name.";
    if (!form.lastName.trim()) nextErrors["lastName"] = "Enter your last name.";
    if (!joinFullName(form)) {
      nextErrors["firstName"] = nextErrors["firstName"] ?? "Enter your full name.";
    }
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    setBusy(true);
    const result = await hrdoCompleteProfileNameFn({ data: form });
    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      setBusy(false);
      return;
    }

    await router.invalidate();
    toast.success("Your details are saved.");
    await navigate({ to: dashboardTarget });
  }

  return (
    <>
      <PageHeader
        title="Complete your details"
        description="Enter your name exactly as it should appear on your COE, receipts, and other official documents."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Section title="Your name">
          <form className="max-w-md space-y-4" onSubmit={onSubmit} noValidate>
            {error && (
              <div
                role="alert"
                className="flex gap-2 rounded-sm border border-destructive/40 bg-danger-soft p-3 text-sm"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                <span>{error}</span>
              </div>
            )}
            <div>
              <Label htmlFor="first-name">First name</Label>
              <Input
                id="first-name"
                autoComplete="given-name"
                required
                className="mt-1"
                value={form.firstName}
                onChange={(event) => set("firstName", event.target.value)}
                aria-invalid={Boolean(fieldErrors["firstName"])}
              />
              {fieldErrors["firstName"] && (
                <p className="mt-1 text-sm text-destructive">{fieldErrors["firstName"]}</p>
              )}
            </div>
            <div>
              <Label htmlFor="middle-name">Middle name (optional)</Label>
              <Input
                id="middle-name"
                autoComplete="additional-name"
                className="mt-1"
                value={form.middleName}
                onChange={(event) => set("middleName", event.target.value)}
                aria-invalid={Boolean(fieldErrors["middleName"])}
              />
              {fieldErrors["middleName"] && (
                <p className="mt-1 text-sm text-destructive">{fieldErrors["middleName"]}</p>
              )}
            </div>
            <div>
              <Label htmlFor="last-name">Last name</Label>
              <Input
                id="last-name"
                autoComplete="family-name"
                required
                className="mt-1"
                value={form.lastName}
                onChange={(event) => set("lastName", event.target.value)}
                aria-invalid={Boolean(fieldErrors["lastName"])}
              />
              {fieldErrors["lastName"] && (
                <p className="mt-1 text-sm text-destructive">{fieldErrors["lastName"]}</p>
              )}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Example: First name “Maria”, middle name “Santos”, last name “Dela Cruz”. Your printed
              name will be “Maria Santos Dela Cruz”.
            </p>
            <Button type="submit" disabled={busy} className="w-full gap-2 sm:w-auto">
              {busy ? (
                <ButtonLoading label="Saving details" />
              ) : (
                <>
                  <User className="h-4 w-4" aria-hidden /> Save and Continue
                </>
              )}
            </Button>
          </form>
        </Section>
      </div>
    </>
  );
}
