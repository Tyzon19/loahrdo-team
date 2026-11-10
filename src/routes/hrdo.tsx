import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { HrdoShell } from "@/components/hrdo/HrdoShell";

export const Route = createFileRoute("/hrdo")({
  beforeLoad: ({ context, location }) => {
    if (
      location.pathname === "/hrdo/login" ||
      location.pathname === "/hrdo/forgot-password" ||
      location.pathname === "/hrdo/change-password"
    ) {
      return;
    }

    if (!context.hrdoViewer) {
      throw redirect({
        to: "/hrdo/login",
        search: { redirect: location.pathname },
      });
    }
    if (
      context.hrdoViewer.isExternal &&
      location.pathname !== "/hrdo/coe" &&
      !location.pathname.startsWith("/hrdo/coe/")
    ) {
      throw redirect({ to: "/hrdo/coe" });
    }
    if (context.hrdoViewer.mustChangePassword && location.pathname !== "/hrdo/change-password") {
      throw redirect({ to: "/hrdo/change-password" });
    }
    if (!context.hrdoViewer.isExternal && location.pathname === "/hrdo") {
      throw redirect({ to: "/hrdo/dashboard" });
    }
  },
  component: HrdoLayout,
});

function HrdoLayout() {
  const { hrdoViewer } = Route.useRouteContext();

  if (!hrdoViewer) {
    return <Outlet />;
  }

  return (
    <HrdoShell user={hrdoViewer}>
      <Outlet />
    </HrdoShell>
  );
}
