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
Object.assign(env, process.env);

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
    email: "superadmin@lyceumalabang.edu.ph",
    role: "admin",
    department: "Physical Facilities Management Office",
    isSuperAdmin: true,
  },
  {
    name: "HRDO Director",
    email: "hrdirector@lyceumalabang.edu.ph",
    role: "department_head",
    department: "Human Resources Development Office",
    passwordEnv: "PERMISSION_HEAD_PASSWORD",
    mustChangePassword: 0,
  },
  {
    name: "HRDO Administrator",
    email: "hrdo_admin@lyceumalabang.edu.ph",
    role: "hrdo_admin",
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

  const legacySuperAdminEmail = "admin@lyceumalabang.edu.ph";
  const superAdminEmail = "superadmin@lyceumalabang.edu.ph";
  const [legacySuperAdmins] = await conn.query(
    "SELECT id FROM users WHERE email = ? AND is_super_admin = 1 LIMIT 1",
    [legacySuperAdminEmail],
  );
  const [currentSuperAdmins] = await conn.query("SELECT id FROM users WHERE email = ? LIMIT 1", [
    superAdminEmail,
  ]);
  if (legacySuperAdmins.length && currentSuperAdmins.length) {
    throw new Error(
      `Cannot rename ${legacySuperAdminEmail}; ${superAdminEmail} already belongs to another account.`,
    );
  }
  if (legacySuperAdmins.length) {
    await conn.query("UPDATE users SET email = ? WHERE id = ?", [
      superAdminEmail,
      legacySuperAdmins[0].id,
    ]);
  }

  const created = [];
  for (const account of accounts) {
    const tableName = account.table ?? "users";
    const [rows] = await conn.query(`SELECT id FROM ${tableName} WHERE email = ?`, [account.email]);
    if (rows.length) {
      if (account.isSuperAdmin && tableName === "users") {
        await conn.query("UPDATE users SET is_super_admin = 1 WHERE email = ?", [account.email]);
      }
      if (account.role === "department_head" && tableName === "users") {
        const existingPassword = account.passwordEnv ? env[account.passwordEnv] : undefined;
        if (existingPassword) {
          await conn.query(
            "UPDATE users SET role = ?, department = ?, password_hash = ?, must_change_password = ? WHERE email = ?",
            [
              account.role,
              account.department,
              hashPassword(existingPassword),
              account.mustChangePassword ?? 0,
              account.email,
            ],
          );
        } else {
          await conn.query(
            "UPDATE users SET role = ?, department = ?, must_change_password = ? WHERE email = ?",
            [account.role, account.department, account.mustChangePassword ?? 0, account.email],
          );
        }
      }
      created.push({ ...account, table: tableName, password: null });
      continue;
    }
    const passwordFromEnv = account.passwordEnv ? env[account.passwordEnv] : undefined;
    const password = passwordFromEnv || makePassword();
    const mustChangePassword = account.mustChangePassword ?? 1;
    if (tableName === "users") {
      await conn.query(
        `INSERT INTO users
          (id, name, email, password_hash, role, department, must_change_password, is_super_admin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          account.name,
          account.email,
          hashPassword(password),
          account.role,
          account.department,
          mustChangePassword,
          account.isSuperAdmin ? 1 : 0,
        ],
      );
    } else {
      await conn.query(
        `INSERT INTO ${tableName} (id, name, email, password_hash, role, department, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          account.name,
          account.email,
          hashPassword(password),
          account.role,
          account.department,
          mustChangePassword,
        ],
      );
    }
    created.push({
      ...account,
      table: tableName,
      password,
      passwordFromEnv: Boolean(passwordFromEnv),
    });
  }
  const [permissionSignatoryCount] = await conn.query(
    "SELECT COUNT(*) AS count FROM permission_slip_signatories",
  );
  if (Number(permissionSignatoryCount[0]?.count ?? 0) === 0) {
    await conn.query(
      `INSERT IGNORE INTO permission_slip_signatories (user_id)
       SELECT id FROM users WHERE email = ? AND role = 'department_head'`,
      ["hrdirector@lyceumalabang.edu.ph"],
    );
  }
  console.log("\nInitial application accounts ready.\n");
  for (const a of created) {
    console.log(`- ${a.table ?? "users"}`.padEnd(12) + ` ${a.role.padEnd(15)} ${a.email}`);
    if (a.password && !a.passwordFromEnv) {
      console.log(`  initial password: ${a.password}`);
      console.log("  (shown once — store it in your password manager; change on first sign-in)");
    } else if (a.passwordFromEnv) {
      console.log("  password supplied through the configured environment variable");
    } else {
      console.log("  already exists — password left unchanged");
    }
  }
  console.log("\nSignatory accounts must be created and assigned by an administrator.");
  console.log("No demo requests or vehicles were created.");
} finally {
  await conn.end();
}
