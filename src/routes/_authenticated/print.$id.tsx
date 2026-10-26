import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Send } from "lucide-react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ButtonLoading, LoadingPanel, LoadingScreen } from "@/components/app/LoadingPanel";
import {
  getPrintableRequestFn,
  markApprovalNoticeReadFn,
  officialTripTicketImageFn,
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
  const [downloading, setDownloading] = useState(false);
  const [ticketSent, setTicketSent] = useState(false);
  const [testEmailSent, setTestEmailSent] = useState(false);
  const officialTicket = useQuery({
    queryKey: ["official-trip-ticket", id],
    queryFn: () => unwrap(officialTripTicketImageFn({ data: id })),
    enabled: viewer?.role === "requisitioner",
  });
  const query = useQuery({
    queryKey: ["request", id],
    queryFn: () => unwrap(getPrintableRequestFn({ data: id })),
    enabled: !!viewer && viewer.role !== "requisitioner",
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
    if (viewer?.role !== "requisitioner" || !officialTicket.data) return;
    void (async () => {
      try {
        await unwrap(markApprovalNoticeReadFn({ data: id }));
        await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      } catch {
        toast.error("We couldn't update your approval notice. Please try again.");
      }
    })();
  }, [id, officialTicket.data, queryClient, viewer?.role]);

  if (viewer?.role === "requisitioner") {
    if (officialTicket.isPending) {
      return (
        <div className="mx-auto max-w-[210mm] p-4">
          <LoadingPanel label="Loading official trip ticket" rows={10} />
        </div>
      );
    }
    if (officialTicket.isError) {
      return (
        <div className="mx-auto max-w-[210mm] p-8" role="alert">
          <p>We couldn&apos;t load your official trip ticket.</p>
          <Button className="mt-3" variant="outline" onClick={() => void officialTicket.refetch()}>
            Try again
          </Button>
        </div>
      );
    }
    if (!officialTicket.data) {
      return (
        <div className="mx-auto max-w-[210mm] p-8">
          <p role="status">
            The official ticket image is not available yet. Please contact the office that approved
            your request.
          </p>
          <Link
            to="/requests/$id"
            params={{ id }}
            className="mt-3 inline-block text-primary underline"
          >
            Back to request
          </Link>
        </div>
      );
    }

    return (
      <div className="official-ticket-view print-sheet min-h-screen bg-background py-6">
        <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center px-4">
          <div className="flex w-full items-center justify-between">
            <Button asChild variant="ghost">
              <Link to="/requests/$id" params={{ id }}>
                <ArrowLeft className="h-4 w-4" aria-hidden /> Back to request
              </Link>
            </Button>
            <Button asChild>
              <a href={officialTicket.data} download={`${id}-trip-ticket.png`}>
                <Download className="h-4 w-4" aria-hidden /> Download ticket
              </a>
            </Button>
          </div>
        </div>
        <p className="no-print mx-auto mb-3 max-w-[210mm] px-4 text-xs text-muted-foreground">
          Download the official ticket snapshot attached to your approval notice for your digital
          records.
        </p>
        <img
          src={officialTicket.data}
          alt="Official approved trip ticket"
          className="official-ticket-image mx-auto block w-full max-w-[148.5mm] select-none bg-white shadow-sm"
          draggable={false}
        />
      </div>
    );
  }

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
  const approved = ["approved", "dispatched", "completed"].includes(r.status);
  const ticketAlreadySent = ticketSent || detail.tripTicketAttached;
  const sigs = currentSignatures(r);
  const dp = r.dispatch;

  async function captureTicketImage() {
    const node = sheetRef.current;
    if (!node) throw new Error("Ticket preview is not ready.");
    return toPng(node, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      cacheBust: true,
      skipFonts: true,
    });
  }

  async function downloadTicket() {
    setDownloading(true);
    try {
      const image = await captureTicketImage();
      const link = document.createElement("a");
      link.href = image;
      link.download = `${r.number.replace(/[^a-zA-Z0-9-_]/g, "_")}-trip-ticket.png`;
      link.click();
      toast.success("Trip ticket downloaded.");
    } catch {
      toast.error("We couldn't download the trip ticket. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  async function sendToRequisitioner() {
    setSending(true);
    try {
      // Capture the ticket exactly as it renders (2x for a sharp photo).
      const image = await captureTicketImage();
      const result = await sendTripTicketFn({ data: { id: r.id, image } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setTicketSent(true);
      if (result.data.testEmail?.sent) {
        setTestEmailSent(true);
        toast.success("Trip ticket test email sent only to mj.turingan@lyceumalabang.edu.ph.");
      } else if (result.data.testEmail) {
        toast.error(
          `The ticket is saved in the requisitioner's in-app notification, but the test email was not sent: ${result.data.testEmail.message}`,
        );
      } else {
        toast.success(
          result.data.alreadySent
            ? "The trip ticket is attached to the requisitioner's in-app notification."
            : "Trip ticket attached to the requisitioner's in-app notification.",
        );
      }
    } catch {
      toast.error("We couldn't create the trip ticket photo. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {sending && <LoadingScreen label="Sending trip ticket" mode="overlay" />}
      <div className="print-sheet min-h-screen bg-background py-6 print:min-h-0 print:bg-white print:py-0">
        <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4">
          <Button asChild variant="ghost">
            <Link to="/requests/$id" params={{ id: r.id }}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back to request
            </Link>
          </Button>
          <div className="flex gap-2">
            {approved && (
              <Button
                variant="outline"
                onClick={() => void downloadTicket()}
                disabled={downloading}
              >
                <Download className="h-4 w-4" aria-hidden />
                {downloading ? <ButtonLoading label="Preparing…" /> : "Download ticket"}
              </Button>
            )}
            <Button
              onClick={() => void sendToRequisitioner()}
              disabled={!approved || sending || testEmailSent}
            >
              <Send className="h-4 w-4" aria-hidden />
              {sending
                ? "Sending…"
                : testEmailSent
                  ? "Trip Ticket Sent"
                  : import.meta.env.DEV
                    ? ticketAlreadySent
                      ? "Resend Trip Ticket"
                      : "Send Trip Ticket"
                    : ticketAlreadySent
                      ? "Trip Ticket Sent"
                      : "Send Trip Ticket"}
            </Button>
          </div>
        </div>
        {approved && (
          <p className="no-print mx-auto mb-3 max-w-[210mm] px-4 text-xs text-muted-foreground">
            Download a digital copy or attach it to the requisitioner&apos;s in-app notification.
            {import.meta.env.DEV &&
              " Local test email delivery is restricted to mj.turingan@lyceumalabang.edu.ph."}
          </p>
        )}
        {!approved && (
          <p className="no-print mx-auto mb-3 max-w-[210mm] px-4 text-sm text-destructive">
            This request has not received final approval. The trip ticket can be downloaded after
            the President approves it.
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
                    className={`grid ${
                      signature?.proxySignerName ? "grid-cols-2" : "grid-cols-1"
                    } px-2 pb-1`}
                  >
                    <div
                      className={`flex min-w-0 flex-col items-center ${
                        signature?.proxySignerName ? "border-r border-foreground/40 px-1" : ""
                      }`}
                    >
                      <div className="flex h-12 max-w-full items-end justify-center overflow-hidden">
                        {signature && !signature.proxySignerName && (
                          <SignatureMark
                            image={signature.image}
                            method={signature.method}
                            name={signature.signerName}
                            protectedDisplay={false}
                          />
                        )}
                      </div>
                      <div
                        className="m-0 w-full text-center text-xs font-bold"
                        style={{ lineHeight: 1.35, overflowWrap: "anywhere" }}
                      >
                        {name}
                      </div>
                      <div
                        className="m-0 w-full text-center text-xs"
                        style={{ lineHeight: 1.35, overflowWrap: "anywhere" }}
                      >
                        {title}
                      </div>
                      {signature && !signature.proxySignerName && (
                        <div
                          className="m-0 w-full text-center text-[9px] text-muted-foreground"
                          style={{ lineHeight: 1.35, overflowWrap: "anywhere" }}
                        >
                          Signed {fmtDateTime(signature.at)}
                        </div>
                      )}
                      {!signature && detail.assistantNames[st.key] && (
                        <div
                          className="m-0 w-full text-center text-[10px]"
                          style={{ lineHeight: 1.35, overflowWrap: "anywhere" }}
                        >
                          Alternate signatory: {detail.assistantNames[st.key]}
                        </div>
                      )}
                    </div>
                    {signature?.proxySignerName && (
                      <div className="flex min-w-0 flex-col items-center border-l border-foreground/40 px-1">
                        <div className="flex h-12 max-w-full items-end justify-center overflow-hidden">
                          <SignatureMark
                            image={signature.image}
                            method={signature.method}
                            name={signature.proxySignerName}
                            protectedDisplay={false}
                          />
                        </div>
                        <div
                          className="m-0 w-full text-center text-xs font-bold"
                          style={{ lineHeight: 1.35, overflowWrap: "anywhere" }}
                        >
                          {signature.proxySignerName}
                        </div>
                        <div
                          className="m-0 w-full text-center text-[10px]"
                          style={{ lineHeight: 1.35, overflowWrap: "anywhere" }}
                        >
                          Alternate Signatory
                        </div>
                        <div
                          className="m-0 w-full text-center text-[9px] text-muted-foreground"
                          style={{ lineHeight: 1.35, overflowWrap: "anywhere" }}
                        >
                          Signed {fmtDateTime(signature.at)}
                        </div>
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
    </>
  );
}
