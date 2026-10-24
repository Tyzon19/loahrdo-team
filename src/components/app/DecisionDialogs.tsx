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
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) { setSig(null); setAgree(false); } } }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{actionLabel}</DialogTitle>
          <DialogDescription>Stage: <strong>{stageLabel}</strong></DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-sm border bg-muted p-3 text-sm">
          <dt className="text-muted-foreground">Request</dt><dd className="font-medium">{request.number}</dd>
          <dt className="text-muted-foreground">Requisitioner</dt><dd>{request.requisitionerName}</dd>
          <dt className="text-muted-foreground">Destination</dt><dd>{request.destinations.join("; ")}</dd>
          <dt className="text-muted-foreground">Date / Time</dt><dd>{fmtRange(request.dateStart, request.dateEnd)}, {fmtTime(request.timeNeeded)}</dd>
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
            {busy ? "Saving…" : `Confirm & Sign`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
export function RejectDialog({
  open, onOpenChange, onConfirm, stageTitle,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (reason: string) => void;
  stageTitle: string;
}) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setReason(""); setErr(null); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reject &amp; Return to Requisitioner</DialogTitle>
          <DialogDescription>The request will stop here and go back to the requisitioner for revision. It will not move to the next approver.</DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="reason">Reason for returning <span className="text-destructive">*</span></Label>
          <Textarea id="reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" placeholder="Explain what the requisitioner should change." aria-invalid={!!err} />
          {err && <p className="mt-1 text-sm text-destructive">{err}</p>}
          <p className="mt-1 text-xs text-muted-foreground">Recorded as returned by the {stageTitle}.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => { if (reason.trim().length < 5) { setErr("Please give a reason (at least 5 characters)."); return; } onConfirm(reason); }}>
            Return Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}