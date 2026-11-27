import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function fixture(
  conflict = false,
  overrides: Partial<{
    activeMonth: number;
    year: number;
    dates: string[];
    code: string;
    cycleStart: string;
    staleColumn: number;
    nonWorkingColumns: number[];
  }> = {},
  scriptPath = "scripts/Code.gs",
) {
  const job = {
    id: "request-1",
    department_group: "COLLEGE",
    spreadsheet_id: "college",
    sheet_row_number: 8,
    full_name: "EMPLOYEE, TEST",
    cycle_start: overrides.cycleStart ?? "2026-01-01",
    code: "V",
    credited: 1,
    dates: overrides.dates ?? ["2026-11-26", "2026-11-27"],
    ...(overrides.code ? { code: overrides.code } : {}),
  };
  const values = new Map<number, string>([
    [338, conflict ? "S" : ""],
    ...(overrides.staleColumn ? [[overrides.staleColumn, "S"] as [number, string]] : []),
  ]);
  const notes = new Map<number, string>(
    overrides.staleColumn ? [[overrides.staleColumn, `LOA leave application ${job.id}`]] : [],
  );
  const nonWorkingColumns = new Set(overrides.nonWorkingColumns ?? []);
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
                ? (overrides.activeMonth ?? 11)
                : row === "A2"
                  ? (overrides.year ?? 2026)
                  : row === 3
                    ? !nonWorkingColumns.has(col!)
                    : col === 1
                      ? job.full_name
                      : col && col >= 375
                        ? 0
                        : (values.get(col!) ?? ""),
            getFormula: () => "",
            getColumn: () => col!,
            getNote: () => notes.get(col!) ?? "",
            getNotes: () => [Array.from({ length: 372 }, (_, index) => notes.get(index + 2) ?? "")],
            getValues: () => [
              Array.from({ length: 372 }, (_, index) => values.get(index + 2) ?? ""),
            ],
            clearContent: () => {
              if (col) values.delete(col);
            },
            clearNote: () => {
              if (col) notes.delete(col);
            },
            setNote: (note: string) => notes.set(col!, note),
            setValue: (value: string) => write(col!, value),
          }),
        }),
      }),
    },
  });
  runInContext(readFileSync(scriptPath, "utf8"), context);
  context["configuration_"] = () => ({ sources: [{ group: "COLLEGE", id: "college" }] });
  context["hrdoAttendanceConfig_"] = () => ({
    url: "https://example.test/api/webhooks/sheets-sync",
    secret: "test-secret",
    id: "college",
    group: "COLLEGE",
  });
  context["leaveJobsRequest_"] = (_config: unknown, payload?: unknown) => {
    if (payload) {
      request(payload);
      return { ok: true };
    }
    return { jobs: [job] };
  };
  context["pushTracker_"] = push;
  context["leavePushTracker_"] = push;
  return { context, job, write, request, push, values, notes };
}
describe("approved leave Apps Script write-back", () => {
  it.each(["scripts/Code.gs", "scripts/LeaveApprovalSync.gs"])(
    "writes Nov 27–28, 2026 into the calendar-year columns in %s",
    (scriptPath) => {
      const f = fixture(
        false,
        {
          activeMonth: 11,
          year: 2026,
          cycleStart: "2026-01-01",
          dates: ["2026-11-27", "2026-11-28"],
        },
        scriptPath,
      );
      runInContext("syncApprovedLeaves()", f.context);
      expect(f.write.mock.calls.map((c) => c[0])).toEqual([338, 339]);
      expect(f.request).toHaveBeenCalledWith({ id: "request-1", utilized: { sl: 0, vl: 0 } });
      runInContext("syncApprovedLeaves()", f.context);
      expect(f.push).toHaveBeenCalledTimes(2);
    },
  );
  it("uses the calendar-year block for January after the tracker year changes", () => {
    const f = fixture(false, {
      activeMonth: 12,
      year: 2027,
      cycleStart: "2027-01-01",
      dates: ["2027-01-01", "2027-01-02", "2027-01-03", "2027-01-04"],
      code: "S",
    });
    runInContext("syncApprovedLeaves()", f.context);
    expect(f.write.mock.calls.map((call) => call[0])).toEqual([2, 3, 4, 5]);
    expect(f.request).toHaveBeenCalledWith({ id: "request-1", utilized: { sl: 0, vl: 0 } });
  });
  it.each(["scripts/Code.gs", "scripts/LeaveApprovalSync.gs"])(
    "does not let the selected month shift November dates in %s",
    (scriptPath) => {
      const f = fixture(
        false,
        {
          activeMonth: 12,
          cycleStart: "2026-01-01",
          dates: ["2026-11-27", "2026-11-28"],
        },
        scriptPath,
      );
      runInContext("syncApprovedLeaves()", f.context);
      expect(f.write.mock.calls.map((call) => call[0])).toEqual([338, 339]);
    },
  );
  it.each(["scripts/Code.gs", "scripts/LeaveApprovalSync.gs"])(
    "rejects tracker-marked non-working days before writing in %s",
    (scriptPath) => {
      const f = fixture(
        false,
        {
          dates: ["2026-11-29"],
          nonWorkingColumns: [340],
        },
        scriptPath,
      );
      runInContext("syncApprovedLeaves()", f.context);
      expect(f.write).not.toHaveBeenCalled();
      expect(f.request.mock.calls[0]![0].error).toContain("working day");
    },
  );
  it.each(["scripts/Code.gs", "scripts/LeaveApprovalSync.gs"])(
    "clears a stale LOA leave cell from the wrong January block in %s",
    (scriptPath) => {
      const f = fixture(
        false,
        {
          activeMonth: 12,
          year: 2026,
          cycleStart: "2026-01-01",
          staleColumn: 2,
          dates: ["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"],
          code: "S",
        },
        scriptPath,
      );
      runInContext("syncApprovedLeaves()", f.context);
      expect(f.write.mock.calls.map((call) => call[0])).toEqual([343, 344, 345, 346]);
      expect(f.values.get(2)).toBeUndefined();
      expect(f.notes.get(2)).toBeUndefined();
    },
  );
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

describe("STAFF snapshot Apps Script sender", () => {
  it.each([
    ["scripts/Code.gs", "pushTracker_({ url, secret }, source)"],
    ["scripts/LeaveApprovalSync.gs", "leavePushTracker_({ url, secret, source })"],
  ])("normalizes shifted STAFF summary columns in %s", (scriptPath, call) => {
    const snapshot = vi.fn();
    const sheetValues = Array.from({ length: 8 }, () => Array(441).fill(""));
    sheetValues[4]![404] = "Leaves This Month";
    sheetValues[7]![404] = 0.5;
    sheetValues[7]![410] = 1;
    sheetValues[7]![417] = 4.5;
    sheetValues[7]![418] = 5;
    sheetValues[7]![419] = 0;
    sheetValues[7]![420] = "1 BL CARRY OVER";
    const sheet = {
      getLastRow: () => 8,
      getLastColumn: () => 441,
      getRange: vi.fn((_row: number, _column: number, rows: number, columns: number) => ({
        getValues: () => sheetValues.slice(0, rows).map((row) => row.slice(0, columns)),
      })),
    };
    const context = createContext({
      SpreadsheetApp: {
        flush: vi.fn(),
        openById: () => ({ getSheetByName: () => sheet }),
      },
      UrlFetchApp: {
        fetch: (_url: string, options: { payload: string }) => {
          snapshot(JSON.parse(options.payload));
          return {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({ ok: true }),
          };
        },
      },
      Utilities: {
        getUuid: () => "snapshot-id",
        newBlob: () => ({ getBytes: () => [] }),
        sleep: vi.fn(),
      },
    });
    runInContext(readFileSync(scriptPath, "utf8"), context);
    context["url"] = "https://example.test/api/webhooks/sheets-sync";
    context["secret"] = "test-secret";
    context["source"] = { id: "college", group: "COLLEGE" };
    runInContext(call, context);

    expect(sheet.getRange).toHaveBeenCalledWith(1, 1, 8, 441);
    const values = snapshot.mock.calls[0]?.[0]?.values as unknown[][];
    expect(values).toHaveLength(8);
    expect(values[0]).toHaveLength(410);
    expect(values[4]?.[373]).toBe("Leaves This Month");
    expect(values[7]?.[373]).toBe(0.5);
    expect(values[7]?.[379]).toBe(1);
    expect(values[7]?.[386]).toBe(4.5);
    expect(values[7]?.[387]).toBe(5);
    expect(values[7]?.[388]).toBe(0);
    expect(values[7]?.[389]).toBe("1 BL CARRY OVER");

    sheetValues[4]![404] = "";
    sheetValues[4]![373] = "Leaves This Month";
    sheetValues[7]![373] = 0.5;
    sheetValues[7]![379] = 1;
    sheetValues[7]![386] = 4.5;
    sheetValues[7]![387] = 5;
    sheetValues[7]![388] = 0;
    runInContext(call, context);
    const legacyValues = snapshot.mock.calls[1]?.[0]?.values as unknown[][];
    expect(legacyValues[0]).toHaveLength(410);
    expect(legacyValues[4]?.[373]).toBe("Leaves This Month");
    expect(legacyValues[7]?.slice(373, 389)).toEqual([
      0.5,
      "",
      "",
      "",
      "",
      "",
      1,
      "",
      "",
      "",
      "",
      "",
      "",
      4.5,
      5,
      0,
    ]);
  });
});
