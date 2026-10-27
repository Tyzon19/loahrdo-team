export const ANALYTICS_CONSENT_KEY = "loa-analytics-consent";

export type ConsentValue = "granted" | "denied";

export function readAnalyticsConsent(): ConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}
export function writeAnalyticsConsent(value: ConsentValue) {
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
  } catch {
  }
}

export function resetAnalyticsConsent() {
  try {
    window.localStorage.removeItem(ANALYTICS_CONSENT_KEY);
  } catch {
    /* ignore */
  }
}
