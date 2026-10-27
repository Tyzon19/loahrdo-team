import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  readAnalyticsConsent,
  writeAnalyticsConsent,
  type ConsentValue,
} from "@/lib/consent";
import { recordPageViewFn } from "@/server-functions";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}
function normalisePath(path: string) {
  const grouped = path
    .replace(/\/(requests|revise|print)\/[0-9a-f-]{36}/gi, "/$1/:id")
    .replace(/\/+$/, "");
  return grouped || "/";
}

export function Analytics({ measurementId }: { measurementId: string | null }) {
  const path = useRouterState({ select: (router) => router.location.pathname });
  const [consent, setConsent] = useState<ConsentValue | null>(null);
  const [ready, setReady] = useState(false);
  const [gaLoaded, setGaLoaded] = useState(false);

  useEffect(() => {
    const stored = readAnalyticsConsent();
    if (stored) setConsent(stored);
    else if (window.navigator.doNotTrack === "1") setConsent("denied");
    setReady(true);
  }, []);
  useEffect(() => {
    if (consent !== "granted" || !measurementId || gaLoaded) return;
    const existing = document.querySelector<HTMLScriptElement>("script[data-loa-ga]");
    if (!existing) {
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      script.dataset["loaGa"] = "true";
      document.head.appendChild(script);
    }
    window.dataLayer = window.dataLayer ?? [];
    window.gtag =
      window.gtag ??
      ((...args: unknown[]) => {
        window.dataLayer!.push(args);
      });
    window.gtag("js", new Date());
    window.gtag("config", measurementId, {
      anonymize_ip: true,
      send_page_view: false,
    });
    setGaLoaded(true);
  }, [consent, measurementId, gaLoaded]);

  useEffect(() => {
    if (consent !== "granted" || !ready) return;
    const view = normalisePath(path);
    if (view.startsWith("/print")) return;

    window.gtag?.("event", "page_view", { page_path: view });
    void recordPageViewFn({ data: view }).catch(() => {});
  }, [consent, ready, path]);

  function choose(value: ConsentValue) {
    writeAnalyticsConsent(value);
    setConsent(value);
  }

  if (!ready || consent !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="Analytics cookie preference"
      aria-live="polite"
      className="no-print fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-sm border bg-card p-4 shadow-lg sm:inset-x-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm">
          We use optional analytics cookies to count visits and improve this service. No
          analytics runs unless you accept.{" "}
          <Link to="/privacy" className="text-primary underline">
            Read the Privacy Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => choose("denied")}>
            Decline
          </Button>
          <Button size="sm" onClick={() => choose("granted")}>
            Accept analytics
          </Button>
        </div>
      </div>
    </div>
  );
}
