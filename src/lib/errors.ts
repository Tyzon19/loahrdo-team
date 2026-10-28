import type { ZodType } from "zod";
import type { ApiResult } from "@/lib/types";

/** An error whose message is safe to show to the signed-in user. */
export class AppError extends Error {
  fieldErrors?: Record<string, string> | undefined;

  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "AppError";
    this.fieldErrors = fieldErrors;
  }
}

export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  const first = result.error.issues[0]?.message ?? "Please check the information you entered.";
  throw new AppError(first, fieldErrors);
}

export async function runSafely<T>(fn: () => Promise<T>): Promise<ApiResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof AppError) {
      return error.fieldErrors
        ? { ok: false, error: error.message, fieldErrors: error.fieldErrors }
        : { ok: false, error: error.message };
    }
    const name = error instanceof Error ? error.name : "UnknownError";
    const message = error instanceof Error ? error.message : "unknown";
    console.error(`[server] ${name}: ${message}`);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export function isDuplicateKey(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ER_DUP_ENTRY"
  );
}

export function isMissingTableError(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && (code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_TABLE_ERROR")) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /no such table|doesn't exist|does not exist/i.test(message);
}