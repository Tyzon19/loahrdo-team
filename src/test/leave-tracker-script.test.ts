import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function fixture(conflict = false) {
  const job = {
    id: "request-1",
    department_group: "COLLEGE",
    spreadsheet_id: "college",
    sheet_row_number: 8,
    full_name: "EMPLOYEE, TEST",
    cycle_start: "2026-06-01",
    code: "V",
    credited: 1,
    dates: ["2026-11-26", "2026-11-27"],
  };
  const values = new Map<number, string>([[182, conflict ? "S" : ""]]);
  const notes = new Map<number, string>();
  const write = vi.fn((column: number, value: string) => values.set(column, value));
  const request = vi.fn();
  const push = vi.fn();
  const context = createContext({
    LockService: { getScriptLock: () => ({ waitLock: vi.fn(), releaseLock: vi.fn() }) },
    SpreadsheetApp: {
      flush: vi.fn(),
      openById: () => ({
        getSheetByName: () => ({
          getRange: (row: number | string, col?: number) => ({
            getValue: () =>
              row === "A1"
                ? 6
                : row === "A2"
                  ? 2026
                  : col === 1
                    ? job.full_name
                    : col && col >= 375
                      ? 0
                      : (values.get(col!) ?? ""),
            getFormula: () => "",
            getNote: () => notes.get(col!) ?? "",
            setNote: (note: string) => notes.set(col!, note),
            setValue: (value: string) => write(col!, value),
          }),
        }),
      }),
    },
  });
  runInContext(readFileSync("scripts/Code.gs", "utf8"), context);
  context["configuration_"] = () => ({ sources: [{ group: "COLLEGE", id: "college" }] });
  context["leaveJobsRequest_"] = (_config: unknown, payload?: unknown) => {
    if (payload) {
      request(payload);
      return { ok: true };
    }
    return { jobs: [job] };
  };
  context["pushTracker_"] = push;
  return { context, job, write, request, push, values, notes };
}
describe("approved leave Apps Script write-back", () => {
  it("maps calendar dates to the 31-column month blocks and safely retries", () => {
    const f = fixture();
    runInContext("syncApprovedLeaves()", f.context);
    expect(f.write.mock.calls.map((c) => c[0])).toEqual([182, 183]);
    expect(f.request).toHaveBeenCalledWith({ id: "request-1", utilized: { sl: 0, vl: 0 } });
    runInContext("syncApprovedLeaves()", f.context);
    expect(f.push).toHaveBeenCalledTimes(2);
  });
  it("checks every cell before writing and preserves conflicting attendance", () => {
    const f = fixture(true);
    runInContext("syncApprovedLeaves()", f.context);
    expect(f.write).not.toHaveBeenCalled();
    expect(f.push).not.toHaveBeenCalled();
    expect(f.request.mock.calls[0]![0]).toHaveProperty("error");
  });
  it("never writes an uncredited job even if the server sends one", () => {
    const f = fixture();
    f.job.credited = 0;
    runInContext("syncApprovedLeaves()", f.context);
    expect(f.write).not.toHaveBeenCalled();
    expect(f.push).not.toHaveBeenCalled();
    expect(f.request.mock.calls[0]![0].error).toContain("Not-credited");
  });
});
