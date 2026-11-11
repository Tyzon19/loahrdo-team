import { describe, expect, it } from "vitest";
import { isPermissionHead, PERMISSION_HEAD_EMAIL } from "@/lib/permission-access";

describe("Permission Slip access", () => {
  it("recognizes the designated HRDO director even when the account role is director", () => {
    expect(
      isPermissionHead({
        email: PERMISSION_HEAD_EMAIL,
        role: "director",
      }),
    ).toBe(true);
  });

  it("keeps unrelated directors out of the Permission Slip approval queue", () => {
    expect(
      isPermissionHead({
        email: "director@lyceumalabang.edu.ph",
        role: "director",
      }),
    ).toBe(false);
  });
});
