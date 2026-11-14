import { useState, type FormEvent } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Eye, FileDown, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState, PageHeader } from "@/components/app/PageHeader";
import { PermissionSlipReceipt } from "@/components/app/PermissionSlipReceipt";
import { canAccessAdminPortal } from "@/lib/access";
import {
  ADMIN_RECEIPT_SYSTEMS,
  ADMIN_RECEIPT_SYSTEM_LABELS,
  type AdminReceiptPreview,
  type AdminReceiptRecord,
  type AdminReceiptSystem,
  type AdminReceiptSystemFilter,
} from "@/lib/admin-receipts";
import { unwrap } from "@/lib/api";
import { getAdminReceiptPreviewFn, listAdminReceiptsFn } from "@/server-functions";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/receipts")({
  beforeLoad: ({ context }) => {
    if (
      !context.viewer ||
      !canAccessAdminPortal(context.viewer.role, context.viewer.isSuperAdmin)
    ) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: `Receipts Archive | ${SITE.name}` },
      {
        name: "description",
        content: "View finalized receipts from the available LOA systems.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminReceipts,
});

type ReceiptFilters = {
  system: AdminReceiptSystemFilter;
  dateFrom?: string;
  dateTo?: string;
};

function isSystemFilter(value: string): value is AdminReceiptSystemFilter {
  return value === "all" || ADMIN_RECEIPT_SYSTEMS.some((system) => system === value);
}

function systemLabel(system: AdminReceiptSystem) {
  return ADMIN_RECEIPT_SYSTEM_LABELS[system];
}

function formatReceiptDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function receiptDataUrl(preview: Extract<AdminReceiptPreview, { base64: string }>) {
  return `data:${preview.mime};base64,${preview.base64}`;
}

