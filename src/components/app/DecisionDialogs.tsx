import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SignaturePad, type SignatureValue } from "./SignaturePad";
import type { User, VehicleRequest } from "@/lib/types";
import { ROLE_TITLES } from "@/lib/workflow";
import { fmtRange, fmtTime } from "@/lib/format";
import { LoadingScreen } from "@/components/app/LoadingPanel";
export function ApproveDialog({
  open, onOpenChange, request, user, proxySigner, assistantName,
  stageLabel, actionLabel, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  request: VehicleRequest;
  user: User;
  proxySigner: boolean;
  assistantName?: string | undefined;
  stageLabel: string;
  actionLabel: string;
  onConfirm: (sig: SignatureValue) => Promise<void> | void;
}) {
  const [sig, setSig] = useState<SignatureValue | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = !!sig && agree && !busy;
  return (
    <>
    {busy && <LoadingScreen label="Saving approval" mode="overlay" />}
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) { setSig(null); setAgree(false); } } }}>
      <DialogContent className="w-[calc(100vw-1rem)] max-h-[92dvh] overflow-x-hidden overflow-y-auto p-4 sm:w-full sm:max-w-lg sm:p-6">
        <DialogHeader>
          <DialogTitle>{actionLabel}</DialogTitle>
          <DialogDescription>Stage: <strong>{stageLabel}</strong></DialogDescription>
        </DialogHeader>
        <dl className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-1 rounded-sm border bg-muted p-3 text-sm sm:gap-x-4">
          <dt className="min-w-0 text-muted-foreground">Request</dt><dd className="min-w-0 break-words [overflow-wrap:anywhere] font-medium">{request.number}</dd>
          <dt className="min-w-0 text-muted-foreground">Requestor</dt><dd className="min-w-0 break-words [overflow-wrap:anywhere]">{request.requisitionerName}</dd>
          <dt className="min-w-0 text-muted-foreground">Destination</dt><dd className="min-w-0 break-words [overflow-wrap:anywhere]">{request.destinations.join("; ")}</dd>
          <dt className="min-w-0 text-muted-foreground">Date / Time</dt><dd className="min-w-0 break-words [overflow-wrap:anywhere]">{fmtRange(request.dateStart, request.dateEnd)}, {fmtTime(request.timeNeeded)}</dd>
        </dl>
        {proxySigner && (
          <p className="rounded-sm border border-primary/30 bg-info-soft p-3 text-sm">
            You are signing as the assigned alternate for the {stageLabel.split(" — ")[1]}. Your
            own account name, signature, and signing time will be recorded.
          </p>
        )}
        {!proxySigner && assistantName && (
          <p className="rounded-sm border p-3 text-sm">
            <strong>Assigned alternate:</strong> {assistantName}. If you are unavailable, this
            person must sign in with their own account and sign this request as the alternate.
            This dialog records only your own signature.
          </p>
        )}
        <div>
          <p className="mb-1 text-sm font-medium">
            {proxySigner ? `${user.name}'s alternate signature` : "Your signature"}
          </p>
          <SignaturePad onChange={setSig} />
          <p className="mt-2 text-sm">
            {proxySigner ? (
              <>Signing as <strong>{user.name}</strong>, assigned alternate</>
            ) : (
              <>Signing as <strong>{user.name}</strong>, {ROLE_TITLES[user.role]}</>
            )}
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Checkbox id="agree" checked={agree} onCheckedChange={(value) => setAgree(value === true)} />
          <Label htmlFor="agree" className="text-sm font-normal leading-snug">
            I have reviewed this request and confirm this decision.
          </Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button disabled={!ready} onClick={async () => { if (!sig) return; setBusy(true); try { await onConfirm(sig); } finally { setBusy(false); } }}>
            {busy ? "Saving…" : "Confirm & Sign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
export function RejectDialog({
  open, onOpenChange, onConfirm, stageTitle, proxySigner = false,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (reason: string) => Promise<void> | void;
  stageTitle: string;
  proxySigner?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) { setReason(""); setErr(null); } } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reject &amp; Return to Requestor</DialogTitle>
          <DialogDescription>The request will stop here and go back to the requestor for revision. It will not move to the next approver.</DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="reason">Reason for returning <span className="text-destructive">*</span></Label>
          <Textarea id="reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" placeholder="Explain what the requestor should change." aria-invalid={!!err} />
          {err && <p className="mt-1 text-sm text-destructive">{err}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {proxySigner
              ? `Recorded as returned by you, the assigned alternate for the ${stageTitle}.`
              : `Recorded as returned by the ${stageTitle}.`}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" disabled={busy} onClick={async () => {
            if (reason.trim().length < 5) { setErr("Please give a reason (at least 5 characters)."); return; }
            setBusy(true);
            try {
              await onConfirm(reason);
            } finally {
              setBusy(false);
            }
          }}>
            {busy ? "Returning…" : "Return Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
