import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, CircleCheck, CircleX, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtRange } from "@/lib/format";
import { SITE } from "@/lib/site";

interface VerifiedTicket {
  valid: true;
  ticket: {
    requestNumber: string;
    requestDate: string;
    dateStart: string;
    dateEnd: string;
    destinations: string[];
  };
}

export const Route = createFileRoute("/verify-ticket/$token")({
  head: () => ({
    meta: [
      { title: `Verify Trip Ticket — ${SITE.name}` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: VerifyTicketPage,
});

function VerifyTicketPage() {
  const { token } = Route.useParams();
  const query = useQuery({
    queryKey: ["verify-ticket", token],
    queryFn: async () => {
      const response = await fetch(`/api/verify-ticket/${encodeURIComponent(token)}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("This ticket could not be verified.");
      return (await response.json()) as VerifiedTicket;
    },
    retry: false,
    staleTime: 60_000,
  });
  const ticket = query.data?.ticket;

  return (
    <main className="min-h-screen bg-muted/40 px-4 py-8 sm:py-14">
      <section className="mx-auto max-w-xl rounded-xl border bg-background p-5 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-primary" aria-hidden />
          <div>
            <p className="font-semibold">{SITE.institution}</p>
            <p className="text-sm text-muted-foreground">Official trip ticket verification</p>
          </div>
        </div>

        {query.isPending ? (
          <p role="status" className="py-8 text-center text-muted-foreground">
            Checking the official trip ticket…
          </p>
        ) : query.isError || !ticket ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-5 text-center">
            <CircleX className="mx-auto mb-3 h-10 w-10 text-destructive" aria-hidden />
            <h1 className="text-lg font-semibold">Ticket not verified</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This ticket is invalid, has not been officially sent, or verification is temporarily
              unavailable. Do not rely on the printed details. Contact the Physical Facilities
              Management Office.
            </p>
            <Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>
              Check again
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-5 rounded-lg border border-green-600/30 bg-green-600/5 p-4">
              <div className="flex items-center gap-2 font-semibold text-green-800 dark:text-green-300">
                <CircleCheck className="h-5 w-5" aria-hidden />
                Official ticket verified
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Compare the dates and destination below with the printed ticket. If anything
                differs, do not accept it and contact the office.
              </p>
            </div>
            <dl className="space-y-4">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Request number
                </dt>
                <dd className="mt-1 font-semibold">{ticket.requestNumber}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <CalendarDays className="h-4 w-4" aria-hidden /> Ticket date
                </dt>
                <dd className="mt-1 font-medium">{fmtDate(ticket.requestDate)}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <CalendarDays className="h-4 w-4" aria-hidden /> Official travel dates
                </dt>
                <dd className="mt-1 font-medium">{fmtRange(ticket.dateStart, ticket.dateEnd)}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <MapPin className="h-4 w-4" aria-hidden /> Official destination
                </dt>
                <dd className="mt-1 font-medium">{ticket.destinations.join(" & ")}</dd>
              </div>
            </dl>
          </>
        )}
        <p className="mt-8 border-t pt-4 text-center text-xs text-muted-foreground">
          {SITE.office} · {SITE.institution}
        </p>
      </section>
    </main>
  );
}
