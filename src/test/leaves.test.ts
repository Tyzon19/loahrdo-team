import { describe, expect, it } from "vitest";
import { createLeaveSchema, decideLeaveSchema, leaveRequiresPresident } from "@/lib/leaves";
const signature = { image: `data:image/png;base64,${"a".repeat(60)}`, method: "drawn" };
const application = {
  id: "d2dd77e0-9c4b-4b53-92a3-a97c273c03fb",
  code: "V",
  reason: "Family appointment",
  dates: ["2026-11-26"],
  signature,
};
describe("leave application boundaries", () => {
  it("routes employees to their supervisor and heads to the president", () => {
    expect(leaveRequiresPresident("requisitioner")).toBe(false);
    expect(leaveRequiresPresident("department_head")).toBe(true);
    expect(leaveRequiresPresident("transport_head")).toBe(true);
  });
  it("rejects impossible and duplicate dates and client supplied routing", () => {
    expect(createLeaveSchema.safeParse(application).success).toBe(true);
    expect(createLeaveSchema.safeParse({ ...application, dates: ["2026-02-30"] }).success).toBe(
      false,
    );
    expect(
      createLeaveSchema.safeParse({ ...application, dates: ["2026-11-26", "2026-11-26"] }).success,
    ).toBe(false);
    expect(
      createLeaveSchema.safeParse({ ...application, recommender_id: "attacker" }).success,
    ).toBe(false);
  });
  it("requires medical evidence for multi-day sick leave and reasons for rejection", () => {
    expect(
      createLeaveSchema.safeParse({
        ...application,
        code: "S",
        dates: ["2026-11-26", "2026-11-27"],
      }).success,
    ).toBe(false);
    expect(
      decideLeaveSchema.safeParse({ id: application.id, decision: "reject", signature, note: "" })
        .success,
    ).toBe(false);
  });
});
