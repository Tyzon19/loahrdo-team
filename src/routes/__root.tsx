import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  rootRouteId,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Analytics } from "@/components/Analytics";
import { PublicShell } from "@/components/marketing/PublicShell";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { SITE, canonical } from "@/lib/site";
import { bootstrapFn } from "@/server-functions";

function NotFoundComponent() {
  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-20 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Error 404</p>
        <h1 className="mt-3 font-serif text-3xl font-bold sm:text-4xl">We couldn&apos;t find that page.</h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          The address may be mistyped, or the page may have moved. You can return to the home
          page, sign in, or open your dashboard.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link to="/">Go to home page</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </PublicShell>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  useEffect(() => {
    document.title = `This page didn't load — ${SITE.name}`;
    // Never print stacks or internal details in production bundles.
    if (import.meta.env.DEV) console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <title>Something went wrong — {SITE.name}</title>
      <meta name="robots" content="noindex, nofollow" />
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">This page didn&apos;t load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. Please try again. If the problem continues, return to the
          dashboard.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Go to home page</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async () => {
    const bootstrap = await bootstrapFn();
    return { viewer: bootstrap.viewer, analytics: bootstrap.analytics };
  },
  head: ({ matches }) => {
    const isNotFound = matches[matches.length - 1]?.routeId === rootRouteId;
    return {
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: isNotFound ? `Page not found — ${SITE.name}` : `${SITE.name} — ${SITE.institution}` },
      { name: "description", content: SITE.description },
      { name: "robots", content: isNotFound ? "noindex, nofollow" : "index, follow" },
      { name: "theme-color", content: "#ffffff" },
      { property: "og:site_name", content: SITE.name },
      { property: "og:type", content: "website" },
      { property: "og:title", content: `${SITE.name} — ${SITE.institution}` },
      { property: "og:description", content: SITE.description },
      { property: "og:url", content: canonical("/") },
      { property: "og:image", content: `${SITE.url}${SITE.ogImage}` },
      { property: "og:image:alt", content: SITE.ogImageAlt },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:locale", content: "en_PH" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: `${SITE.name} — ${SITE.institution}` },
      { name: "twitter:description", content: SITE.description },
      { name: "twitter:image", content: `${SITE.url}${SITE.ogImage}` },
      { name: "twitter:image:alt", content: SITE.ogImageAlt },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:wght@600;700&display=swap",
      },
    ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-sm focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
        >
          Skip to main content
        </a>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient, analytics } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Analytics measurementId={analytics.measurementId} />
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
