import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { serverEnv, serverEnvOptional } from "./env";

const DB_CONNECTION_LIMIT = 5;

const globalForDb = globalThis as typeof globalThis & {
  __loaDbPoolPromise?: Promise<Pool>;
};

function slowQueryThresholdMs() {
  const raw = serverEnvOptional("DB_SLOW_QUERY_MS");
  if (!raw) return 500;

  const threshold = Number(raw);
  if (!Number.isInteger(threshold) || threshold < 50 || threshold > 60_000) {
    throw new Error("DB_SLOW_QUERY_MS must be an integer between 50 and 60000.");
  }
  return threshold;
}

function logSlowQuery(sql: string, startedAt: number, thresholdMs: number) {
  const durationMs = Date.now() - startedAt;
  if (durationMs < thresholdMs) return;

  const fingerprint = sql.replace(/\s+/g, " ").trim().slice(0, 180);
  console.warn(`[db] Slow query (${durationMs}ms): ${fingerprint}`);
}

export async function getPool(): Promise<Pool> {
  if (typeof window !== "undefined") {
    throw new Error("Database access is server-only.");
  }
  let poolPromise = globalForDb.__loaDbPoolPromise;
  if (!poolPromise) {
    poolPromise = (async () => {
      const mysql = await import("mysql2/promise");
      return mysql.createPool({
        host: serverEnv("DB_HOST"),
        port: Number(serverEnvOptional("DB_PORT") ?? 3306),
        user: serverEnv("DB_USER"),
        password: serverEnv("DB_PASSWORD"),
        database: serverEnv("DB_NAME"),
        waitForConnections: true,
        connectionLimit: DB_CONNECTION_LIMIT,
        maxIdle: DB_CONNECTION_LIMIT,
        idleTimeout: 30_000,
        queueLimit: 20,
        charset: "utf8mb4",
        dateStrings: true,
        enableKeepAlive: true,
      });
    })();
    globalForDb.__loaDbPoolPromise = poolPromise;
  }
  try {
    return await poolPromise;
  } catch (error) {
    if (globalForDb.__loaDbPoolPromise === poolPromise) {
      delete globalForDb.__loaDbPoolPromise;
    }
    throw error;
  }
}

export type Db = Pool | PoolConnection;

export async function all<T extends RowDataPacket[]>(
  sql: string,
  params: unknown[] = [],
  db?: Db,
): Promise<T> {
  const conn = db ?? (await getPool());
  const thresholdMs = slowQueryThresholdMs();
  const startedAt = Date.now();
  try {
    const [rows] = await conn.query<T>(sql, params);
    return rows;
  } finally {
    logSlowQuery(sql, startedAt, thresholdMs);
  }
}

export async function run(sql: string, params: unknown[] = [], db?: Db): Promise<ResultSetHeader> {
  const conn = db ?? (await getPool());
  const thresholdMs = slowQueryThresholdMs();
  const startedAt = Date.now();
  try {
    const [result] = await conn.query<ResultSetHeader>(sql, params);
    return result;
  } finally {
    logSlowQuery(sql, startedAt, thresholdMs);
  }
}

export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const pool = await getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}

export function likePattern(term: string) {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
