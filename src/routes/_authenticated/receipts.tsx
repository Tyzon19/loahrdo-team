import { useRef, useState, type FormEvent } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  CarFront,
  ClipboardCheck,
  FileBadge,
  FolderArchive,
  FileDown,
  Download,
  Grid2X2,
  LoaderCircle,
  List,
  Search,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import {
  bulkDownloadAdminReceiptsFn,
  getAdminReceiptPreviewFn,
  listAdminReceiptsFn,
  persistPermissionSlipReceiptFn,
} from "@/server-functions";
import { toPng } from "html-to-image";
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
  q?: string;
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

function ReceiptTotalCard({
  system,
  label,
  count,
  icon: Icon,
  iconClass,
  active,
  onClick,
}: {
  system: AdminReceiptSystemFilter;
  label: string;
  count: number;
  icon: LucideIcon;
  iconClass: string;
  active: boolean;
  onClick: (system: AdminReceiptSystemFilter) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(system)}
      aria-pressed={active}
      className={`flex min-h-24 items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active ? "border-primary/50 ring-1 ring-primary/10" : ""
      }`}
    >
      <Avatar className="h-11 w-11 border bg-muted/40">
        <AvatarFallback className={`bg-transparent ${iconClass}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="block text-2xl font-bold leading-none">{count}</span>
        <span className="mt-2 block truncate text-sm text-muted-foreground">{label}</span>
      </span>
    </button>
  );
}

function AdminReceipts() {
  const { viewer } = Route.useRouteContext();
  const [system, setSystem] = useState<AdminReceiptSystemFilter>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dateError, setDateError] = useState("");
  const [filters, setFilters] = useState<ReceiptFilters>({ system: "all" });
  const [page, setPage] = useState(0);
  const [view, setView] = useState<"list" | "grid">("list");
  const [selectedReceipts, setSelectedReceipts] = useState<
    Array<{ system: AdminReceiptSystem; id: string }>
  >([]);
  const [downloading, setDownloading] = useState(false);
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
    setSelectedReceipts([]);
    setFilters({
      system,
      ...(search.trim() ? { q: search.trim() } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    });
  }

  function clearFilters() {
    setSystem("all");
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setDateError("");
    setFilters({ system: "all" });
    setPage(0);
    setSelectedReceipts([]);
  }

  function receiptKey(receipt: AdminReceiptRecord) {
    return `${receipt.system}:${receipt.id}`;
  }

  function toggleReceipt(receipt: AdminReceiptRecord, checked: boolean) {
    setSelectedReceipts((current) =>
      checked
        ? [
            ...current.filter(
              (item) => !(item.system === receipt.system && item.id === receipt.id),
            ),
            {
              system: receipt.system,
              id: receipt.id,
            },
          ]
        : current.filter((item) => !(item.system === receipt.system && item.id === receipt.id)),
    );
  }

  async function downloadSelected() {
    if (!selectedReceipts.length || downloading) return;
    setDownloading(true);
    try {
      const result = await unwrap(
        bulkDownloadAdminReceiptsFn({ data: { receipts: selectedReceipts } }),
      );
      const bytes = Uint8Array.from(atob(result.base64), (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(`${selectedReceipts.length} receipt(s) downloaded.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The receipts could not be downloaded.");
    } finally {
      setDownloading(false);
    }
  }

  const data = archive.data;

  return (
    <>
      <PageHeader
        title="Receipts Archive"
        description="Final trip tickets, COE documents, and approved Permission Slips."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Receipt totals">
        {(
          [
            ["all", "All Receipts", FolderArchive, "text-blue-600"],
            ["vehicle_trip_ticket", "Vehicle Trip Tickets", CarFront, "text-sky-600"],
            ["coe", "Certificates of Employment", FileBadge, "text-amber-600"],
            ["permission_slip", "Permission Slips", ClipboardCheck, "text-violet-600"],
          ] as const
        ).map(([countSystem, label, Icon, iconClass]) => (
          <ReceiptTotalCard
            key={countSystem}
            system={countSystem}
            label={label}
            count={data?.counts[countSystem] ?? 0}
            icon={Icon}
            iconClass={iconClass}
            active={system === countSystem}
            onClick={(selectedSystem) => {
              setSystem(selectedSystem);
              setPage(0);
              setFilters({
                system: selectedSystem,
                ...(search.trim() ? { q: search.trim() } : {}),
                ...(dateFrom ? { dateFrom } : {}),
                ...(dateTo ? { dateTo } : {}),
              });
            }}
          />
        ))}
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardContent className="p-0">
          <form
            onSubmit={applyFilters}
            className="grid gap-3 border-b p-4 sm:grid-cols-2 sm:items-end lg:grid-cols-[minmax(13rem,1.3fr)_minmax(12rem,1.3fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_auto_auto]"
          >
            <div className="min-w-0">
              <label htmlFor="receipt-search" className="text-sm font-medium">
                Search by name
              </label>
              <div className="relative mt-1.5">
                <Search
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  id="receipt-search"
                  type="search"
                  maxLength={100}
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  placeholder="Employee or requester name"
                  className="min-h-11 w-full rounded-md border border-input bg-background pl-9 pr-3 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
                />
              </div>
            </div>
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
              <div className="flex items-center justify-between border-b px-4 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Checkbox
                    checked={
                      data.items.length > 0 &&
                      data.items.every((receipt) =>
                        selectedReceipts.some(
                          (item) => item.system === receipt.system && item.id === receipt.id,
                        ),
                      )
                    }
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedReceipts((current) => {
                          const combined = new Map(
                            current.map((item) => [`${item.system}:${item.id}`, item]),
                          );
                          for (const receipt of data.items) {
                            combined.set(receiptKey(receipt), {
                              system: receipt.system,
                              id: receipt.id,
                            });
                          }
                          return [...combined.values()];
                        });
                      } else {
                        setSelectedReceipts((current) =>
                          current.filter(
                            (item) =>
                              !data.items.some(
                                (receipt) =>
                                  receipt.system === item.system && receipt.id === item.id,
                              ),
                          ),
                        );
                      }
                    }}
                    aria-label="Select all receipts on this page"
                  />
                  <p className="text-sm text-muted-foreground">
                    {selectedReceipts.length
                      ? `${selectedReceipts.length} selected`
                      : `${data.counts.all} receipt${data.counts.all === 1 ? "" : "s"} found`}
                  </p>
                  {selectedReceipts.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-9"
                      disabled={downloading}
                      onClick={() => void downloadSelected()}
                    >
                      {downloading ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Download className="h-4 w-4" aria-hidden />
                      )}
                      Download ZIP
                    </Button>
                  )}
                </div>
                <div
                  className="flex items-center gap-1 rounded-md border p-1"
                  aria-label="View style"
                >
                  <Button
                    type="button"
                    variant={view === "list" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-9 w-9"
                    aria-label="List view"
                    aria-pressed={view === "list"}
                    onClick={() => setView("list")}
                  >
                    <List className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant={view === "grid" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-9 w-9"
                    aria-label="Grid view"
                    aria-pressed={view === "grid"}
                    onClick={() => setView("grid")}
                  >
                    <Grid2X2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>

              {view === "list" ? (
                <>
                  <div className="hidden grid-cols-[2rem_minmax(12rem,1fr)_1fr_10rem_8rem] gap-3 border-b bg-muted/20 px-5 py-2 text-xs font-medium uppercase text-muted-foreground sm:grid">
                    <span aria-hidden />
                    <span>Reference</span>
                    <span>Person / Department</span>
                    <span>System</span>
                    <span className="text-right">Action</span>
                  </div>
                  <ul className="divide-y" aria-label="Receipts">
                    {data.items.map((receipt) => (
                      <li key={`${receipt.system}-${receipt.id}`}>
                        <div className="grid min-h-[76px] w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 sm:grid-cols-[2rem_minmax(12rem,1fr)_1fr_10rem_8rem] sm:items-center sm:px-5">
                          <Checkbox
                            checked={selectedReceipts.some(
                              (item) => item.system === receipt.system && item.id === receipt.id,
                            )}
                            onCheckedChange={(checked) => toggleReceipt(receipt, checked === true)}
                            aria-label={`Select ${receipt.reference}`}
                          />
                          <button
                            type="button"
                            onClick={() => setSelectedReceipt(receipt)}
                            className="min-w-0 text-left focus-visible:outline-none"
                            aria-label={`Preview ${systemLabel(receipt.system)} for ${receipt.personName}`}
                          >
                            <span className="min-w-0">
                              <span className="font-semibold">{receipt.reference}</span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {formatReceiptDate(receipt.receiptAt)}
                              </span>
                            </span>
                          </button>
                          <span className="min-w-0">
                            <span className="block break-words text-sm font-medium">
                              {receipt.personName}
                            </span>
                            <span className="mt-1 block break-words text-xs text-muted-foreground">
                              {receipt.department || "No department"}
                            </span>
                          </span>
                          <Badge variant="outline" className="w-fit">
                            {systemLabel(receipt.system)}
                          </Badge>
                          <button
                            type="button"
                            onClick={() => setSelectedReceipt(receipt)}
                            className="inline-flex min-h-11 items-center justify-start gap-2 text-sm font-medium text-primary sm:justify-end"
                          >
                            <Eye className="h-4 w-4" aria-hidden />
                            Preview
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {data.items.map((receipt) => (
                    <div
                      key={`${receipt.system}-${receipt.id}`}
                      className="group relative min-h-44 rounded-md border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                    >
                      <div className="absolute right-3 top-3">
                        <Checkbox
                          checked={selectedReceipts.some(
                            (item) => item.system === receipt.system && item.id === receipt.id,
                          )}
                          onCheckedChange={(checked) => toggleReceipt(receipt, checked === true)}
                          aria-label={`Select ${receipt.reference}`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedReceipt(receipt)}
                        className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Preview ${systemLabel(receipt.system)} for ${receipt.personName}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <FileDown className="h-5 w-5" aria-hidden />
                          </div>
                          <Badge variant="outline" className="mr-6">
                            {systemLabel(receipt.system)}
                          </Badge>
                        </div>
                        <p className="mt-4 font-semibold">{receipt.reference}</p>
                        <p className="mt-1 line-clamp-2 text-sm font-medium">
                          {receipt.personName}
                        </p>
                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                          {receipt.department || "No department"}
                        </p>
                        <p className="mt-3 text-xs text-muted-foreground">
                          {formatReceiptDate(receipt.receiptAt)}
                        </p>
                      </button>
                    </div>
                  ))}
                </div>
              )}

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
    return <PermissionSlipReceiptPreview preview={preview} />;
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

function PermissionSlipReceiptPreview({
  preview,
}: {
  preview: Extract<AdminReceiptPreview, { system: "permission_slip" }>;
}) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [archiving, setArchiving] = useState(false);

  if (preview.receiptImage) {
    return (
      <div className="space-y-3">
        <img
          src={`data:image/png;base64,${preview.receiptImage}`}
          alt={`${preview.slip.employeeName} approved Permission Slip receipt`}
          className="mx-auto max-h-[70vh] max-w-full rounded-md border object-contain"
        />
        <Button asChild variant="outline" className="min-h-11">
          <a
            href={`data:image/png;base64,${preview.receiptImage}`}
            download={`PS-${preview.slip.id.slice(0, 8).toUpperCase()}.png`}
          >
            <FileDown className="h-4 w-4" aria-hidden />
            Download PNG
          </a>
        </Button>
      </div>
    );
  }
  async function archiveReceipt() {
    if (!receiptRef.current || archiving) return;
    setArchiving(true);
    try {
      const receipt = receiptRef.current;
      const previousWidth = receipt.style.width;
      const previousMaxWidth = receipt.style.maxWidth;
      const previousMargin = receipt.style.margin;
      const previousTransform = receipt.style.transform;
      receipt.style.width = "794px";
      receipt.style.maxWidth = "none";
      receipt.style.margin = "0";
      receipt.style.transform = "none";
      try {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const receiptImage = await toPng(receipt, {
          pixelRatio: 2,
          backgroundColor: "#ffffff",
          cacheBust: true,
          skipFonts: true,
        });
        await unwrap(
          persistPermissionSlipReceiptFn({
            data: { id: preview.slip.id, receiptImage },
          }),
        );
        window.location.reload();
      } finally {
        receipt.style.width = previousWidth;
        receipt.style.maxWidth = previousMaxWidth;
        receipt.style.margin = previousMargin;
        receipt.style.transform = previousTransform;
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The Permission Slip PNG could not be archived.",
      );
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border bg-card p-2">
        <PermissionSlipReceipt slip={preview.slip} receiptRef={receiptRef} />
      </div>
      <Button
        type="button"
        className="min-h-11"
        disabled={archiving}
        onClick={() => void archiveReceipt()}
      >
        {archiving ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <FileDown className="h-4 w-4" aria-hidden />
        )}
        Archive PNG
      </Button>
    </div>
  );
}
