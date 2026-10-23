#!/usr/bin/env node
/**
 * One-time local database setup for Laragon MySQL/MariaDB.
 *
 * - Creates the database and a dedicated app user limited to SELECT/INSERT/UPDATE/DELETE
 *   on that one database (never uses the root account at runtime).
 * - Applies scripts/schema.sql.
 * - Writes credentials to .env (gitignored) and never prints the password.
 *
 * Root credentials are read from MYSQL_ROOT_USER / MYSQL_ROOT_PASSWORD if present,
 * otherwise Laragon's default root account without a password is used.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import mysql from "mysql2/promise";

const root = process.cwd();
const envPath = resolve(root, ".env");
const schemaPath = resolve(root, "scripts/schema.sql");

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const existing = readEnvFile(envPath);
const dbName = existing.DB_NAME || "loa_vrtt";
const dbUser = existing.DB_USER || "loa_vrtt";
const dbPassword = existing.DB_PASSWORD || randomBytes(24).toString("base64url");
const dbHost = existing.DB_HOST || "127.0.0.1";
const dbPort = Number(existing.DB_PORT || 3306);

const rootUser = process.env.MYSQL_ROOT_USER || "root";
const rootPassword = process.env.MYSQL_ROOT_PASSWORD || "";

if (!/^[A-Za-z0-9_]+$/.test(dbName) || !/^[A-Za-z0-9_]+$/.test(dbUser)) {
  console.error("DB_NAME and DB_USER may only contain letters, digits and underscores.");
  process.exit(1);
}
if (dbPassword.length < 20) {
  console.error("Refusing to use a weak DB_PASSWORD from .env (minimum 20 characters).");
  process.exit(1);
}

let conn;
try {
  conn = await mysql.createConnection({
    host: dbHost,
    port: dbPort,
    user: rootUser,
    password: rootPassword,
    multipleStatements: true,
  });

  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );

  for (const host of ["localhost", "127.0.0.1"]) {
    const account = `'${dbUser}'@'${host}'`;
    await conn.query(
      `CREATE USER IF NOT EXISTS ${account} IDENTIFIED BY ${conn.escape(dbPassword)}`,
    );
    await conn.query(`ALTER USER ${account} IDENTIFIED BY ${conn.escape(dbPassword)}`);
    await conn.query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${account}`).catch(() => {});
    await conn.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${dbName}\`.* TO ${account}`);
  }
  await conn.query("FLUSH PRIVILEGES");

  await conn.query("USE ??", [dbName]);
  await conn.query(readFileSync(schemaPath, "utf8"));
  for (const [table, column] of [
    ["users", "role"],
    ["request_signatures", "signer_role"],
    ["request_history", "actor_role"],
    ["request_returns", "by_role"],
  ]) {
    await conn.query(
      `ALTER TABLE \`${table}\` MODIFY \`${column}\`
       ENUM('requisitioner','transport_head','director','president','transport_staff','assistant','guard','driver','admin') NOT NULL`,
    );
  }
  const [proxySignerColumn] = await conn.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'request_signatures'
       AND COLUMN_NAME = 'proxy_signer_name'`,
    [dbName],
  );
  if (Number(proxySignerColumn[0]?.count ?? 0) === 0) {
    await conn.query(
      "ALTER TABLE request_signatures ADD COLUMN proxy_signer_name VARCHAR(120) NULL AFTER signer_role",
    );
  }
  const [assistantUserColumn] = await conn.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'signatory_assistants'
       AND COLUMN_NAME = 'assistant_user_id'`,
    [dbName],
  );
  if (Number(assistantUserColumn[0]?.count ?? 0) === 0) {
    await conn.query("ALTER TABLE signatory_assistants ADD COLUMN assistant_user_id CHAR(36) NULL");
  }
  const [assistantUserConstraint] = await conn.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'signatory_assistants'
       AND CONSTRAINT_NAME = 'signatory_assistants_user_fk'`,
    [dbName],
  );
  if (Number(assistantUserConstraint[0]?.count ?? 0) === 0) {
    await conn.query(
      `ALTER TABLE signatory_assistants
       ADD CONSTRAINT signatory_assistants_user_fk
       FOREIGN KEY (assistant_user_id) REFERENCES users (id) ON DELETE SET NULL`,
    );
  }
  const [registrationOtpNonceColumn] = await conn.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'registration_otps'
       AND COLUMN_NAME = 'send_nonce'`,
    [dbName],
  );
  if (Number(registrationOtpNonceColumn[0]?.count ?? 0) === 0) {
    await conn.query(
      "ALTER TABLE registration_otps ADD COLUMN send_nonce CHAR(36) NOT NULL DEFAULT '' AFTER code_hash",
    );
  }
} catch (error) {
  console.error("Database setup failed:", error?.code || "unknown error");
  console.error(
    "Check that Laragon MySQL is running and that MYSQL_ROOT_USER / MYSQL_ROOT_PASSWORD are correct.",
  );
  process.exit(1);
} finally {
  await conn?.end().catch(() => {});
}

const envContent = [
  "# Generated by scripts/setup-db.mjs — never commit this file.",
  `DB_HOST=${dbHost}`,
  `DB_PORT=${dbPort}`,
  `DB_NAME=${dbName}`,
  `DB_USER=${dbUser}`,
  `DB_PASSWORD=${dbPassword}`,
  `SITE_URL=${existing.SITE_URL || "http://localhost:8080"}`,
  `ALLOWED_EMAIL_DOMAINS=${existing.ALLOWED_EMAIL_DOMAINS || "loa.edu.ph,lyceumalabang.edu.ph"}`,
  `GA_MEASUREMENT_ID=${existing.GA_MEASUREMENT_ID || ""}`,
  `GOOGLE_CLIENT_ID=${existing.GOOGLE_CLIENT_ID || ""}`,
  `GOOGLE_CLIENT_SECRET=${existing.GOOGLE_CLIENT_SECRET || ""}`,
  `GOOGLE_REDIRECT_URI=${existing.GOOGLE_REDIRECT_URI || "http://localhost:8080/api/gmail-test/callback"}`,
  `GOOGLE_TEST_RECIPIENT=${existing.GOOGLE_TEST_RECIPIENT || ""}`,
  `GOOGLE_REFRESH_TOKEN=${existing.GOOGLE_REFRESH_TOKEN || ""}`,
  "",
].join("\n");

writeFileSync(envPath, envContent, { mode: 0o600 });

console.log("Database ready:", dbName);
console.log("App user:", `${dbUser}@localhost (SELECT/INSERT/UPDATE/DELETE on ${dbName} only)`);
console.log("Credentials written to .env (gitignored, not printed).");
console.log("Next: npm run db:seed");
