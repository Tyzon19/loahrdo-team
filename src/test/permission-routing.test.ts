import { describe, expect, it } from "vitest";
import { isPermissionSlipDetailPath } from "@/lib/permission-routing";

describe("Permission Slip routing", () => {
  it("recognizes a Permission Slip detail URL so the child route can render", () => {
    expect(isPermissionSlipDetailPath("/permission-slips/2a2a95a1-7916-4baf-8d00-3682eec149b5")).toBe(true);
    expect(isPermissionSlipDetailPath("/permission-slips")).toBe(false);
  });
});
