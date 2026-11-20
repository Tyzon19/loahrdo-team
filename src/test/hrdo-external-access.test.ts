import { describe, expect, it } from "vitest";
import { canExternalHrdoViewerAccessPath } from "@/lib/hrdo";

describe("external HRDO route access", () => {
  it("allows former employees to open their profile from the COE portal", () => {
    expect(canExternalHrdoViewerAccessPath("/hrdo/profile")).toBe(true);
    expect(canExternalHrdoViewerAccessPath("/hrdo/coe")).toBe(true);
    expect(canExternalHrdoViewerAccessPath("/hrdo/coe/123")).toBe(true);
  });

  it("keeps staff-only routes unavailable to external accounts", () => {
    expect(canExternalHrdoViewerAccessPath("/hrdo/dashboard")).toBe(false);
    expect(canExternalHrdoViewerAccessPath("/hrdo/analytics")).toBe(false);
  });
});