function AdminReceipts() {
  const { viewer } = Route.useRouteContext();
  const [system, setSystem] = useState<AdminReceiptSystemFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dateError, setDateError] = useState("");
  const [filters, setFilters] = useState<ReceiptFilters>({ system: "all" });
  const [page, setPage] = useState(0);
  const [selectedReceipt, setSelectedReceipt] = useState<AdminReceiptRecord | null>(null);

  const queryInput = { ...filters, page };
  const archive = useQuery({
    queryKey: ["admin-receipts", queryInput],
    queryFn: () => unwrap(listAdminReceiptsFn({ data: queryInput })),
    enabled: Boolean(viewer),
  });
  const preview = useQuery({
    queryKey: ["admin-receipt-preview", selectedReceipt?.system, selectedReceipt?.id],
    queryFn: () => {
      if (!selectedReceipt) throw new Error("Select a receipt to preview.");
      return unwrap(
        getAdminReceiptPreviewFn({
          data: { system: selectedReceipt.system, id: selectedReceipt.id },
        }),
      );
    },
    enabled: Boolean(selectedReceipt),
  });

  if (!viewer) return null;

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setDateError("The start date must be on or before the end date.");
      return;
    }
    setDateError("");
    setPage(0);
    setFilters({
      system,
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    });
  }

  function clearFilters() {
    setSystem("all");
    setDateFrom("");
    setDateTo("");
    setDateError("");
    setFilters({ system: "all" });
    setPage(0);
  }

  const data = archive.data;

  return (
    <>
      <PageHeader
        title="Receipts Archive"
        description="Final trip tickets, COE documents, and approved Permission Slips."
      />

      <Card className="min-w-0 overflow-hidden">
        <CardContent className="p-0">
          <form
            onSubmit={applyFilters}
            className="grid gap-3 border-b p-4 sm:grid-cols-2 sm:items-end lg:grid-cols-[minmax(12rem,1.3fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_auto_auto]"
          >
            <div className="min-w-0">
              <label htmlFor="receipt-system" className="text-sm font-medium">
                System
              </label>
              <select
                id="receipt-system"
                value={system}
                onChange={(event) => {
                  if (isSystemFilter(event.currentTarget.value)) {
                    setSystem(event.currentTarget.value);
                  }
                }}
                className="mt-1.5 min-h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
              >
                <option value="all">All systems</option>
                {ADMIN_RECEIPT_SYSTEMS.map((value) => (
                  <option key={value} value={value}>
                    {systemLabel(value)}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor="receipt-date-from" className="text-sm font-medium">
                From
              </label>
              <input
                id="receipt-date-from"
                type="date"
                value={dateFrom}
                aria-invalid={Boolean(dateError)}
                aria-describedby={dateError ? "receipt-date-error" : undefined}
                onChange={(event) => setDateFrom(event.currentTarget.value)}
                className="mt-1.5 min-h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
              />
            </div>
            <div className="min-w-0">
              <label htmlFor="receipt-date-to" className="text-sm font-medium">
                To
              </label>
              <input
                id="receipt-date-to"
                type="date"
                value={dateTo}
                aria-invalid={Boolean(dateError)}
                aria-describedby={dateError ? "receipt-date-error" : undefined}
                onChange={(event) => setDateTo(event.currentTarget.value)}
                className="mt-1.5 min-h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
              />
            </div>
            <Button type="submit" className="min-h-11">
              <CalendarDays className="h-4 w-4" aria-hidden />
              Apply filters
            </Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={clearFilters}>
              Clear
            </Button>
            {dateError && (
              <p
                id="receipt-date-error"
                className="text-sm text-destructive sm:col-span-2 lg:col-span-full"
                role="alert"
              >
                {dateError}
              </p>
            )}
          </form>

          {archive.isError ? (
            <Alert variant="destructive" className="m-4 w-auto">
              <AlertTitle>Receipts could not be loaded</AlertTitle>
              <AlertDescription>
                {archive.error instanceof Error ? archive.error.message : "Please try again."}
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 min-h-11"
                  disabled={archive.isFetching}
                  onClick={() => void archive.refetch()}
                >
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : archive.isPending ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              Loading receipts…
            </div>
          ) : data?.items.length ? (
            <>
              <ul className="divide-y" aria-label="Receipts">
                {data.items.map((receipt) => (
                  <li key={`${receipt.system}-${receipt.id}`}>
                    <button
                      type="button"
                      onClick={() => setSelectedReceipt(receipt)}
                      className="flex min-h-[76px] w-full flex-col items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between sm:px-5"
                      aria-label={`Preview ${systemLabel(receipt.system)} for ${receipt.personName}`}
                    >
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{receipt.reference}</span>
                          <Badge variant="outline">{systemLabel(receipt.system)}</Badge>
                        </span>
                        <span className="mt-1 block break-words text-sm text-muted-foreground">
                          {receipt.personName}
                          {receipt.department ? ` · ${receipt.department}` : ""}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {formatReceiptDate(receipt.receiptAt)}
                          {receipt.status ? ` · ${receipt.status.replaceAll("_", " ")}` : ""}
                        </span>
                      </span>
                      <span className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary">
                        <Eye className="h-4 w-4" aria-hidden />
                        Preview
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  Page {page + 1} · {data.items.length} receipt{data.items.length === 1 ? "" : "s"}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={page === 0 || archive.isFetching}
                    onClick={() => setPage((current) => Math.max(0, current - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={!data.hasMore || archive.isFetching}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState title="No receipts found">Try a different system or date range.</EmptyState>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedReceipt)}
        onOpenChange={(open) => {
          if (!open) setSelectedReceipt(null);
        }}
      >
        <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] max-w-5xl overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="pr-8">
            <DialogTitle>
              {selectedReceipt
                ? `${systemLabel(selectedReceipt.system)} · ${selectedReceipt.reference}`
                : "Receipt preview"}
            </DialogTitle>
            <DialogDescription>
              {selectedReceipt?.personName}
              {selectedReceipt?.department ? ` · ${selectedReceipt.department}` : ""}
            </DialogDescription>
          </DialogHeader>

          {preview.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Receipt could not be opened</AlertTitle>
              <AlertDescription>
                {preview.error instanceof Error ? preview.error.message : "Please try again."}
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 min-h-11"
                  disabled={preview.isFetching}
                  onClick={() => void preview.refetch()}
                >
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : preview.isPending ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              Loading preview…
            </div>
          ) : preview.data ? (
            <ReceiptPreview preview={preview.data} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReceiptPreview({ preview }: { preview: AdminReceiptPreview }) {
  if (preview.system === "permission_slip") {
    return <PermissionSlipReceipt slip={preview.slip} />;
  }

  const dataUrl = receiptDataUrl(preview);
  if (preview.mime === "application/pdf") {
    return (
      <div className="space-y-3">
        <iframe
          title={preview.fileName}
          src={dataUrl}
          className="h-[65vh] min-h-72 w-full rounded-md border"
        />
        <Button asChild variant="outline" className="min-h-11">
          <a href={dataUrl} download={preview.fileName}>
            <FileDown className="h-4 w-4" aria-hidden />
            Download PDF
          </a>
        </Button>
      </div>
    );
  }

  if (preview.mime === "image/png" || preview.mime === "image/jpeg") {
    return (
      <img
        src={dataUrl}
        alt={`${preview.fileName} receipt`}
        className="mx-auto max-h-[70vh] max-w-full rounded-md object-contain"
      />
    );
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm text-muted-foreground">
        This Word document cannot be previewed in the browser.
      </p>
      <Button asChild className="min-h-11">
        <a href={dataUrl} download={preview.fileName}>
          <FileDown className="h-4 w-4" aria-hidden />
          Download document
        </a>
      </Button>
    </div>
  );
}
