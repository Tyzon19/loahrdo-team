import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function script(statuses: number[] = [], singleTracker = false) {
  const properties: Record<string, string> = {
    WEBHOOK_URL: "https://hrdo.example/api/webhooks/sheets-sync",
    WEBHOOK_SECRET: "a".repeat(40),
    NON_TEACHING_SPREADSHEET_ID: "non_teaching_sheet",
    COLLEGE_SPREADSHEET_ID: "college_sheet",
    BASIC_ED_SPREADSHEET_ID: "basic_ed_sheet",
  };
  if (singleTracker) {
    delete properties["COLLEGE_SPREADSHEET_ID"];
    delete properties["BASIC_ED_SPREADSHEET_ID"];
  }
  const values = Array.from({ length: 8 }, () => Array(395).fill(""));
  values[0]![0] = 6;
  values[1]![0] = 2026;
  values[7]![0] = "EMPLOYEE, TEST";
  values[7]![386] = 4.5;
  const range = vi.fn(() => ({ getValues: () => values }));
  const fetch = vi.fn(() => ({
    getResponseCode: () => statuses.shift() ?? 200,
    getContentText: () => '{"ok":true}',
  }));
  const created: Array<{ handler: string; spreadsheetId: string; event: string }> = [];
  const deleted: string[] = [];
  const flush = vi.fn();
  const waitLock = vi.fn();
  const releaseLock = vi.fn();
  let id = 0;
  const context = createContext({
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (name: string) => properties[name] }),
    },
    SpreadsheetApp: {
      flush,
      openById: () => ({
        getSheetByName: () => ({ getLastRow: () => 8, getLastColumn: () => 395, getRange: range }),
      }),
    },
    UrlFetchApp: { fetch },
    Utilities: {
      getUuid: () => `snapshot-${id++}`,
      newBlob: (text: string) => ({ getBytes: () => Buffer.from(text) }),
      sleep: vi.fn(),
    },
    LockService: { getScriptLock: () => ({ waitLock, releaseLock }) },
    ScriptApp: {
      getProjectTriggers: () =>
        ["syncAllStaffGroupsNow", "hrdoSyncAttendanceNow", "unrelatedJob"].map((handler) => ({
          getHandlerFunction: () => handler,
        })),
      deleteTrigger: (trigger: { getHandlerFunction: () => string }) =>
        deleted.push(trigger.getHandlerFunction()),
      newTrigger: (handler: string) => ({
        forSpreadsheet: (spreadsheetId: string) => ({
          onEdit: () => ({ create: () => created.push({ handler, spreadsheetId, event: "edit" }) }),
          onChange: () => ({
            create: () => created.push({ handler, spreadsheetId, event: "change" }),
          }),
        }),
      }),
    },
  });
  runInContext(readFileSync(resolve("scripts/Code.gs"), "utf8"), context);
  return { context, properties, range, fetch, created, deleted, flush, waitLock, releaseLock };
}

