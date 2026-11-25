import type { ReactNode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/lib/types";
import { routeTree } from "@/routeTree.gen";
import { Route as AuthenticatedRoute } from "@/routes/_authenticated";
import { Route as LoginRoute } from "@/routes/login";

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => (
    <section data-testid="requestor-portal">{children}</section>
  ),
}));

const viewer: Viewer = {
  id: "requestor",
  name: "Requestor",
  email: "requestor@lyceumalabang.edu.ph",
  role: "requisitioner",
  department: "College",
  mustChangePassword: false,
  needsProfileCompletion: false,
  isSuperAdmin: false,
};

// Initialize the real layout's route ID, then exercise its component with delayed child routes.
createRouter({ routeTree, context: { queryClient: new QueryClient() } });

describe("Authenticated layout during navigation", () => {
  it("accepts internal return paths and rejects external or control-character paths", () => {
    const validateSearch = LoginRoute.options.validateSearch;
    if (typeof validateSearch !== "function") throw new Error("Expected a login search validator.");
    expect(validateSearch({ redirect: "/requests/new" })).toMatchObject({
      redirect: "/requests/new",
    });
    for (const redirect of [
      "//example.com",
      "/\\example.com",
      "/requests\n/new",
      "/requests\0/new",
    ]) {
      expect(validateSearch({ redirect })).not.toHaveProperty("redirect");
    }
  });

  it.each([
    [{ ...viewer, role: "admin" as const }, "/admin"],
    [{ ...viewer, mustChangePassword: true }, "/change-password"],
    [{ ...viewer, needsProfileCompletion: true }, "/complete-profile"],
  ] as const)("preserves the %s account destination %s", (account, target) => {
    let redirect: unknown;
    try {
      LoginRoute.options.beforeLoad?.({
        context: { viewer: account },
        search: account.role === "admin" ? {} : { redirect: "/requests/new" },
      } as never);
    } catch (error) {
      redirect = error;
    }
    expect(redirect).toMatchObject({ options: { to: target } });
  });

  it("returns directly to the requested page when login refreshes the auth context", async () => {
    let signedIn = false;
    const root = createRootRouteWithContext<{ viewer: Viewer | null }>()({
      beforeLoad: () => ({ viewer: signedIn ? viewer : null }),
      component: Outlet,
    });
    const login = createRoute({
      getParentRoute: () => root,
      path: "login",
      validateSearch: LoginRoute.options.validateSearch!,
      beforeLoad: (options) => LoginRoute.options.beforeLoad?.(options as never),
      component: () => <main data-testid="login">Sign in</main>,
    });
    const dashboard = createRoute({
      getParentRoute: () => root,
      path: "dashboard",
      component: () => <main data-testid="services">Services dashboard</main>,
    });
    const request = createRoute({
      getParentRoute: () => root,
      path: "requests/new",
      component: () => <main data-testid="request-form">New request</main>,
    });
    const router = createRouter({
      routeTree: root.addChildren([login, dashboard, request]),
      context: { viewer: null },
      history: createMemoryHistory({ initialEntries: ["/login?redirect=%2Frequests%2Fnew"] }),
    });
    await router.load();
    render(<RouterProvider router={router} />);
    expect(await screen.findByTestId("login")).toBeInTheDocument();
    signedIn = true;
    await act(async () => {
      await router.invalidate();
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/requests/new"));
    expect(screen.getByTestId("request-form")).toBeInTheDocument();
    expect(screen.queryByTestId("services")).not.toBeInTheDocument();
  });

  it.each([
    ["/dashboard", "/requests/new", "services", "request-form"],
    ["/requests/new", "/dashboard", "request-form", "services"],
    ["/print/ticket", "/requests/new", "trip-ticket", "request-form"],
    ["/requests/new", "/print/ticket", "request-form", "trip-ticket"],
  ] as const)("keeps %s in its own layout while %s loads", async (from, to, before, after) => {
    let resolve!: () => void;
    const pending = new Promise<void>((done) => {
      resolve = done;
    });
    const root = createRootRouteWithContext<{ viewer: Viewer }>()({ component: Outlet });
    const authenticated = createRoute({
      getParentRoute: () => root,
      id: "_authenticated",
      component: AuthenticatedRoute.options.component!,
    });
    const children = [
      { path: "dashboard", testId: "services" },
      { path: "requests/new", testId: "request-form" },
      { path: "print/$id", testId: "trip-ticket" },
    ].map(({ path, testId }) =>
      createRoute({
        getParentRoute: () => authenticated,
        path,
        loader: ({ location }) => (location.pathname === to ? pending : undefined),
        component: () => <main data-testid={testId}>{testId}</main>,
      }),
    );
    const router = createRouter({
      routeTree: root.addChildren([authenticated.addChildren(children)]),
      context: { viewer },
      history: createMemoryHistory({ initialEntries: [from] }),
      defaultPendingMs: 10_000,
    });
    await router.load();
    render(<RouterProvider router={router} />);
    expect(await screen.findByTestId(before)).toBeInTheDocument();
    let navigation!: Promise<void>;
    act(() => {
      navigation = router.navigate({ href: to });
    });
    try {
      await waitFor(() => expect(router.state.location.pathname).toBe(to));
      expect(screen.getByTestId(before)).toBeInTheDocument();
      expect(Boolean(screen.queryByTestId("requestor-portal"))).toBe(from === "/requests/new");
    } finally {
      await act(async () => {
        resolve();
        await navigation;
      });
    }
    expect(screen.getByTestId(after)).toBeInTheDocument();
    expect(Boolean(screen.queryByTestId("requestor-portal"))).toBe(to === "/requests/new");
  });
});
