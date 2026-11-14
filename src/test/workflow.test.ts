import { describe, expect, it } from "vitest";
import {
  approveStage,
  createRequest,
  rejectStage,
  resubmit,
  ROLE_TITLES,
  STAGES,
  updatePendingRequest,
  WorkflowError,
  type Ctx,
} from "@/lib/workflow";
import type { User } from "@/lib/types";

const users: User[] = [
  { id: "r", name: "Req", role: "requisitioner", department: "CAS", email: "r@x" },
  { id: "h", name: "Head", role: "transport_head", department: "", email: "h@x" },
  { id: "d", name: "Dir", role: "director", department: "", email: "d@x" },
  { id: "p", name: "Pres", role: "president", department: "", email: "p@x" },
  { id: "t", name: "Staff", role: "transport_staff", department: "", email: "t@x" },
  { id: "a", name: "Admin", role: "admin", department: "", email: "a@x" },
];
let i = 0;
const ctx: Ctx = { users, now: "2026-10-22T00:00:00.000Z", newId: () => `x${i++}` };
const u = (id: string) => users.find((x) => x.id === id)!;
const sig = { method: "drawn" as const, image: "data:image/png;base64,AAA" };
const input = {
  department: "CAS",
  destinations: ["Manila"],
  passengers: 5,
  dateStart: "2026-11-01",
  dateEnd: "2026-11-01",
  timeNeeded: "07:00",
  purpose: "Field trip for class",
};

