import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowUpRight, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, PageHeader, Section } from "@/components/app/PageHeader";
import { LoadingPanel, ButtonLoading } from "@/components/app/LoadingPanel";
import { CoeStatusBadge } from "@/components/hrdo/CoeStatusBadge";
import { listMyCoeRequestsFn, submitCoeRequestFn } from "@/server-functions";
import { unwrap } from "@/lib/api";
import {
  COE_COPY_TYPES,
  COE_COPY_TYPE_HINTS,
  COE_COPY_TYPE_LABELS,
  type CoeCopyType,
} from "@/lib/hrdo";
import { fmtDateTime } from "@/lib/format";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/hrdo/coe")({
  beforeLoad: ({ context }) => {
    if (context.hrdoViewer?.role === "hrdo_staff") {
      throw redirect({ to: "/hrdo/requests" });
    }
  },
  head: () => ({
    meta: [
      { title: `COE Request — ${SITE.name}` },
      { name: "description", content: "Submit and track a Certificate of Employment request." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CoeRequestPage,
});

function CoeRequestPage() {
  const { hrdoViewer } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [purpose, setPurpose] = useState("");
  const [note, setNote] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [copyType, setCopyType] = useState<CoeCopyType>("original");
  const [showConfirm, setShowConfirm] = useState(false);

  const myRequests = useQuery({
    queryKey: ["coe", "mine"],
    queryFn: () => unwrap(listMyCoeRequestsFn()),
    staleTime: 10_000,
    enabled: Boolean(hrdoViewer),
  });

  const submit = useMutation({
    mutationFn: async () =>
      unwrap(submitCoeRequestFn({ data: { purpose, note, employeeNumber, copyType } })),
    onSuccess: async (created) => {
      setPurpose("");
      setNote("");
      setEmployeeNumber("");
      setCopyType("original");
      toast.success(
        "Request submitted successfully. Your COE request is now under review and will be processed within 3 working days. It is not automatically approved.",
        { duration: 6000 },
      );
      await queryClient.invalidateQueries({ queryKey: ["coe"] });
      await navigate({ to: "/hrdo/coe/$id", params: { id: created.id } });
    },
  });

  if (!hrdoViewer) return null;

  const recent = (myRequests.data ?? []).slice(0, 4);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (purpose.trim().length < 5) {
      toast.error("Describe the purpose of the request (at least 5 characters).");
      return;
    }
    if (employeeNumber.trim().length < 3) {
      toast.error("Enter your Employee ID (at least 3 characters).");
      return;
    }
    setShowConfirm(true);
  }

  function confirmSubmit() {
    setShowConfirm(false);
    submit.mutate();
  }

  return (
    <>
      <PageHeader
        title="Certificate of Employment"
        description="Request an employment certificate for employment, loan, scholarship, or other verification needs. Requests are not granted immediately — processing takes 3 working days."
        actions={
          <Button asChild variant="outline">
            <Link to="/hrdo/dashboard">Back to My COE Requests</Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Section title="Request COE">
          <form className="space-y-4" onSubmit={onSubmit} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="employee-name">Employee name</Label>
                <Input id="employee-name" className="mt-1" value={hrdoViewer.name} readOnly />
              </div>
              <div>
                <Label htmlFor="employee-email">Email address</Label>
                <Input id="employee-email" className="mt-1" value={hrdoViewer.email} readOnly />
              </div>
            </div>

            <div>
              <Label htmlFor="employee-number">Employee ID</Label>
              <Input
                id="employee-number"
                className="mt-1"
                value={employeeNumber}
                onChange={(event) => setEmployeeNumber(event.target.value)}
                placeholder="Your official employee number"
                maxLength={40}
                required
                aria-describedby="employee-number-help"
              />
              <p id="employee-number-help" className="mt-1 text-xs text-muted-foreground">
                HRDO verifies this against official HR records before processing.
              </p>
            </div>

            <div>
              <Label htmlFor="copy-type">Type of copy</Label>
              <Select value={copyType} onValueChange={(value) => setCopyType(value as CoeCopyType)}>
                <SelectTrigger id="copy-type" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COE_COPY_TYPES.map((key) => (
                    <SelectItem key={key} value={key}>
                      {COE_COPY_TYPE_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">{COE_COPY_TYPE_HINTS[copyType]}</p>
            </div>

            <div>
              <Label htmlFor="purpose">Purpose of request</Label>
              <Input
                id="purpose"
                className="mt-1"
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder="Example: Scholarship application / loan requirement / employment certification"
                maxLength={255}
                required
                aria-describedby="purpose-help"
              />
              <p id="purpose-help" className="mt-1 text-xs text-muted-foreground">
                Required. At least 5 characters, up to 255.
              </p>
            </div>

            <div>
              <Label htmlFor="note">Additional note (optional)</Label>
              <Textarea
                id="note"
                className="mt-1 min-h-28"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add any notes, preferred pickup date, or request details."
                maxLength={2000}
              />
            </div>

            {submit.isError && (
              <p
                role="alert"
                className="rounded-sm border border-destructive/30 bg-danger-soft p-3 text-sm"
              >
                {submit.error instanceof Error
                  ? submit.error.message
                  : "We couldn't submit your request. Please try again."}
              </p>
            )}

            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
              <span>
                <strong>Note:</strong> COE requests are <strong>not automatically granted</strong>. HRDO
                processes and reviews COE requests within <strong>3 working days</strong> from the date
                of submission. You can track every step on this page.
              </span>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={submit.isPending}>
                {submit.isPending ? <ButtonLoading label="Submitting…" /> : "Submit COE Request"}
              </Button>
            </div>
          </form>
        </Section>

        <Section
          title="My recent COE requests"
          actions={
            <Link to="/hrdo/dashboard" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          }
        >
          {myRequests.isPending ? (
            <LoadingPanel label="Loading your COE requests" rows={3} />
          ) : myRequests.isError ? (
            <p
              role="alert"
              className="rounded-sm border border-destructive/30 bg-danger-soft p-3 text-sm"
            >
              We couldn&apos;t load your COE requests. Open the dashboard to retry.
            </p>
          ) : !recent.length ? (
            <EmptyState title="No COE requests yet.">
              Submitted requests appear here and on your dashboard.
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {recent.map((item) => (
                <li key={item.id} className="rounded-md border bg-muted/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium" title={item.purpose}>
                        {item.purpose}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Requested {fmtDateTime(item.requestedAt)}
                      </p>
                    </div>
                    <CoeStatusBadge status={item.status} />
                  </div>
                  {item.note && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.note}</p>
                  )}
                  <Link
                    to="/hrdo/coe/$id"
                    params={{ id: item.id }}
                    className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    View details <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm COE Request Submission</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Are you sure you want to submit this Certificate of Employment request?</p>
              <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">
                <strong>Reminder:</strong> This request is <strong>not automatically granted</strong>.
                HRDO will review and process it within <strong>3 working days</strong> from submission.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submit.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSubmit} disabled={submit.isPending}>
              {submit.isPending ? <ButtonLoading label="Submitting…" /> : "Yes, Submit Request"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
