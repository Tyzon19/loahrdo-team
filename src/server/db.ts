import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { serverEnv, serverEnvOptional } from "./env";

/**
 * MySQL access for TanStack Start server functions.
 * This module is only ever imported from server function handlers.
 */
let poolPromise: Promise<Pool> | undefined;

export async function getPool(): Promise<Pool> {
  if (typeof window !== "undefined") {
    throw new Error("Database access is server-only.");
  }
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
        connectionLimit: 5,
        maxIdle: 1,
        idleTimeout: 30_000,
        queueLimit: 20,
        charset: "utf8mb4",
        dateStrings: true,
        enableKeepAlive: true,
      });
    })();
  }
  return poolPromise;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void poolPromise?.then((pool) => pool.end()).catch((error: unknown) => {
      console.error(
        `[db] Failed to close the previous development pool: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    });
  });
}

export type Db = Pool | PoolConnection;

/** Always parameterised: values never become part of the SQL text. */
export async function all<T extends RowDataPacket[]>(
  sql: string,
  params: unknown[] = [],
  db?: Db,
): Promise<T> {
  const conn = db ?? (await getPool());
  const [rows] = await conn.query<T>(sql, params);
  return rows;
}

export async function run(
  sql: string,
  params: unknown[] = [],
  db?: Db,
): Promise<ResultSetHeader> {
  const conn = db ?? (await getPool());
  const [result] = await conn.query<ResultSetHeader>(sql, params);
  return result;
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

/** Escapes LIKE wildcards; the value itself is still sent as a bound parameter. */
export function likePattern(term: string) {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
