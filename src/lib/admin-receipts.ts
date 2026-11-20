import { z } from "zod";
import type { PermissionSlip } from "@/server/permission";

export const ADMIN_RECEIPT_SYSTEMS = ["vehicle_trip_ticket", "coe", "permission_slip"] as const;

export type AdminReceiptSystem = (typeof ADMIN_RECEIPT_SYSTEMS)[number];
export type AdminReceiptSystemFilter = AdminReceiptSystem | "all";

export const ADMIN_RECEIPT_SYSTEM_LABELS: Record<AdminReceiptSystem, string> = {
  vehicle_trip_ticket: "Vehicle Trip Ticket",
  coe: "Certificate of Employment",
  permission_slip: "Permission Slip",
};

const dateOnlySchema = z.iso.date().optional();

export const adminReceiptListSchema = z
  .object({
    system: z.enum(["all", ...ADMIN_RECEIPT_SYSTEMS]).default("all"),
    q: z.string().trim().max(100).optional(),
    dateFrom: dateOnlySchema,
    dateTo: dateOnlySchema,
    page: z.number().int().min(0).max(10_000).default(0),
  })
  .refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, {
    message: "The start date must be on or before the end date.",
    path: ["dateTo"],
  });

export const adminReceiptPreviewSchema = z.object({
  system: z.enum(ADMIN_RECEIPT_SYSTEMS),
  id: z.string().uuid("Invalid receipt reference."),
});

export const adminReceiptBulkDownloadSchema = z.object({
  receipts: z
    .array(
      z.object({
        system: z.enum(ADMIN_RECEIPT_SYSTEMS),
        id: z.string().uuid("Invalid receipt reference."),
      }),
    )
    .min(1, "Select at least one receipt.")
    .max(24, "Download up to 24 receipts at a time."),
});

export type AdminReceiptListInput = z.input<typeof adminReceiptListSchema>;

export interface AdminReceiptRecord {
  id: string;
  system: AdminReceiptSystem;
  reference: string;
  personName: string;
  department: string;
  status: string;
  receiptAt: string;
  fileName?: string;
}

export interface AdminReceiptListResult {
  items: AdminReceiptRecord[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  counts: Record<AdminReceiptSystemFilter, number>;
}

export type AdminReceiptPreview =
  | {
      system: "vehicle_trip_ticket" | "coe";
      fileName: string;
      mime: string;
      base64: string;
    }
  | { system: "permission_slip"; slip: PermissionSlip; receiptImage?: string };
