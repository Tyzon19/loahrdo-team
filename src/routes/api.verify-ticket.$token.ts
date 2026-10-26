import { createFileRoute } from "@tanstack/react-router";

const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export const Route = createFileRoute("/api/verify-ticket/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { verifyTicketToken } = await import("@/server/ticket-verification");
          const ticket = await verifyTicketToken(params.token);
          if (!ticket) {
            return new Response(JSON.stringify({ valid: false }), { status: 404, headers });
          }
          return new Response(JSON.stringify({ valid: true, ticket }), { status: 200, headers });
        } catch (error) {
          const name = error instanceof Error ? error.name : "UnknownError";
          const message = error instanceof Error ? error.message : "unknown error";
          console.error(`[ticket-verification] ${name}: ${message}`);
          return new Response(JSON.stringify({ error: "Ticket verification is unavailable." }), {
            status: 503,
            headers,
          });
        }
      },
    },
  },
});
