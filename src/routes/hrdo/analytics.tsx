import { createFileRoute, redirect } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { CoeAnalytics } from "@/components/hrdo/CoeAnalytics";
import { canManageHrdoAccounts } from "@/lib/hrdo";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/hrdo/analytics")({
  beforeLoad: ({ context }) => {
    if (!canManageHrdoAccounts(context.hrdoViewer)) {
      throw redirect({ to: "/hrdo/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: `COE Analytics — ${SITE.name}` },
      {
        name: "description",
        content: "COE request volume, service deadlines, releases and department trends.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CoeAnalyticsPage,
});

function CoeAnalyticsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="COE Analytics"
        description="Monitor request volumes, processing deadlines, releases, and department trends."
      />
      <CoeAnalytics />
    </div>
  );
}