describe("approval workflow", () => {
  it("keeps the President's title separate from the configured approver name", () => {
    expect(STAGES.find((stage) => stage.key === "approve")?.title).toBe("President");
    expect(ROLE_TITLES.assistant).toBe("Alternate Signatory");
  });

  it("follows Head of Transport → Director → President order", () => {
    let r = createRequest(ctx, input, u("r"), "VR-1").request;
    expect(r.status).toBe("pending_review");
    expect(r.history[0]?.type).toBe("submitted");
    expect(createRequest(ctx, input, u("r"), "VR-1").emails[0]).toMatchObject({
      toUserId: "h",
      kind: "action_review",
      stage: "review",
    });
    expect(() => approveStage(ctx, r, u("p"), sig)).toThrow(WorkflowError);
    expect(() => approveStage(ctx, r, u("d"), sig)).toThrow(WorkflowError);
    expect(() => approveStage(ctx, r, u("a"), sig)).toThrow(WorkflowError);
    const review = approveStage(ctx, r, u("h"), sig, {
      vehicleType: "Van",
      plateNo: "ABC 123",
      remarks: "Vehicle assigned",
    });
    r = review.request;
    expect(r.status).toBe("pending_recommendation");
    expect(review.emails).toHaveLength(1);
    expect(review.emails[0]).toMatchObject({
      toUserId: "d",
      kind: "action_recommend",
      stage: "recommend",
    });
    const recommendation = approveStage(ctx, r, u("d"), sig);
    r = recommendation.request;
    expect(r.status).toBe("pending_approval");
    expect(r.vehicleType).toBe("Van");
    expect(recommendation.emails).toHaveLength(1);
    expect(recommendation.emails[0]).toMatchObject({
      toUserId: "p",
      kind: "action_approve",
      stage: "approve",
    });
    const out = approveStage(ctx, r, u("p"), sig);
    expect(out.request.status).toBe("approved");
    expect(out.emails.map((e) => e.toUserId).sort()).toEqual(["p", "r", "t"]);
    expect(out.emails.find((email) => email.kind === "trip_ticket_reminder")).toMatchObject({
      toUserId: "p",
      stage: "approve",
      subject: "[LOA Vehicle Request] Action Needed: Trip Ticket Not Sent — VR-1",
      heading: "The official trip ticket has not been sent to the requestor yet.",
      ctaLabel: "Prepare Trip Ticket",
    });
    expect(out.emails.find((email) => email.kind === "trip_ticket_reminder")?.body).toContain(
      "still waiting to be sent",
    );
  });
  it("requires a rejection reason", () => {
    const r = createRequest(ctx, input, u("r"), "VR-2").request;
    expect(() => rejectStage(ctx, r, u("a"), "  ")).toThrow(WorkflowError);
  });
  it("does not allow administrators to complete the initial review stage", () => {
    const r = createRequest(ctx, input, u("r"), "VR-ADMIN").request;

    expect(() => approveStage(ctx, r, u("a"), sig)).toThrow(WorkflowError);
    expect(() => rejectStage(ctx, r, u("a"), "Incomplete request")).toThrow(WorkflowError);
    expect(approveStage(ctx, r, u("h"), sig).request.status).toBe("pending_recommendation");
  });
  it("creates a return email for the original requisitioner", () => {
    const submitted = createRequest(ctx, input, u("r"), "VR-RETURN").request;
    const r = approveStage(ctx, submitted, u("h"), sig).request;
    const result = rejectStage(ctx, r, u("d"), "Missing travel details");

    expect(result.emails).toHaveLength(1);
    expect(result.emails[0]).toMatchObject({
      toUserId: "r",
      toEmail: "r@x",
      kind: "returned",
      requestId: r.id,
    });
  });
  it("allows the assigned alternate to return a request with their own identity", () => {
    const submitted = createRequest(ctx, input, u("r"), "VR-ALT-RETURN").request;
    const r = approveStage(ctx, submitted, u("h"), sig).request;
    expect(() => rejectStage(ctx, r, u("t"), "Missing details")).toThrow(WorkflowError);

    const result = rejectStage(ctx, r, u("t"), "Missing details", true);
    expect(result.request).toMatchObject({
      status: "returned",
      lastReturn: { byName: "Staff", byRole: "transport_staff", stage: "recommend" },
    });
    expect(result.request.history.at(-1)?.message).toContain("assigned alternate");
    expect(result.emails[0]?.body).toContain("assigned alternate");
  });
  it("allows the requisitioner to edit a request only before transport review", () => {
    const r = createRequest(ctx, input, u("r"), "VR-EDIT").request;
    const editedInput = { ...input, purpose: "Updated field trip purpose" };
    const updated = updatePendingRequest(ctx, r, u("r"), editedInput);

    expect(updated).toMatchObject({
      status: "pending_review",
      attempt: r.attempt,
      submittedAt: r.submittedAt,
      purpose: editedInput.purpose,
    });
    expect(updated.history.at(-1)).toMatchObject({
      type: "updated",
      actorName: "Req",
    });
    expect(() => updatePendingRequest(ctx, r, u("h"), editedInput)).toThrow(WorkflowError);

    const signed = approveStage(ctx, r, u("h"), sig).request;
    expect(() => updatePendingRequest(ctx, signed, u("r"), editedInput)).toThrow(WorkflowError);
  });
  it("allows an assigned alternate to sign with their own authenticated identity", () => {
    const submitted = createRequest(ctx, input, u("r"), "VR-4").request;
    const r = approveStage(ctx, submitted, u("h"), sig).request;
    expect(() => approveStage(ctx, r, u("t"), { ...sig, proxySignerName: "Staff" })).toThrow(
      WorkflowError,
    );
    const out = approveStage(
      ctx,
      r,
      u("t"),
      {
        ...sig,
        proxySignerName: "Staff",
      },
      {},
      true,
    );
    expect(out.request.status).toBe("pending_approval");
    expect(out.request.signatures[1]).toMatchObject({
      signerId: "t",
      signerName: "Staff",
      proxySignerName: "Staff",
      at: ctx.now,
    });
    expect(out.request.history.at(-1)?.message).toContain("Staff as alternate");
  });
  it("allows the assigned main signatory to act without changing their system role", () => {
    const r = createRequest(ctx, input, u("r"), "VR-MAIN-SIGNATORY").request;
    const initial = approveStage(ctx, r, u("h"), sig).request;
    const out = approveStage(ctx, initial, u("t"), sig, {}, false, true);

    expect(out.request.status).toBe("pending_approval");
    expect(out.request.signatures[1]).toMatchObject({
      signerId: "t",
      signerName: "Staff",
      signerRole: "transport_staff",
    });
    expect(out.request.signatures[1]?.proxySignerName).toBeUndefined();
    expect(out.request.history.at(-1)?.message).not.toContain("alternate");
  });
  it("allows the assigned main signatory to return a request with their own identity", () => {
    const submitted = createRequest(ctx, input, u("r"), "VR-MAIN-RETURN").request;
    const r = approveStage(ctx, submitted, u("h"), sig).request;
    const out = rejectStage(ctx, r, u("t"), "Missing travel details", false, true);

    expect(out.request).toMatchObject({
      status: "returned",
      lastReturn: { byName: "Staff", byRole: "transport_staff", stage: "recommend" },
    });
    expect(out.request.history.at(-1)?.message).not.toContain("alternate");
  });
  it("restarts at the Head of Transport after resubmission and keeps old signatures separate", () => {
    let r = createRequest(ctx, input, u("r"), "VR-3").request;
    r = approveStage(ctx, r, u("h"), sig).request;
    r = rejectStage(ctx, r, u("d"), "Need schedule details").request;
    expect(r.status).toBe("returned");
    const out = resubmit(ctx, r, u("r"), input);
    expect(out.request.status).toBe("pending_review");
    expect(out.request.attempt).toBe(2);
    expect(out.emails[0]?.toUserId).toBe("h");
    expect(out.request.signatures.filter((s) => s.attempt === 2)).toHaveLength(0);
    expect(out.request.signatures).toHaveLength(1);
  });
});
