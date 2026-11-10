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
const ticketVerificationSecret =
  existing.TICKET_VERIFICATION_SECRET || randomBytes(32).toString("base64url");
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
if (ticketVerificationSecret.length < 32) {
  console.error(
    "Refusing to use a weak TICKET_VERIFICATION_SECRET from .env (minimum 32 characters).",
  );
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
  await conn.query(
    "ALTER TABLE hrdo_users MODIFY role ENUM('employee','hrdo_staff','hrdo_admin') NOT NULL DEFAULT 'employee'",
  );
  await conn.query(
    "ALTER TABLE hrdo_coe_history MODIFY actor_role ENUM('employee','hrdo_staff','hrdo_admin','system') NOT NULL",
  );
  await conn.query("ALTER TABLE vehicles MODIFY capacity INT NOT NULL DEFAULT 1");
  const [coeDocumentMimeColumn] = await conn.query(
    `SELECT CHARACTER_MAXIMUM_LENGTH AS maxLength
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'hrdo_coe_documents' AND COLUMN_NAME = 'mime'`,
    [dbName],
  );
  if (coeDocumentMimeColumn.length && Number(coeDocumentMimeColumn[0]?.maxLength ?? 0) < 255) {
    await conn.query(
      "ALTER TABLE hrdo_coe_documents MODIFY mime VARCHAR(255) NOT NULL DEFAULT 'application/pdf'",
    );
  }
  await conn.query(
    "UPDATE hrdo_users SET role = 'hrdo_admin' WHERE email = 'hrdo_admin@lyceumalabang.edu.ph' AND role = 'hrdo_staff'",
  );
  await conn.query(
    `ALTER TABLE request_history MODIFY type
     ENUM('submitted','updated','signed','returned','resubmitted','approved','dispatch','completed') NOT NULL`,
  );
  await conn.query(
    `ALTER TABLE notifications MODIFY kind
     ENUM('action_review','action_recommend','action_approve','returned','approved_requester','approved_transport','trip_ticket_reminder') NOT NULL`,
  );
  for (const [table, column, definition] of [
    ["vehicles", "driver_name", "VARCHAR(120) NOT NULL DEFAULT '' AFTER id"],
    ["users", "phone_number", "VARCHAR(32) NULL"],
    ["hrdo_users", "is_external", "TINYINT(1) NOT NULL DEFAULT 0 AFTER role"],
    ["notifications", "email_status", "ENUM('pending','sent','failed') NULL"],
    ["notifications", "email_error", "VARCHAR(500) NULL"],
  ]) {
    const [existingColumn] = await conn.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [dbName, table, column],
    );
    if (Number(existingColumn[0]?.count ?? 0) === 0) {
      await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    }
  }
  const [transportMainAssignment] = await conn.query(
    `SELECT a.user_id AS userId
     FROM main_signatory_assignments a
     JOIN users u ON u.id = a.user_id
     WHERE a.stage_key = 'recommend' AND u.role = 'transport_head'
       AND NOT EXISTS (
         SELECT 1 FROM main_signatory_assignments existing_assignment
         WHERE existing_assignment.stage_key = 'review'
       )
     LIMIT 1`,
  );
  if (transportMainAssignment.length) {
    await conn.query(
      `UPDATE main_signatory_assignments
       SET stage_key = 'review'
       WHERE stage_key = 'recommend' AND user_id = ?`,
      [transportMainAssignment[0].userId],
    );
  }
  if (transportMainAssignment.length) {
    const [transportAlternateAssignment] = await conn.query(
      `SELECT recommend.assistant_name AS assistantName,
              recommend.assistant_user_id AS assistantUserId,
              review.stage_key AS reviewStage
       FROM signatory_assistants recommend
       LEFT JOIN signatory_assistants review ON review.stage_key = 'review'
       WHERE recommend.stage_key = 'recommend'
         AND recommend.assistant_user_id IS NOT NULL
         AND (review.stage_key IS NULL OR review.assistant_user_id IS NULL)
       LIMIT 1`,
    );
    if (transportAlternateAssignment.length) {
      const assignment = transportAlternateAssignment[0];
      if (assignment.reviewStage) {
        await conn.query(
          `UPDATE signatory_assistants
           SET assistant_name = ?, assistant_user_id = ?
           WHERE stage_key = 'review'`,
          [assignment.assistantName, assignment.assistantUserId],
        );
        await conn.query(
          `UPDATE signatory_assistants
           SET assistant_name = '', assistant_user_id = NULL
           WHERE stage_key = 'recommend'`,
        );
      } else {
        await conn.query(
          `UPDATE signatory_assistants
           SET stage_key = 'review'
           WHERE stage_key = 'recommend'`,
        );
      }
    }
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
  await conn.query("ALTER TABLE request_signatures MODIFY signer_id CHAR(36) NULL");
  const [signatureSignerConstraint] = await conn.query(
    `SELECT DELETE_RULE AS deleteRule
     FROM information_schema.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'request_signatures'
       AND CONSTRAINT_NAME = 'request_signatures_signer_fk'`,
    [dbName],
  );
  if (signatureSignerConstraint[0]?.deleteRule !== "SET NULL") {
    if (signatureSignerConstraint.length) {
      await conn.query(
        "ALTER TABLE request_signatures DROP FOREIGN KEY request_signatures_signer_fk",
      );
    }
    await conn.query(
      `ALTER TABLE request_signatures
       ADD CONSTRAINT request_signatures_signer_fk
       FOREIGN KEY (signer_id) REFERENCES users (id) ON DELETE SET NULL`,
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
  const [coeColumnRows] = await conn.query(
    `SELECT COLUMN_NAME AS columnName
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'hrdo_coe_requests'`,
    [dbName],
  );
  const coeColumns = new Set(coeColumnRows.map((row) => String(row.columnName)));
  const [coeStatusColumn] = await conn.query(
    `SELECT COLUMN_TYPE AS columnType
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'hrdo_coe_requests' AND COLUMN_NAME = 'status'`,
    [dbName],
  );
  const coeStatusEnum =
    "ENUM('pending','under_review','correction_requested','processing','awaiting_review','ready_for_pickup','released','rejected')";
  if (coeColumns.size && !String(coeStatusColumn[0]?.columnType ?? "").includes("'released'")) {
    // Map the previous four-state workflow onto the expanded lifecycle before narrowing the enum.
    await conn.query(
      `UPDATE hrdo_coe_requests
       SET status = CASE status
         WHEN 'approved' THEN 'ready_for_pickup'
         WHEN 'pending' THEN 'pending'
         WHEN 'processing' THEN 'processing'
         ELSE 'rejected'
       END`,
    );
    await conn.query(
      `ALTER TABLE hrdo_coe_requests MODIFY status ${coeStatusEnum} NOT NULL DEFAULT 'pending'`,
    );
  }
  if (
    coeColumns.size &&
    !String(coeStatusColumn[0]?.columnType ?? "").includes("'awaiting_review'")
  ) {
    await conn.query(
      `ALTER TABLE hrdo_coe_requests MODIFY status ${coeStatusEnum} NOT NULL DEFAULT 'pending'`,
    );
  }
  const [coeHistoryTypeColumn] = await conn.query(
    `SELECT COLUMN_TYPE AS columnType
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'hrdo_coe_history' AND COLUMN_NAME = 'type'`,
    [dbName],
  );
  if (
    coeHistoryTypeColumn.length &&
    !String(coeHistoryTypeColumn[0]?.columnType ?? "").includes("'viewed'")
  ) {
    await conn.query(
      `ALTER TABLE hrdo_coe_history MODIFY type ENUM('submitted','viewed','verified','correction_requested','resubmitted','processing','template_sent','document_uploaded','ready_for_pickup','released','rejected') NOT NULL`,
    );
  }
  for (const [column, definition] of [
    ["employee_number", "VARCHAR(40) NOT NULL DEFAULT '' AFTER employee_email"],
    ["copy_type", "ENUM('soft','original','both') NOT NULL DEFAULT 'original' AFTER note"],
    ["correction_message", "TEXT NULL AFTER remarks"],
    ["deadline_at", "DATETIME NULL AFTER correction_message"],
    ["verified_at", "DATETIME NULL AFTER deadline_at"],
    ["verified_by_name", "VARCHAR(120) NULL AFTER verified_at"],
    ["correction_requested_at", "DATETIME NULL AFTER verified_by_name"],
    ["finalized_at", "DATETIME NULL AFTER correction_requested_at"],
    ["ready_at", "DATETIME NULL AFTER finalized_at"],
    ["released_at", "DATETIME NULL AFTER ready_at"],
    ["released_by_name", "VARCHAR(120) NULL AFTER released_at"],
    ["received_by_name", "VARCHAR(120) NULL AFTER released_by_name"],
    ["email_thread_id", "VARCHAR(255) NULL AFTER received_by_name"],
  ]) {
    if (coeColumns.size && !coeColumns.has(column)) {
      await conn.query(`ALTER TABLE hrdo_coe_requests ADD COLUMN \`${column}\` ${definition}`);
    }
  }
  if (coeColumns.size) {
    await conn.query(
      "UPDATE hrdo_coe_requests SET deadline_at = DATE_ADD(requested_at, INTERVAL 3 DAY) WHERE deadline_at IS NULL",
    );
    await conn.query("ALTER TABLE hrdo_coe_requests MODIFY deadline_at DATETIME NOT NULL");
    const [coeDeadlineIndex] = await conn.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'hrdo_coe_requests'
         AND INDEX_NAME = 'hrdo_coe_deadline_idx'`,
      [dbName],
    );
    if (Number(coeDeadlineIndex[0]?.count ?? 0) === 0) {
      await conn.query(
        "ALTER TABLE hrdo_coe_requests ADD INDEX hrdo_coe_deadline_idx (deadline_at)",
      );
    }
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
  for (const [table, index, definition] of [
    ["requests", "requests_status_date_idx", "(status, date_start, submitted_at)"],
    ["requests", "requests_date_submitted_idx", "(date_start, submitted_at)"],
    ["hrdo_coe_requests", "hrdo_coe_requested_idx", "(requested_at, status)"],
  ]) {
    const [indexRows] = await conn.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [dbName, table, index],
    );
    if (Number(indexRows[0]?.count ?? 0) === 0) {
      await conn.query(`ALTER TABLE \`${table}\` ADD INDEX \`${index}\` ${definition}`);
    }
  }
  for (const [table, column, definition] of [
    ["request_history", "actor_id", "CHAR(36) NULL AFTER attempt"],
    ["request_returns", "by_id", "CHAR(36) NULL AFTER stage"],
  ]) {
    const [columnRows] = await conn.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [dbName, table, column],
    );
    if (Number(columnRows[0]?.count ?? 0) === 0) {
      await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    }
  }
  for (const [table, constraint, definition] of [
    [
      "request_history",
      "request_history_actor_fk",
      "FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL",
    ],
    [
      "request_returns",
      "request_returns_actor_fk",
      "FOREIGN KEY (by_id) REFERENCES users (id) ON DELETE SET NULL",
    ],
  ]) {
    const [constraintRows] = await conn.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.TABLE_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
      [dbName, table, constraint],
    );
    if (Number(constraintRows[0]?.count ?? 0) === 0) {
      await conn.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraint}\` ${definition}`);
    }
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
  `DB_CONNECTION_LIMIT=${existing.DB_CONNECTION_LIMIT || "5"}`,
  `DB_MAX_IDLE=${existing.DB_MAX_IDLE || "5"}`,
  `DB_IDLE_TIMEOUT_MS=${existing.DB_IDLE_TIMEOUT_MS || "30000"}`,
  `DB_QUEUE_LIMIT=${existing.DB_QUEUE_LIMIT || "20"}`,
  `DB_SLOW_QUERY_MS=${existing.DB_SLOW_QUERY_MS || "1000"}`,
  `TICKET_VERIFICATION_SECRET=${ticketVerificationSecret}`,
  `SITE_URL=${existing.SITE_URL || "http://localhost:8080"}`,
  `ALLOWED_EMAIL_DOMAINS=${existing.ALLOWED_EMAIL_DOMAINS || "loa.edu.ph,lyceumalabang.edu.ph"}`,
  `GA_MEASUREMENT_ID=${existing.GA_MEASUREMENT_ID || ""}`,
  `GOOGLE_CLIENT_ID=${existing.GOOGLE_CLIENT_ID || ""}`,
  `GOOGLE_CLIENT_SECRET=${existing.GOOGLE_CLIENT_SECRET || ""}`,
  `GOOGLE_REDIRECT_URI=${existing.GOOGLE_REDIRECT_URI || "http://localhost:8080/api/gmail/callback"}`,
  `GOOGLE_SIGNIN_REDIRECT_URI=${existing.GOOGLE_SIGNIN_REDIRECT_URI || "http://localhost:8080/api/auth/google/callback"}`,
  `GOOGLE_SENDER_EMAIL=${existing.GOOGLE_SENDER_EMAIL || "markjosephturingan4@gmail.com"}`,
  `GOOGLE_REFRESH_TOKEN=${existing.GOOGLE_REFRESH_TOKEN || ""}`,
  "",
].join("\n");

writeFileSync(envPath, envContent, { mode: 0o600 });

console.log("Database ready:", dbName);
console.log("App user:", `${dbUser}@localhost (SELECT/INSERT/UPDATE/DELETE on ${dbName} only)`);
console.log("Credentials written to .env (gitignored, not printed).");
console.log("Next: npm run db:seed");
