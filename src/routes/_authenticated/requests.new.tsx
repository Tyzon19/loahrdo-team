import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { RequestForm } from "@/components/app/RequestForm";
import { submitRequestFn } from "@/server-functions";
import { todayISO } from "@/lib/format";
import type { RequestInput } from "@/lib/types";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/requests/new")({
  beforeLoad: ({ context }) => {
    if (context.viewer?.role !== "requisitioner") {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: `New Vehicle Request — ${SITE.name}` },
      { name: "description", content: "Submit a new school vehicle reservation request." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: NewRequest,
});

function NewRequest() {
  const { viewer } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (!viewer) return null;

  const initial: RequestInput = {
    department: viewer.department,
    destinations: [""],
    passengers: Number.NaN,
    dateStart: "",
    dateEnd: "",
    timeNeeded: "",
    purpose: "",
  };

  async function onSubmit(input: RequestInput) {
    const result = await submitRequestFn({ data: input });
    if (!result.ok) {
      toast.error(result.error);
      throw new Error(result.error);
    }
    await queryClient.invalidateQueries({ queryKey: ["requests"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    toast.success(`Request ${result.data.number} submitted.`);
    if (result.data.workflowEmail?.sent) {
      toast.success(
        `Approval notification emailed to ${result.data.workflowEmail.delivered} configured recipient(s).`,
      );
    } else if (result.data.workflowEmail) {
      toast.error(result.data.workflowEmail.message);
    }
    await navigate({
      to: "/requests/$id",
      params: { id: result.data.id },
      search: { notice: "submitted" },
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title="New Vehicle Request" description="Fill in the details below." />
      <RequestForm
        key={viewer.id}
        header={{ number: "Assigned on submit", date: todayISO(), requisitioner: viewer.name }}
        initial={initial}
        submitLabel="Submit Request"
        onSubmit={onSubmit}
      />
    </div>
  );
}
