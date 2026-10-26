import {
  createFileRoute,
  Outlet,
  redirect,
  useRouter,
  useRouterState,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/app/AppShell";
import NotFound from "@/components/NotFound";
import { SITE } from "@/lib/site";

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
  errorComponent: AuthenticatedErrorComponent,
});

function AuthenticatedErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();

  useEffect(() => {
    document.title = `This page didn't load — ${SITE.name}`;
    if (import.meta.env.DEV) console.error(error);
  }, [error]);

  return (
    <NotFound
      variant="error"
      homePath="/dashboard"
      homeLabel="Go to dashboard"
      onRetry={() => {
        router.invalidate();
        reset();
      }}
    />
  );
}

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
