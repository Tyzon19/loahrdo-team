import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

try {
  process.loadEnvFile(".env");
} catch {
  /* Environment may be provided by the host. */
}
const required = (key) => {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
  return process.env[key];
};
const connection = await mysql.createConnection({
  host: required("DB_HOST"),
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_MIGRATION_USER || required("DB_USER"),
  password: process.env.DB_MIGRATION_PASSWORD ?? process.env.DB_PASSWORD ?? "",
  database: required("DB_NAME"),
  multipleStatements: true,
});
try {
  for (const file of [
    "20261124-attendance-sheets-sync.sql",
    "20261124-attendance-portal-isolation.sql",
    "20261126-leave-requests.sql",
    "20261127-leave-working-day-calendar.sql",
  ]) {
    await connection.query(readFileSync(new URL(`./migrations/${file}`, import.meta.url), "utf8"));
  }
  console.log(
    "Attendance schema extension applied. Existing records and auth tables were preserved.",
  );
} finally {
  await connection.end();
}
