import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context, location }) => {
    if (!context.viewer) {
      throw redirect({
        to: "/login",
        search: { redirect: location.pathname },
      });
    }
    if (context.viewer.mustChangePassword && location.pathname !== "/change-password") {
      throw redirect({ to: "/change-password" });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { viewer } = Route.useRouteContext();
  const path = useRouterState({ select: (router) => router.location.pathname });
  if (!viewer) return null;
  // The trip ticket is a full-page print sheet; it is still behind the same guard.
  if (path.startsWith("/print/")) return <Outlet />;
  return (
    <AppShell user={viewer}>
      <Outlet />
    </AppShell>
  );
}
