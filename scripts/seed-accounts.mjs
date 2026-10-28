import { readFileSync, existsSync } from "node:fs";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { resolve } from "node:path";
import mysql from "mysql2/promise";

const envPath = resolve(process.cwd(), ".env");
if (!existsSync(envPath)) {
  console.error(".env not found. Run `npm run db:setup` first.");
  process.exit(1);
}
const env = {};
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

function makePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^*";
  let out = "";
  const bytes = randomBytes(20);
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out.slice(0, 20)}Aa1!`;
}

const accounts = [
  {
    name: "PFMO Administrator",
    email: "admin@loa.edu.ph",
    role: "admin",
    department: "Physical Facilities Management Office",
  },
  {
    name: "LOA Administrator",
    email: "admin@lyceumalabang.edu.ph",
    role: "admin",
    department: "Physical Facilities Management Office",
  },
  {
    name: "HRDO Administrator",
    email: "hrdo_admin@lyceumalabang.edu.ph",
    role: "hrdo_staff",
    department: "Human Resources Development Office",
    table: "hrdo_users",
  },
  {
    name: "COE CEO",
    email: "ceo@loa.edu.ph",
    role: "hrdo_staff",
    department: "Office of the President",
    table: "hrdo_users",
  },
  {
    name: "HRDO Administrator",
    email: "admin.hrdo@loa.edu.ph",
    role: "hrdo_staff",
    department: "Human Resources Development Office",
    table: "hrdo_users",
  },
  {
    name: "HRDO HR Officer",
    email: "hr@loa.edu.ph",
    role: "hrdo_staff",
    department: "Human Resources Development Office",
    table: "hrdo_users",
  },
  {
    name: "COE Employee User",
    email: "employee@loa.edu.ph",
    role: "employee",
    department: "Human Resources Development Office",
    table: "hrdo_users",
  },
];

const conn = await mysql.createConnection({
  host: env.DB_HOST,
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
});

try {
  await conn.query(
    `INSERT IGNORE INTO doc_config
      (id, institution, certification, office, title, doc_no, revision_no, effective_date)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "LYCEUM OF ALABANG INC.",
      "ISO 9001:2015 Certified",
      "PHYSICAL FACILITIES MANAGEMENT OFFICE",
      "VEHICLE RESERVATION AND TRIP TICKET",
      "LOA-PFMO-VRTT-001",
      "02",
      "2026-05-11",
    ],
  );

  const created = [];
  for (const account of accounts) {
    const tableName = account.table ?? "users";
    const [rows] = await conn.query(`SELECT id FROM ${tableName} WHERE email = ?`, [account.email]);
    if (rows.length) {
      created.push({ ...account, table: tableName, password: null });
      continue;
    }
    const password = makePassword();
    await conn.query(
      `INSERT INTO ${tableName} (id, name, email, password_hash, role, department, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [
        randomUUID(),
        account.name,
        account.email,
        hashPassword(password),
        account.role,
        account.department,
      ],
    );
    created.push({ ...account, table: tableName, password });
  }

  console.log("\nInitial application accounts ready.\n");
  for (const a of created) {
    console.log(`- ${a.table ?? "users"}`.padEnd(12) + ` ${a.role.padEnd(15)} ${a.email}`);
    if (a.password) {
      console.log(`  initial password: ${a.password}`);
      console.log("  (shown once — store it in your password manager; change on first sign-in)");
    } else {
      console.log("  already exists — password left unchanged");
    }
  }
  console.log("\nSignatory accounts must be created and assigned by an administrator.");
  console.log("No demo requests or vehicles were created.");
} finally {
  await conn.end();
}
