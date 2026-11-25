// Runs acceptance tests against a disposable database, never the configured app DB.
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const name = `loa_attendance_test_${randomBytes(8).toString("hex")}`;
const host = process.env.ATTENDANCE_TEST_DB_HOST || "127.0.0.1";
const port = process.env.ATTENDANCE_TEST_DB_PORT || "3306";
const user = process.env.ATTENDANCE_TEST_DB_USER || "root";
const password = process.env.ATTENDANCE_TEST_DB_PASSWORD || "";
const root = await mysql.createConnection({
  host,
  port: Number(port),
  user,
  password,
  multipleStatements: true,
});
let result = 1;
try {
  await root.query(
    `CREATE DATABASE ${mysql.escapeId(name)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await root.changeUser({ database: name });
  await root.query(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  // Applying the extension again must be safe for an existing installation.
  await root.query(
    readFileSync(
      new URL("./migrations/20261124-attendance-sheets-sync.sql", import.meta.url),
      "utf8",
    ),
  );
  result =
    spawnSync(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--config",
        "vitest.attendance.config.ts",
        "--maxWorkers=1",
      ],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          ATTENDANCE_TEST_DB_SAFE: "1",
          DB_HOST: host,
          DB_PORT: port,
          DB_USER: user,
          DB_PASSWORD: password,
          DB_NAME: name,
          HRDO_SHEETS_WEBHOOK_SECRET: "test-secret-for-attendance-only-1234567890",
          LATE_ABSENCES_NON_TEACHING_SPREADSHEET_ID: "test_non_teaching_spreadsheet_123456789",
          LATE_ABSENCES_COLLEGE_SPREADSHEET_ID: "test_college_spreadsheet_123456789",
          LATE_ABSENCES_BASIC_ED_SPREADSHEET_ID: "test_basic_ed_spreadsheet_123456789",
        },
      },
    ).status ?? 1;
} finally {
  if (!/^loa_attendance_test_[a-f0-9]{16}$/.test(name))
    throw new Error("Unsafe test database name");
  await root.query(`DROP DATABASE IF EXISTS ${mysql.escapeId(name)}`);
  await root.end();
}
process.exitCode = result;
