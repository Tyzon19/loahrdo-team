import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

type LoadingScreenProps = {
  label?: string;
  mode?: "inline" | "overlay";
  immediate?: boolean;
};

export function LoadingPanel({ label = "Loading" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2" role="status">
      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </span>
  );
}

export { LoadingPanel as ButtonLoading };

export function LoadingScreen({
  label = "Loading",
  mode = "inline",
  immediate = false,
}: LoadingScreenProps) {
  const [visible, setVisible] = useState(immediate);

  useEffect(() => {
    if (immediate) {
      setVisible(true);
      return;
    }
    const timeout = window.setTimeout(() => setVisible(true), 400);
    return () => window.clearTimeout(timeout);
  }, [immediate]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`startup-loading ${mode === "overlay" ? "startup-loading--overlay" : "startup-loading--inline"}`}
    >
      <img className="startup-loading__artwork" src="/loa-loading.png" alt="" />
      <span className="startup-loading__spinner" aria-hidden="true" />
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

export function LoadingStats() {
  return (
    <div className="mb-4">
      <LoadingScreen label="Loading overview statistics" />
    </div>
  );
}
