import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Printer, Send } from "lucide-react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LoadingPanel } from "@/components/app/LoadingPanel";
import {
  getPrintableRequestFn,
  markApprovalNoticeReadFn,
  sendTripTicketFn,
} from "@/server-functions";
import { unwrap } from "@/lib/api";
import { currentSignatures, STAGES } from "@/lib/workflow";
import { fmtDate, fmtDateTime, fmtRange, fmtTime } from "@/lib/format";
import { SignatureMark } from "@/components/app/SignaturePad";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/print/$id")({
  head: () => ({
    meta: [
      { title: `Trip Ticket — ${SITE.name}` },
      { name: "description", content: "Printable Vehicle Reservation and Trip Ticket." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PrintTicket,
});

function PrintTicket() {
  const { id } = Route.useParams();
  const { viewer } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [sending, setSending] = useState(false);
  const [ticketSent, setTicketSent] = useState(false);
  const query = useQuery({
    queryKey: ["request", id],
    queryFn: () => unwrap(getPrintableRequestFn({ data: id })),
  });
  useEffect(() => {
    const number = query.data?.request.number;
    if (!number) return;
    const previousTitle = document.title;
    document.title = `${number} - Trip Ticket`;
    return () => {
      document.title = previousTitle;
    };
  }, [query.data?.request.number]);
  useEffect(() => {
    const request = query.data?.request;
    if (
      viewer?.role !== "requisitioner" ||
      !request ||
      !["approved", "dispatched", "completed"].includes(request.status)
    ) {
      return;
    }

    void (async () => {
      try {
        await unwrap(markApprovalNoticeReadFn({ data: request.id }));
        await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      } catch {
        toast.error("We couldn't update your approval notice. Please try again.");
      }
    })();
  }, [query.data?.request, queryClient, viewer?.role]);

  if (query.isPending) {
    return (
      <div className="mx-auto max-w-[210mm] p-4">
        <LoadingPanel label="Loading trip ticket" rows={10} />
      </div>
    );
  }

  const detail = query.data;
  if (!detail) {
    return (
      <p className="p-8">
        Request not found.{" "}
        <Link to="/dashboard" className="text-primary underline">
          Go to Dashboard
        </Link>
      </p>
    );
  }

  const r = detail.request;
  const d = detail.doc;
  const isRequisitioner = viewer?.role === "requisitioner";
  const approved = ["approved", "dispatched", "completed"].includes(r.status);
  const ticketAlreadySent = ticketSent || detail.tripTicketAttached;
  const sigs = currentSignatures(r);
  const dp = r.dispatch;

  async function sendToRequisitioner() {
    const node = sheetRef.current;
    if (!node) return;
    setSending(true);
    try {
      // Capture the ticket exactly as it renders (2x for a sharp photo).
      const image = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: true,
      });
      const result = await sendTripTicketFn({ data: { id: r.id, image } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setTicketSent(true);
      toast.success(
        result.data.alreadySent
          ? "The trip ticket is already attached to the requisitioner's notification."
          : "Trip ticket attached to the requisitioner's notification.",
      );
    } catch {
      toast.error("We couldn't create the trip ticket photo. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={`print-sheet min-h-screen bg-background py-6 print:min-h-0 print:bg-white print:py-0 ${isRequisitioner ? "requisitioner-ticket" : ""}`}
    >
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4">
        <Button asChild variant="ghost">
          <Link to="/requests/$id" params={{ id: r.id }}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to request
          </Link>
        </Button>
        <div className="flex gap-2">
          {approved && !isRequisitioner && (
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden /> Download / Print PDF
            </Button>
          )}
          {!isRequisitioner && (
            <Button
              onClick={() => void sendToRequisitioner()}
              disabled={!approved || sending || ticketAlreadySent}
            >
              <Send className="h-4 w-4" aria-hidden />
              {sending ? "Preparing…" : ticketAlreadySent ? "Ticket Sent" : "Send to Requisitioner"}
            </Button>
          )}
        </div>
      </div>
      {approved && isRequisitioner && (
        <p className="no-print mx-auto mb-3 max-w-[210mm] px-4 text-xs text-muted-foreground">
          Show this ticket on screen to your driver. Signature images are protected from casual
          dragging and selection; browser screenshots and developer tools cannot be fully blocked.
        </p>
      )}
      {approved && !isRequisitioner && (
        <p className="no-print mx-auto mb-3 max-w-[210mm] px-4 text-xs text-muted-foreground">
          To save a copy, choose “Save as PDF” in your browser&apos;s print dialog.
        </p>
      )}
      {!approved && (
        <p className="no-print mx-auto mb-3 max-w-[210mm] px-4 text-sm text-destructive">
          This request has not received final approval. The trip ticket can be downloaded after the
          President approves it.
        </p>
      )}
      <div className="print-half">
        <div
          ref={sheetRef}
          className="print-page min-h-screen bg-background py-6 print:min-h-0 print:bg-white print:py-0"
        >
          <header className="text-center">
            <img
              src="/loa-logo.png"
              alt="Lyceum of Alabang official seal"
              className="mx-auto mb-1 h-12 w-12 object-contain print:h-12 print:w-12"
            />
            <p className="font-serif text-2xl font-bold leading-tight">{d.institution}</p>
            <p className="font-serif text-xs font-semibold">{d.certification.toUpperCase()}</p>
            <p className="mt-2 text-sm font-semibold">{d.office}</p>
            <h1 className="mt-1 text-base font-bold tracking-wide">{d.title}</h1>
          </header>
          <div className="mt-2 flex items-end justify-between gap-4">
            <p className="text-sm font-bold">
              NO.: <span className="border-b border-foreground px-3 font-medium">{r.number}</span>
            </p>
            <table className="border border-foreground/60 text-[10px]">
              <tbody>
                <tr>
                  <td className="px-2">Document No.:</td>
                  <td className="font-medium">{d.docNo}</td>
                </tr>
                <tr>
                  <td className="px-2">Revision No.:</td>
                  <td className="font-medium">{d.revisionNo}</td>
                </tr>
                <tr>
                  <td className="px-2">Effectivity Date:</td>
                  <td className="pr-2 font-medium">{fmtDate(d.effectiveDate)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="print-form mt-1 border-2 border-foreground text-sm [&>div]:border-b [&>div]:border-foreground/70 [&>div:last-child]:border-b-0">
            <div className="px-2 py-1">
              <strong className="text-xs">DATE:</strong>{" "}
              <span className="ml-4">{fmtDate(r.createdAt)}</span>
            </div>
            <div className="px-2 py-1">
              <strong className="text-xs">REQUISITIONER:</strong>{" "}
              <span className="ml-4">
                <span className="font-medium">{r.requisitionerName}</span>
                <span className="font-medium">{r.department ? ` — ${r.department}` : ""}</span>
              </span>
            </div>
            <div className="grid grid-cols-[1fr_28%]">
              <div className="min-h-14 border-r border-foreground/70 px-2 py-1">
                <strong className="text-xs">DESTINATION:</strong>
                <p className="ml-4 font-medium">{r.destinations.join(" & ")}</p>
              </div>
              <div className="px-2 py-1">
                <strong className="text-xs">NO. OF PASSENGER:</strong>
                <p className="text-center font-medium">{r.passengers}</p>
              </div>
            </div>
            <div className="grid grid-cols-[1fr_45%]">
              <div className="border-r border-foreground/70 px-2 py-1">
                <strong className="text-xs">DATE NEEDED:</strong>{" "}
                <span className="font-medium">{fmtRange(r.dateStart, r.dateEnd)}</span>
              </div>
              <div className="px-2 py-1">
                <strong className="text-xs">TIME NEEDED:</strong>{" "}
                <span className="ml-2 font-medium">{fmtTime(r.timeNeeded)}</span>
              </div>
            </div>
            <div className="min-h-20 px-2 py-1">
              <strong className="text-xs">PURPOSE OF TRAVEL:</strong>{" "}
              <span className="ml-4 whitespace-pre-wrap">{r.purpose}</span>
            </div>
            {STAGES.map((st) => {
              const signature = sigs.find((x) => x.stage === st.key);
              const name = signature?.proxySignerName
                ? (detail.approverNames[st.key] ?? signature.signerName)
                : (signature?.signerName ?? detail.approverNames[st.key] ?? "");
              const title = st.key === "review" ? "Head - Transport Services" : st.title;
              const block = (
                <div
                  className={`grid ${signature?.proxySignerName ? "grid-cols-2" : "grid-cols-1"} px-2 pb-1`}
                >
                  <div className="flex flex-col items-center">
                    <div className="flex h-12 items-end">
                      {signature && !signature.proxySignerName && (
                        <SignatureMark
                          image={signature.image}
                          method={signature.method}
                          name={signature.signerName}
                          protectedDisplay={isRequisitioner}
                        />
                      )}
                    </div>
                    <p className="text-center text-xs font-bold">{name}</p>
                    <p className="text-center text-xs">{title}</p>
                    {signature && !signature.proxySignerName && (
                      <p className="text-[9px] text-muted-foreground">
                        Signed {fmtDateTime(signature.at)}
                      </p>
                    )}
                    {!signature && detail.assistantNames[st.key] && (
                      <p className="text-[10px]">CC: {detail.assistantNames[st.key]}</p>
                    )}
                  </div>
                  {signature?.proxySignerName && (
                    <div className="flex flex-col items-center border-l border-foreground/40 px-1">
                      <div className="flex h-12 items-end">
                        <SignatureMark
                          image={signature.image}
                          method={signature.method}
                          name={signature.proxySignerName}
                          protectedDisplay={isRequisitioner}
                        />
                      </div>
                      <p className="text-center text-xs font-bold">{signature.proxySignerName}</p>
                      <p className="text-center text-[10px]">Alternate Signatory</p>
                      <p className="text-center text-[9px] text-muted-foreground">
                        Signed {fmtDateTime(signature.at)}
                      </p>
                    </div>
                  )}
                </div>
              );
              return st.key === "review" ? (
                <div key={st.key} className="grid grid-cols-2">
                  <div className="border-r border-foreground/70 pt-1">
                    <p className="px-2 text-xs font-bold">Reviewed By:</p>
                    {block}
                  </div>
                  <div className="space-y-4 px-3 pt-6 text-xs font-bold">
                    <p>
                      VEHICLE TYPE:{" "}
                      <span className="inline-block min-w-32 border-b border-foreground font-normal">
                        <span className="font-medium">{r.vehicleType ?? ""}</span>
                      </span>
                    </p>
                    <p>
                      PLATE NO.:{" "}
                      <span className="inline-block min-w-36 border-b border-foreground font-normal">
                        <span className="font-medium">{r.plateNo ?? ""}</span>
                      </span>
                    </p>
                    <p>
                      DRIVER:{" "}
                      <span className="inline-block min-w-36 border-b border-foreground font-normal">
                        <span className="font-medium">
                          {r.dispatch.driverName ?? "Not assigned"}
                        </span>
                      </span>
                    </p>
                  </div>
                </div>
              ) : (
                <div key={st.key} className="pt-1">
                  <p className="px-2 text-xs font-bold">{st.label}:</p>
                  {block}
                </div>
              );
            })}
            <div className="px-2 py-1.5 text-xs font-bold">DISPATCHED BY:</div>
            <div className="grid grid-cols-2 bg-muted text-xs font-bold">
              <div className="border-r border-foreground/70 px-2 py-1.5 font-medium">
                DATE/TIME OUT:
              </div>
              <div className="px-2 py-1.5 font-medium">DATE/TIME IN:</div>
            </div>
            <div className="h-14 px-2 py-1 text-xs font-bold">
              USER SIGNATURE: (Print Name and Signature)
            </div>
            <div className="grid grid-cols-[30%_35%_35%] text-xs font-bold">
              <div className="border-r border-foreground/70 px-2 py-1.5 font-medium">
                ODOMETER READINGS:
              </div>
              <div className="border-r border-foreground/70 px-2 py-1.5 font-medium">START:</div>
              <div className="px-2 py-1.5 font-medium">END:</div>
            </div>
            <div>
              <p className="px-2 py-1 text-xs font-bold">DRIVER&apos;S REPORT:</p>
              {dp.driverReport && (
                <p className="px-2 pb-1 text-xs whitespace-pre-wrap">{dp.driverReport}</p>
              )}
              {[0, 1, 2, 3, 4].map((index) => (
                <div key={index} className="h-6 border-t border-foreground/50" />
              ))}
              <div className="grid grid-cols-2 border-t border-foreground/50">
                <div className="h-7 border-r border-foreground/70" />
                <p className="px-2 py-1 text-xs font-bold">Driver&apos;s Name:</p>
              </div>
            </div>
            <div className="bg-muted px-2 py-1 text-xs font-bold">
              NOTE: DATE/TIME IN/OUT to be filled by Guard on Duty
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
