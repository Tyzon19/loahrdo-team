import type { ApiResult } from "./types";

export class ApiError extends Error {
  fieldErrors?: Record<string, string> | undefined;

  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.fieldErrors = fieldErrors;
  }
}

export async function unwrap<T>(promise: Promise<ApiResult<T>>): Promise<T> {
  const result = await promise;
  if (!result.ok) throw new ApiError(result.error, result.fieldErrors);
  return result.data;
}