describe("ready-to-paste Apps Script", () => {
  it("pushes three complete STAFF grids with the correct header, summaries and row positions", () => {
    const s = script();
    runInContext("syncAllStaffGroupsNow()", s.context);
    expect(s.fetch).toHaveBeenCalledTimes(3);
    expect(s.range).toHaveBeenCalledWith(1, 1, 8, 395);
    const payloads = s.fetch.mock.calls.map((args) => {
      const options = (args as unknown[])[1] as {
        headers: Record<string, string>;
        payload: string;
        followRedirects: boolean;
      };
      expect(options.headers["x-hrdo-webhook-secret"]).toBe("a".repeat(40));
      expect(options.followRedirects).toBe(false);
      return JSON.parse(options.payload);
    });
    expect(payloads.map((p) => p.departmentGroup)).toEqual(["NON_TEACHING", "COLLEGE", "BASIC_ED"]);
    expect(payloads[0].values[0][0]).toBe(6);
    expect(payloads[0].values[7][386]).toBe(4.5);
    expect(s.releaseLock).toHaveBeenCalledOnce();
  });
  it("retries the identical snapshot after a transient failure", () => {
    const s = script([500, 200]);
    runInContext("syncAllStaffGroupsNow()", s.context);
    expect(s.fetch).toHaveBeenCalledTimes(4);
    expect(s.fetch.mock.calls[0]).toEqual(s.fetch.mock.calls[1]);
  });
  it("replaces its scheduled sync with edit and structural-change triggers", () => {
    const s = script();
    runInContext("installRealtimeTriggers()", s.context);
    expect(s.created).toHaveLength(6);
    expect(s.created.map((trigger) => trigger.event)).toEqual([
      "edit",
      "change",
      "edit",
      "change",
      "edit",
      "change",
    ]);
    expect(s.deleted).toEqual(["syncAllStaffGroupsNow", "hrdoSyncAttendanceNow"]);
  });
  it("supports just the configured tracker during the realtime test", () => {
    const s = script([], true);
    runInContext("installRealtimeTriggers()", s.context);
    expect(s.created).toHaveLength(2);
    runInContext("syncAllStaffGroupsNow()", s.context);
    expect(s.fetch).toHaveBeenCalledOnce();
  });
  it("preserves the deployed HRDO webhook property names", () => {
    const s = script([], true);
    s.properties["HRDO_WEBHOOK_URL"] = s.properties["WEBHOOK_URL"]!;
    s.properties["HRDO_WEBHOOK_SECRET"] = s.properties["WEBHOOK_SECRET"]!;
    delete s.properties["WEBHOOK_URL"];
    delete s.properties["WEBHOOK_SECRET"];
    runInContext("syncAllStaffGroupsNow()", s.context);
    expect(s.fetch).toHaveBeenCalledOnce();
  });
  it("rejects one tracker ID assigned to two departments", () => {
    const s = script();
    s.properties["COLLEGE_SPREADSHEET_ID"] = s.properties["NON_TEACHING_SPREADSHEET_ID"]!;
    expect(() => runInContext("installRealtimeTriggers()", s.context)).toThrow("own tracker");
    expect(s.created).toHaveLength(0);
    expect(s.deleted).toHaveLength(0);
  });
  it("pushes the edited workbook immediately after flushing formulas", () => {
    const s = script();
    runInContext(
      "syncStaffEdit({source: {getId: function() {return 'non_teaching_sheet'}}})",
      s.context,
    );
    expect(s.fetch).toHaveBeenCalledOnce();
    expect(s.flush).toHaveBeenCalledOnce();
    expect(s.flush.mock.invocationCallOrder[0]).toBeLessThan(s.range.mock.invocationCallOrder[0]!);
    expect(s.waitLock).toHaveBeenCalledWith(30_000);
    expect(s.releaseLock).toHaveBeenCalledOnce();
  });
  it("syncs structural changes but avoids duplicate EDIT and FORMAT events", () => {
    const s = script();
    for (const changeType of ["EDIT", "FORMAT", "REMOVE_ROW"]) {
      s.context["changeType"] = changeType;
      runInContext(
        "syncStaffChange({changeType: changeType, source: {getId: function() {return 'college_sheet'}}})",
        s.context,
      );
    }
    expect(s.fetch).toHaveBeenCalledOnce();
  });
  it("ignores events outside the configured source workbooks", () => {
    const s = script();
    runInContext("syncStaffEdit({source: {getId: function() {return 'other_sheet'}}})", s.context);
    expect(s.fetch).not.toHaveBeenCalled();
  });
  it("pushes month-button changes, which do not fire spreadsheet edit triggers", () => {
    const sync = vi.fn();
    const setValue = vi.fn();
    const context = createContext({
      SpreadsheetApp: {
        getActiveSpreadsheet: () => ({
          getSheetByName: () => ({ getRange: () => ({ getValue: () => 5, setValue }) }),
        }),
      },
      syncStaffEdit: sync,
    });
    runInContext(readFileSync(resolve("scripts/TrackerNavigation.gs"), "utf8"), context);
    runInContext("PreviousMonth(); NextMonth();", context);
    expect(setValue.mock.calls).toEqual([[4], [6]]);
    expect(sync).toHaveBeenCalledTimes(2);
  });
  it("pins both month-navigation drawings in the frozen first column", () => {
    const previous = {
      getScript: () => "PreviousMonth",
      setAnchorCell: vi.fn(),
      setAnchorCellXOffset: vi.fn(),
      setAnchorCellYOffset: vi.fn(),
      setWidth: vi.fn(),
      setHeight: vi.fn(),
    };
    const next = {
      getScript: () => "NextMonth",
      setAnchorCell: vi.fn(),
      setAnchorCellXOffset: vi.fn(),
      setAnchorCellYOffset: vi.fn(),
      setWidth: vi.fn(),
      setHeight: vi.fn(),
    };
    const anchor = {};
    const sheet = { getImages: () => [previous, next], getRange: () => anchor };
    const context = createContext({
      SpreadsheetApp: {
        getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }),
      },
    });

    runInContext(readFileSync(resolve("scripts/TrackerNavigation.gs"), "utf8"), context);
    runInContext("pinMonthNavigationButtons()", context);

    expect(previous.setAnchorCell).toHaveBeenCalledWith(anchor);
    expect(previous.setAnchorCellXOffset).toHaveBeenCalledWith(8);
    expect(next.setAnchorCellXOffset).toHaveBeenCalledWith(207);
    expect(previous.setWidth).toHaveBeenCalledWith(30);
    expect(next.setHeight).toHaveBeenCalledWith(18);
  });
  it("does not reposition a partial set of month-navigation drawings", () => {
    const previous = { getScript: () => "PreviousMonth", setAnchorCell: vi.fn() };
    const sheet = { getImages: () => [previous] };
    const context = createContext({
      SpreadsheetApp: {
        getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }),
      },
    });

    runInContext(readFileSync(resolve("scripts/TrackerNavigation.gs"), "utf8"), context);

    expect(() => runInContext("pinMonthNavigationButtons()", context)).toThrow("NextMonth");
    expect(previous.setAnchorCell).not.toHaveBeenCalled();
  });
});
