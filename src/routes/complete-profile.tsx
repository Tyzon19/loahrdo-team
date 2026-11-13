import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { User } from "lucide-react";
import { AuthLayout, Field, SubmitButton } from "@/components/AuthLayout";
import { joinFullName } from "@/lib/name";
import { safeSignInNext } from "@/lib/google-signin";
import { completeProfileNameFn } from "@/server-functions";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/complete-profile")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search["redirect"] === "string" ? search["redirect"] : undefined,
  }),
  beforeLoad: ({ context }) => {
    if (!context.viewer) throw redirect({ to: "/login" });
    if (!context.viewer.needsProfileCompletion) {
      throw redirect({
        to: context.viewer.mustChangePassword ? "/change-password" : "/dashboard",
      });
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
  component: CompleteProfilePage,
});

function CompleteProfilePage() {
  const { viewer } = Route.useRouteContext();
  const search = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: "", middleName: "", lastName: "" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!viewer) return null;

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
    const result = await completeProfileNameFn({ data: form });
    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      setBusy(false);
      return;
    }

    await router.invalidate();
    toast.success("Your details are saved.");
    await navigate({
      href: result.data.mustChangePassword ? "/change-password" : safeSignInNext(search.redirect),
    });
  }

  return (
    <AuthLayout title="Complete Your Details" centered>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Welcome! Enter your name exactly as it should appear on your permission slips, trip tickets,
        COE, and other official documents.
      </p>

      <form onSubmit={onSubmit} noValidate>
        {error && (
          <p className="mb-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Field
          icon={User}
          placeholder="First name"
          autoComplete="given-name"
          required
          value={form.firstName}
          onChange={(event) => set("firstName", event.target.value)}
        />
        {fieldErrors["firstName"] && (
          <p className="mb-3 text-sm text-destructive" role="alert">
            {fieldErrors["firstName"]}
          </p>
        )}
        <Field
          icon={User}
          placeholder="Middle name (optional)"
          autoComplete="additional-name"
          value={form.middleName}
          onChange={(event) => set("middleName", event.target.value)}
        />
        {fieldErrors["middleName"] && (
          <p className="mb-3 text-sm text-destructive" role="alert">
            {fieldErrors["middleName"]}
          </p>
        )}
        <Field
          icon={User}
          placeholder="Last name"
          autoComplete="family-name"
          required
          value={form.lastName}
          onChange={(event) => set("lastName", event.target.value)}
        />
        {fieldErrors["lastName"] && (
          <p className="mb-3 text-sm text-destructive" role="alert">
            {fieldErrors["lastName"]}
          </p>
        )}

        <p className="mb-4 mt-1 text-xs leading-relaxed text-muted-foreground">
          Example: First name “Maria”, middle name “Santos”, last name “Dela Cruz”. Your printed
          name will be “Maria Santos Dela Cruz”.
        </p>

        <SubmitButton icon={User} disabled={busy}>
          {busy ? "Saving details" : "Save and Continue"}
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}
