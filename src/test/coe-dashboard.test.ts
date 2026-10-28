import { describe, expect, it } from "vitest";
import {
  coeDeadlineInfo,
  coeRequestorCounts,
  coeStaffActions,
  filterCoeRequests,
  hrCoeSummary,
  type CoeRequest,
} from "@/lib/hrdo";

const NOW = new Date("2026-10-28T12:00:00Z");

function request(overrides: Partial<CoeRequest>): CoeRequest {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    employeeId: "22222222-2222-4222-8222-222222222222",
    employeeName: "COE Employee User",
    employeeEmail: "employee@loa.edu.ph",
    employeeNumber: "EMP-001",
    department: "Human Resources Development Office",
    purpose: "Loan application",
    note: "",
    copyType: "original",
    status: "pending",
    remarks: "",
    correctionMessage: "",
    processedByName: "",
    requestedAt: "2026-10-28T09:00:00Z",
    deadlineAt: "2026-10-31T09:00:00Z",
    updatedAt: "2026-10-28T09:00:00Z",
    verifiedAt: "",
    verifiedByName: "",
    correctionRequestedAt: "",
    finalizedAt: "",
    readyAt: "",
    releasedAt: "",
    releasedByName: "",
    receivedByName: "",
    hasDocument: false,
    documentFileName: "",
    history: [],
    ...overrides,
  };
}

const requests: CoeRequest[] = [
  request({ id: "aaaaaaaa-1111-4111-8111-111111111111", status: "pending" }),
  request({ purpose: "Scholarship application", status: "under_review" }),
  request({ purpose: "Employment verification", status: "processing", copyType: "soft" }),
  request({
    id: "bbbbbbbb-1111-4111-8111-111111111111",
    purpose: "Visa requirement",
    status: "rejected",
    remarks: "Missing supporting letter.",
  }),
  request({
    id: "cccccccc-1111-4111-8111-111111111111",
    status: "ready_for_pickup",
    copyType: "both",
    hasDocument: true,
  }),
  request({ id: "dddddddd-1111-4111-8111-111111111111", status: "released" }),
];

describe("COE requestor summary", () => {
  it("counts every request in exactly one card", () => {
    const counts = coeRequestorCounts(requests);
    expect(counts).toEqual({ review: 2, processing: 1, action: 1, ready: 2 });
    expect(counts.review + counts.processing + counts.action + counts.ready).toBe(requests.length);
  });

  it("groups correction requests and rejections under Needs Action", () => {
    expect(
      coeRequestorCounts([
        request({ status: "correction_requested" }),
        request({ status: "rejected" }),
      ]),
    ).toEqual({ review: 0, processing: 0, action: 2, ready: 0 });
  });
});

describe("HR workload summary", () => {
  it("counts each queue and keeps deadline urgency separate", () => {
    const summary = hrCoeSummary(requests, NOW);
    expect(summary.total).toBe(6);
    expect(summary.newCount).toBe(1);
    expect(summary.underReview).toBe(1);
    expect(summary.processing).toBe(1);
    expect(summary.readyForPickup).toBe(1);
    expect(summary.released).toBe(1);
    expect(summary.dueSoon + summary.overdue).toBe(0);
  });

  it("flags overdue and due-soon open requests only", () => {
    const summary = hrCoeSummary(
      [
        request({ status: "processing", deadlineAt: "2026-10-27T12:00:00Z" }),
        request({ status: "pending", deadlineAt: "2026-10-29T06:00:00Z" }),
        request({ status: "ready_for_pickup", deadlineAt: "2026-10-20T12:00:00Z" }),
      ],
      NOW,
    );
    expect(summary.overdue).toBe(1);
    expect(summary.dueSoon).toBe(1);
  });
});

describe("COE deadline", () => {
  it("closes the deadline once the request is completed", () => {
    expect(coeDeadlineInfo("2026-10-20T12:00:00Z", "released", NOW).state).toBe("closed");
    expect(coeDeadlineInfo("2026-10-20T12:00:00Z", "rejected", NOW).state).toBe("closed");
  });

  it("reports overdue, due soon and on track", () => {
    expect(coeDeadlineInfo("2026-10-27T12:00:00Z", "processing", NOW).state).toBe("overdue");
    expect(coeDeadlineInfo("2026-10-29T06:00:00Z", "pending", NOW).state).toBe("due_soon");
    expect(coeDeadlineInfo("2026-10-31T09:00:00Z", "pending", NOW).state).toBe("on_track");
  });
});

describe("COE filtering", () => {
  it("filters by status", () => {
    expect(filterCoeRequests(requests, { status: "rejected" })).toHaveLength(1);
  });

  it("searches by request ID, purpose, employee name and Employee ID", () => {
    expect(filterCoeRequests(requests, { q: "AAAAAAAA" })[0]?.id).toBe(requests[0]?.id);
    expect(filterCoeRequests(requests, { q: "scholarship" })).toHaveLength(1);
    expect(filterCoeRequests(requests, { q: "employee user" })).toHaveLength(requests.length);
    expect(filterCoeRequests(requests, { q: "emp-001" })).toHaveLength(requests.length);
  });

  it("filters by department, type of copy and deadline", () => {
    expect(
      filterCoeRequests(requests, { department: "Human Resources Development Office" }),
    ).toHaveLength(requests.length);
    expect(filterCoeRequests(requests, { department: "Finance" })).toHaveLength(0);
    expect(filterCoeRequests(requests, { copyType: "soft" })).toHaveLength(1);
    expect(
      filterCoeRequests(
        [request({ status: "processing", deadlineAt: "2026-10-27T12:00:00Z" })],
        { deadline: "overdue" },
        NOW,
      ),
    ).toHaveLength(1);
  });

  it("returns everything for the all filter", () => {
    expect(filterCoeRequests(requests, { q: "  ", status: "all" })).toHaveLength(requests.length);
  });
});

describe("COE staff processing actions", () => {
  const base = { copyType: "original" as const, verifiedAt: "", hasDocument: false };

  it("starts with verification, then processing", () => {
    expect(coeStaffActions({ ...base, status: "pending" })).toEqual([
      "verify",
      "request_correction",
      "reject",
    ]);
    expect(
      coeStaffActions({ ...base, status: "under_review", verifiedAt: "2026-10-28T10:00:00Z" }),
    ).toEqual(["process", "request_correction", "reject"]);
  });

  it("requires the signed PDF for both-copy requests before pickup", () => {
    expect(coeStaffActions({ ...base, status: "processing", copyType: "both" })).toContain(
      "upload_document",
    );
    expect(coeStaffActions({ ...base, status: "processing", copyType: "both" })).not.toContain(
      "mark_ready",
    );
    expect(
      coeStaffActions({ ...base, status: "processing", copyType: "both", hasDocument: true }),
    ).toContain("mark_ready");
  });

  it("offers release only once the printed copy is ready", () => {
    expect(coeStaffActions({ ...base, status: "ready_for_pickup" })).toEqual(["release"]);
    expect(coeStaffActions({ ...base, status: "released" })).toEqual([]);
    expect(coeStaffActions({ ...base, status: "correction_requested" })).toEqual([]);
  });
});
