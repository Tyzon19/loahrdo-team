import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ServiceDashboard } from "@/components/ServiceDashboard";
import { unwrap } from "@/lib/api";
import { canonical } from "@/lib/site";
import { hrdoLogoutFn, logoutFn, permissionLogoutFn } from "@/server-functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LOA HRDO Desk | Lyceum of Alabang" },
      {
        name: "description",
        content:
          "Access LOA HR services online: vehicle reservation, COE, permission slips, and attendance.",
      },
      { property: "og:title", content: "LOA HRDO Desk | Lyceum of Alabang" },
      {
        property: "og:description",
        content: "Faster, smarter HR services for Lyceum of Alabang staff.",
      },
      { property: "og:url", content: canonical("/") },
    ],
    links: [{ rel: "canonical", href: canonical("/") }],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { viewer, hrdoViewer, permissionViewer } = Route.useRouteContext();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function signOut() {
    if (viewer) await unwrap(logoutFn());
    if (hrdoViewer) await unwrap(hrdoLogoutFn());
    if (permissionViewer) await unwrap(permissionLogoutFn());
    queryClient.clear();
    await router.invalidate();
    navigate({ to: "/" });
  }

  return (
    <ServiceDashboard
      authenticated={Boolean(viewer || hrdoViewer || permissionViewer)}
      onSignOut={signOut}
    />
  );
}
