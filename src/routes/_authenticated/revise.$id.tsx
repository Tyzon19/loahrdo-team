import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader, Section, EmptyState } from "@/components/app/PageHeader";
import { RequestForm } from "@/components/app/RequestForm";
import { LoadingPanel } from "@/components/app/LoadingPanel";
import { getRequestFn, resubmitRequestFn, updatePendingRequestFn } from "@/server-functions";
import { unwrap } from "@/lib/api";
import { STAGES } from "@/lib/workflow";
import { todayISO } from "@/lib/format";
import type { RequestInput } from "@/lib/types";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/revise/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Revise request ${params.id.slice(0, 8)} — ${SITE.name}` },
      { name: "description", content: "Update a returned vehicle request and resubmit it." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Revise,
});

function Revise() {
  const { id } = Route.useParams();
  const { viewer } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["request", id],
    queryFn: () => unwrap(getRequestFn({ data: id })),
  });

  if (!viewer) return null;

  if (query.isPending) {
    return (
      <>
        <PageHeader title="Revise request" description="Loading the latest record…" />
        <LoadingPanel label="Loading request" rows={8} />
      </>
    );
  }

  const detail = query.data;
  const r = detail?.request;
  const canEditPending = r?.status === "pending_review";
  const canReviseReturned = r?.status === "returned";
  if (!r || r.requisitionerId !== viewer.id || (!canEditPending && !canReviseReturned)) {
    return (
      <Section title="Revision not available">
        <EmptyState title="This request can't be edited right now.">
          Only the original requisitioner can edit a request while it is awaiting the Head of
          Transport Services, or revise it after it has been returned.{" "}
          {r && (
            <Link to="/requests/$id" params={{ id: r.id }} className="text-primary underline">
              View request
            </Link>
          )}
        </EmptyState>
      </Section>
    );
  }

  async function onSubmit(input: RequestInput) {
    if (canEditPending) {
      const result = await updatePendingRequestFn({ data: { id: r!.id, input } });
      if (!result.ok) {
        toast.error(result.error);
        throw new Error(result.error);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["request", r!.id] }),
        queryClient.invalidateQueries({ queryKey: ["requests"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
      ]);
      toast.success("Request changes saved.");
      await navigate({ to: "/requests/$id", params: { id: r!.id }, search: { notice: "edited" } });
      return;
    }

    const result = await resubmitRequestFn({ data: { id: r!.id, input } });
    if (!result.ok) {
      toast.error(result.error);
      throw new Error(result.error);
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["request", r!.id] }),
      queryClient.invalidateQueries({ queryKey: ["requests"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
    toast.success("Request resubmitted. Approval restarts with the Head of Transport Services.");
    if (result.data.workflowEmail?.sent) {
      toast.success("Test approval email sent to mj.turingan@lyceumalabang.edu.ph.");
    } else if (result.data.workflowEmail) {
      toast.error(
        `Request resubmitted, but the test email was not sent: ${result.data.workflowEmail.message}`,
      );
    }
    await navigate({
      to: "/requests/$id",
      params: { id: r!.id },
      search: { notice: "resubmitted" },
    });
  }

  return (
    <>
      <PageHeader
        title={canEditPending ? `Edit ${r.number}` : `Revise ${r.number}`}
        description={
          canEditPending
            ? "Save your changes before the Head of Transport Services signs. Editing closes as soon as the request is signed."
            : "Update the details, then resubmit. Approval will start again with the Head of Transport Services."
        }
      />
      {!canEditPending && r.lastReturn && (
        <div className="mb-4 rounded-sm border border-destructive/40 bg-danger-soft p-3 text-sm">
          <p className="font-semibold">
            Returned by the {STAGES.find((x) => x.key === r.lastReturn!.stage)!.title}
          </p>
          <p className="text-[13px] font-bold text-[#ff3333]">Reason: {r.lastReturn.reason}</p>
        </div>
      )}
      <RequestForm
        key={r.id + r.attempt}
        header={{ number: r.number, date: todayISO(), requisitioner: r.requisitionerName }}
        initial={{
          department: r.department,
          destinations: r.destinations,
          passengers: r.passengers,
          dateStart: r.dateStart,
          dateEnd: r.dateEnd,
          timeNeeded: r.timeNeeded,
          purpose: r.purpose,
        }}
        submitLabel={canEditPending ? "Save Changes" : "Resubmit Request"}
        allowExistingPastStartDate={canEditPending}
        onSubmit={onSubmit}
      />
    </>
  );
}
