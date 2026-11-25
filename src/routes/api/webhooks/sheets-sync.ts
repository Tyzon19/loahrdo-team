import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/webhooks/sheets-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleSheetsSync } = await import("@/server/attendance-webhook");
        return handleSheetsSync(request);
      },
    },
  },
});
