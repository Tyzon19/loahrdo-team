import { createFileRoute } from "@tanstack/react-router";

// Legacy URL uses the new authenticated snapshot contract during rollout.
export const Route = createFileRoute("/api/sheets/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleSheetsSync } = await import("@/server/attendance-webhook");
        return handleSheetsSync(request);
      },
    },
  },
});
