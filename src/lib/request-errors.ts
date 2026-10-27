const DISCONNECT_CODES = new Set([
  "ECONNRESET",
  "ERR_STREAM_PREMATURE_CLOSE",
  "ERR_HTTP2_STREAM_CANCEL",
]);
const MAX_CAUSE_DEPTH = 8;

export function isClientDisconnectError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current != null; depth++) {
    if (typeof current !== "object" || seen.has(current)) return false;
    seen.add(current);

    const candidate = current as {
      cause?: unknown;
      code?: unknown;
      message?: unknown;
      name?: unknown;
    };
    if (
      candidate.name === "AbortError" ||
      (typeof candidate.code === "string" && DISCONNECT_CODES.has(candidate.code)) ||
      (typeof candidate.message === "string" &&
        /^(?:request )?aborted$/i.test(candidate.message.trim()))
    ) {
      return true;
    }

    current = candidate.cause;
  }

  return false;
}
