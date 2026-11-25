import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function script(statuses: number[] = []) {
  const properties: Record<string, string> = {
    WEBHOOK_URL: "https://hrdo.example/api/webhooks/sheets-sync",
    WEBHOOK_SECRET: "a".repeat(40),
    NON_TEACHING_SPREADSHEET_ID: "non_teaching_sheet",
    COLLEGE_SPREADSHEET_ID: "college_sheet",
    BASIC_ED_SPREADSHEET_ID: "basic_ed_sheet",
  };
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
  const everyMinutes = vi.fn(() => ({ create: vi.fn() }));
  const releaseLock = vi.fn();
  let id = 0;
  const context = createContext({
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (name: string) => properties[name] }),
    },
    SpreadsheetApp: {
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
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock }) },
    ScriptApp: {
      getProjectTriggers: () => [],
      newTrigger: () => ({ timeBased: () => ({ everyMinutes }) }),
    },
  });
  runInContext(readFileSync(resolve("scripts/Code.gs"), "utf8"), context);
  return { context, range, fetch, everyMinutes, releaseLock };
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
  it("installs a 15-minute trigger", () => {
    const s = script();
    runInContext("install15MinuteTrigger()", s.context);
    expect(s.everyMinutes).toHaveBeenCalledWith(15);
  });
});
