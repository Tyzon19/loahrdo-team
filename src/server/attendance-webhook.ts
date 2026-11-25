import { AppError } from "@/lib/errors";
import { authenticateSheetsWebhook, ingestSheetsSnapshot } from "./attendance";

const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};
const response = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers });
const MAX_BYTES = 8 * 1024 * 1024;

export async function handleSheetsSync(request: Request) {
  // Authenticate before parsing/reading a potentially large body.
  try {
    authenticateSheetsWebhook(request.headers.get("x-hrdo-webhook-secret"));
  } catch {
    return response(401, { ok: false, error: "Webhook authentication failed." });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return response(415, { ok: false, error: "Send application/json." });
  }
  if (Number(request.headers.get("content-length")) > MAX_BYTES)
    return response(413, { ok: false, error: "Snapshot is too large." });
  const reader = request.body?.getReader();
  if (!reader) return response(400, { ok: false, error: "A STAFF snapshot is required." });
  let body = "",
    bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        return response(413, { ok: false, error: "Snapshot is too large." });
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    let input: unknown;
    try {
      input = JSON.parse(body);
    } catch {
      return response(400, { ok: false, error: "Invalid JSON." });
    }
    const result = await ingestSheetsSnapshot(input);
    return response(200, { ok: true, result });
  } catch (error) {
    if (error instanceof AppError) return response(400, { ok: false, error: error.message });
    console.error("[sheets-sync] Snapshot failed", error instanceof Error ? error.name : "unknown");
    return response(500, { ok: false, error: "Attendance sync failed. Retry this snapshot." });
  } finally {
    reader.releaseLock();
  }
}
