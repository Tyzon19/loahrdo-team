import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseInput, runSafely } from "@/lib/errors";

describe("user-facing validation errors", () => {
  it("replaces default Zod length errors with plain language", async () => {
    const result = await runSafely(async () =>
      parseInput(z.object({ name: z.string().min(3) }), { name: "A" }),
    );

    expect(result).toEqual({
      ok: false,
      error: "Enter at least 3 characters.",
      fieldErrors: { name: "Enter at least 3 characters." },
    });
  });

  it("normalizes default maximum-length and missing-value errors", async () => {
    const longValue = await runSafely(async () =>
      parseInput(z.object({ name: z.string().max(3) }), { name: "Alex" }),
    );
    const missingValue = await runSafely(async () =>
      parseInput(z.object({ name: z.string() }), {}),
    );

    expect(longValue).toMatchObject({
      ok: false,
      error: "Use 3 characters or fewer.",
      fieldErrors: { name: "Use 3 characters or fewer." },
    });
    expect(missingValue).toMatchObject({
      ok: false,
      error: "Enter a valid value.",
      fieldErrors: { name: "Enter a valid value." },
    });
  });

  it("normalizes default option, object and number messages", async () => {
    const invalidOption = await runSafely(async () =>
      parseInput(z.object({ stage: z.enum(["review", "approve"]) }), { stage: "other" }),
    );
    const extraField = await runSafely(async () =>
      parseInput(z.strictObject({ name: z.string() }), { name: "Alex", extra: true }),
    );
    const invalidMultiple = await runSafely(async () => parseInput(z.number().multipleOf(3), 4));

    expect(invalidOption).toMatchObject({
      ok: false,
      error: "Choose a valid option.",
      fieldErrors: { stage: "Choose a valid option." },
    });
    expect(extraField).toMatchObject({
      ok: false,
      error: "Remove unsupported information and try again.",
      fieldErrors: { form: "Remove unsupported information and try again." },
    });
    expect(invalidMultiple).toMatchObject({
      ok: false,
      error: "Enter a multiple of 3.",
      fieldErrors: { form: "Enter a multiple of 3." },
    });
  });

  it("preserves custom validation messages", async () => {
    const result = await runSafely(async () =>
      parseInput(z.object({ name: z.string().min(3, "Enter your full name.") }), { name: "A" }),
    );

    expect(result).toEqual({
      ok: false,
      error: "Enter your full name.",
      fieldErrors: { name: "Enter your full name." },
    });
  });
});
