import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
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
import NotFound from "@/components/NotFound";
import { Toaster } from "@/components/ui/sonner";
import { SITE, canonical } from "@/lib/site";
import { bootstrapFn } from "@/server-functions";

function NotFoundComponent() {
  const { viewer } = Route.useRouteContext();
  return <NotFound homePath={viewer ? "/dashboard" : "/"} />;
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  useEffect(() => {
    document.title = `This page didn't load — ${SITE.name}`;
    // Never print stacks or internal details in production bundles.
    if (import.meta.env.DEV) console.error(error);
  }, [error]);

  return (
    <>
      <title>Something went wrong — {SITE.name}</title>
      <meta name="robots" content="noindex, nofollow" />
      <NotFound
        variant="error"
        homePath="/"
        homeLabel="Go Home"
        onRetry={() => {
          router.invalidate();
          reset();
        }}
      />
    </>
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
        {
          title: isNotFound
            ? `Page not found — ${SITE.name}`
            : `${SITE.name} — ${SITE.institution}`,
        },
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
