import { createFileRoute } from "@tanstack/react-router";

const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export const Route = createFileRoute("/api/sheets/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const secret = request.headers.get("x-webhook-secret");
          const { syncFromWebhook } = await import("@/server/late-absences");
          const result = await syncFromWebhook(secret, body);
          return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Attendance sync failed.";
          const status = message.includes("authentication") ? 401 : 400;
          console.error(`[late-absences-webhook] ${message}`);
          return new Response(JSON.stringify({ ok: false, error: message }), { status, headers });
        }
      },
    },
  },
});
