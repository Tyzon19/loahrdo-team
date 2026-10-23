import { useEffect, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { RequestInput } from "@/lib/types";
import { validateRequestInput } from "@/lib/workflow";
import { fmtDate, fmtRange, fmtTime, todayISO } from "@/lib/format";
import { Section } from "./PageHeader";

function Req() { return <span className="text-destructive" aria-hidden> *</span>; }

export function RequestForm({
  initial, header, submitLabel, onSubmit,
}: {
  initial: RequestInput;
  header: { number: string; date: string; requisitioner: string };
  submitLabel: string;
  onSubmit: (v: RequestInput) => Promise<void> | void;
}) {
  const [v, setV] = useState<RequestInput>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof RequestInput, string>>>({});
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const blocker = useBlocker({ shouldBlockFn: () => dirty && !done, withResolver: true, enableBeforeUnload: () => dirty && !done });

  useEffect(() => { if (Object.keys(errors).length) setErrors(validateRequestInput(v, todayISO())); }, [v]);

  const set = <K extends keyof RequestInput>(k: K, val: RequestInput[K]) => setV((x) => ({ ...x, [k]: val }));
  const err = (k: keyof RequestInput) => errors[k] && <p id={`${k}-err`} className="mt-1 text-sm text-destructive">{errors[k]}</p>;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const ee = validateRequestInput(v, todayISO());
        setErrors(ee);
        if (Object.keys(ee).length) { document.getElementById(Object.keys(ee)[0]!)?.focus(); return; }
        setSubmitError(null);
        setReview(true);
      }}
      className="space-y-4"
    >
      <Section title="Request details">
        <dl className="mb-4 grid grid-cols-1 gap-3 rounded-sm bg-muted p-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Request Number</dt><dd className="font-medium">{header.number}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Date</dt><dd>{fmtDate(header.date)}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Requisitioner</dt><dd className="font-medium">{header.requisitioner} (signed-in account)</dd></div>
        </dl>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="department">Department or Office<Req /></Label>
            <Input id="department" className="mt-1" value={v.department} onChange={(e) => set("department", e.target.value)} aria-invalid={!!errors.department} aria-describedby="department-err" />
            {err("department")}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="destinations">Destination<Req /></Label>
            <div className="mt-1 space-y-2">
              {v.destinations.map((d, i) => (
                <div key={i} className="flex gap-2">
                  <Input id={i === 0 ? "destinations" : undefined} aria-label={`Destination ${i + 1}`} value={d} onChange={(e) => set("destinations", v.destinations.map((x, j) => (j === i ? e.target.value : x)))} aria-invalid={!!errors.destinations} />
                  {v.destinations.length > 1 && <Button type="button" variant="ghost" size="icon" aria-label={`Remove destination ${i + 1}`} onClick={() => set("destinations", v.destinations.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>}
                </div>
              ))}
              <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => set("destinations", [...v.destinations, ""])}><Plus className="h-4 w-4" /> Add another destination</Button>
            </div>
            {err("destinations")}
          </div>
          <div>
            <Label htmlFor="passengers">Number of Passengers<Req /></Label>
            <Input id="passengers" type="number" min={1} inputMode="numeric" className="mt-1" value={Number.isNaN(v.passengers) ? "" : v.passengers} onChange={(e) => set("passengers", e.target.value === "" ? NaN : Number(e.target.value))} aria-invalid={!!errors.passengers} />
            {err("passengers")}
          </div>
          <div>
            <Label htmlFor="timeNeeded">Time Needed<Req /></Label>
            <Input id="timeNeeded" type="time" className="mt-1" value={v.timeNeeded} onChange={(e) => set("timeNeeded", e.target.value)} aria-invalid={!!errors.timeNeeded} />
            {err("timeNeeded")}
          </div>
          <div>
            <Label htmlFor="dateStart">Date Needed — Start<Req /></Label>
            <Input id="dateStart" type="date" min={todayISO()} className="mt-1" value={v.dateStart} onChange={(e) => { const val = e.target.value; setV((x) => ({ ...x, dateStart: val, dateEnd: !x.dateEnd || x.dateEnd < val ? val : x.dateEnd })); }} aria-invalid={!!errors.dateStart} />
            {err("dateStart")}
          </div>
          <div>
            <Label htmlFor="dateEnd">Date Needed — End<Req /></Label>
            <Input id="dateEnd" type="date" min={v.dateStart || todayISO()} className="mt-1" value={v.dateEnd} onChange={(e) => set("dateEnd", e.target.value)} aria-invalid={!!errors.dateEnd} />
            {err("dateEnd")}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="purpose">Purpose of Travel<Req /></Label>
            <Textarea id="purpose" rows={4} className="mt-1" value={v.purpose} onChange={(e) => set("purpose", e.target.value)} aria-invalid={!!errors.purpose} />
            {err("purpose")}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground"><span className="text-destructive">*</span> Required. Vehicle type and plate number are assigned by Transport Services.</p>
      </Section>
      <div className="flex justify-end gap-2">
        <Button type="submit">Review before submitting</Button>
      </div>

      <AlertDialog open={review} onOpenChange={setReview}>
        <AlertDialogContent className="max-h-[92vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm your request</AlertDialogTitle>
            <AlertDialogDescription>Please check the details. After submitting, the request goes to the Head of Transport Services for review.</AlertDialogDescription>
          </AlertDialogHeader>
          {submitError && (
            <p role="alert" className="rounded-sm border border-destructive/40 bg-danger-soft p-2 text-sm text-destructive">
              {submitError}
            </p>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Requisitioner</dt><dd>{header.requisitioner}</dd>
            <dt className="text-muted-foreground">Department</dt><dd>{v.department}</dd>
            <dt className="text-muted-foreground">Destination</dt><dd>{v.destinations.filter((d) => d.trim()).join("; ")}</dd>
            <dt className="text-muted-foreground">Passengers</dt><dd>{v.passengers}</dd>
            <dt className="text-muted-foreground">Date Needed</dt><dd>{fmtRange(v.dateStart, v.dateEnd)}</dd>
            <dt className="text-muted-foreground">Time Needed</dt><dd>{fmtTime(v.timeNeeded)}</dd>
            <dt className="text-muted-foreground">Purpose</dt><dd className="whitespace-pre-wrap">{v.purpose}</dd>
          </dl>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Go back and edit</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                if (busy) return;
                setBusy(true);
                setDone(true);
                setReview(false);
                setSubmitError(null);
                void Promise.resolve(onSubmit(v))
                  .catch((error: unknown) => {
                    setSubmitError(error instanceof Error ? error.message : "The request could not be submitted. Please try again.");
                    setDone(false);
                    setReview(true);
                  })
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? "Submitting…" : submitLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={blocker.status === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>You have information in this form that has not been submitted. If you leave, it will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Stay on this page</AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()}>Discard and leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
