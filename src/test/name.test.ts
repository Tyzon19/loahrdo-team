import { describe, expect, it } from "vitest";
import { FORMAL_NAME_PREFIXES, joinFullName, splitFullName } from "@/lib/name";

describe("formal name prefixes", () => {
  it("separates a Super Admin name prefix from the name parts", () => {
    expect(splitFullName("Ms. Alyssa Marie Santos")).toEqual({
      prefix: "Ms.",
      firstName: "Alyssa",
      middleName: "Marie",
      lastName: "Santos",
    });
  });

  it("keeps ordinary names without prefixes unchanged", () => {
    expect(splitFullName("Mark Joseph Turingan")).toEqual({
      prefix: "",
      firstName: "Mark",
      middleName: "Joseph",
      lastName: "Turingan",
    });
  });

  it("exposes the supported official prefixes", () => {
    expect(FORMAL_NAME_PREFIXES).toEqual(["Mr.", "Ms.", "Mrs.", "Mx.", "Dr.", "Atty."]);
  });

  it("joins a selected prefix with the account name", () => {
    expect(
      `Ms. ${joinFullName({ firstName: "Alyssa", middleName: "Marie", lastName: "Santos" })}`,
    ).toBe("Ms. Alyssa Marie Santos");
  });

  it("supports Attorney names as a formal prefix", () => {
    expect(splitFullName("Atty. Juan Dela Cruz")).toEqual({
      prefix: "Atty.",
      firstName: "Juan",
      middleName: "Dela",
      lastName: "Cruz",
    });
  });
});
