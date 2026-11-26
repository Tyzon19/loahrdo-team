import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/webhooks/leave-tracker")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/server/leaves")).leaveTrackerJobs(request),
      POST: async ({ request }) => (await import("@/server/leaves")).leaveTrackerJobs(request),
    },
  },
});
