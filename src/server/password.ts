import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

function derive(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keylen,
      { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPassword(value: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(value, salt, SCRYPT.keylen);
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(value: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (
    !Number.isInteger(N) || N < 16384 || N > 131072 ||
    !Number.isInteger(r) || r < 8 || r > 16 ||
    !Number.isInteger(p) || p < 1 || p > 4
  ) {
    return false;
  }
  try {
    const salt = Buffer.from(parts[4]!, "base64url");
    const expected = Buffer.from(parts[5]!, "base64url");
    if (expected.length < 32 || expected.length > 128) return false;
    const actual = await new Promise<Buffer>((resolve, reject) => {
      scrypt(
        value,
        salt,
        expected.length,
        { N, r, p, maxmem: 128 * 1024 * 1024 },
        (error, key) => (error ? reject(error) : resolve(key)),
      );
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Used to keep sign-in timing similar when the email does not exist. */
export const DUMMY_HASH = (() => {
  const salt = Buffer.from("c2Vzc2lvbi1kdW1teS1zYWx0", "base64");
  const key = scryptSync("not-a-real-password", salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
})();
