import { format, isValid, parseISO } from "date-fns";

/** Formatters never throw: empty or invalid input renders as "—". */
const safe = (d: string | undefined, pattern: string) => {
  if (!d) return "—";
  const p = parseISO(d);
  return isValid(p) ? format(p, pattern) : "—";
};

export const fmtDate = (d?: string) => safe(d, "MMM d, yyyy");
export const fmtDateTime = (d?: string) => safe(d, "MMM d, yyyy · h:mm a");
export const fmtTime = (t?: string) => {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  if (h == null || m == null || Number.isNaN(h) || Number.isNaN(m)) return "—";
  return format(new Date(2000, 0, 1, h, m), "h:mm a");
};
export const fmtRange = (a: string, b: string) => (!a || !b || a === b ? fmtDate(a || b) : `${fmtDate(a)} – ${fmtDate(b)}`);
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};