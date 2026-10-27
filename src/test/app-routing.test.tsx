import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

function match(path: string) {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
  });
  return router.matchRoutes(path);
}

describe("App routing", () => {
  it("matches the public landing page for /", () => {
    const matches = match("/");
    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
    expect(matches.at(-1)?.routeId).toBe("/");
  });

  it("matches public auth and privacy pages", () => {
    expect(match("/login").at(-1)?.routeId).toBe("/login");
    expect(match("/register").at(-1)?.routeId).toBe("/register");
    expect(match("/privacy").at(-1)?.routeId).toBe("/privacy");
  });

  it("matches the authenticated dashboard and request routes", () => {
    expect(match("/dashboard").at(-1)?.routeId).toBe("/_authenticated/dashboard");
    expect(match("/requests").at(-1)?.routeId).toBe("/_authenticated/requests/");
    expect(match("/requests/new").at(-1)?.routeId).toBe("/_authenticated/requests/new");
  });

  it("falls back to the root 404 for unknown paths", () => {
    expect(match("/this-page-does-not-exist").at(-1)?.routeId).toBe(rootRouteId);
  });
});
