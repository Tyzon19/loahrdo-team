let loaded = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  if (typeof window !== "undefined") return;
  try {
    (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env");
  } catch {
  }
}

export function serverEnv(key: string): string {
  ensureLoaded();
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export function serverEnvOptional(key: string): string | undefined {
  ensureLoaded();
  const value = process.env[key];
  return value && value.trim() ? value.trim() : undefined;
}

export function allowedEmailDomains(): string[] {
  return (serverEnvOptional("ALLOWED_EMAIL_DOMAINS") ?? "loa.edu.ph,lyceumalabang.edu.ph")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function publicSiteUrl(): string {
  return serverEnvOptional("SITE_URL") ?? "http://localhost:8080";
}

export function encryptedCookieRequired(): boolean {
  return publicSiteUrl().startsWith("https://");
}
