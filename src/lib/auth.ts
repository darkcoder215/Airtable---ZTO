// Real authentication backed by app_users in Supabase.
//
// Threat model + design choices:
// • Passwords are stored as `scrypt$<saltHex>$<keyHex>` using Node's built-in
//   crypto.scryptSync — no third-party bcrypt dependency, constant-time
//   verification via crypto.timingSafeEqual.
// • Session tokens are signed with HMAC-SHA256 using AUTH_SECRET. Format:
//   `<base64url(payload)>.<hex(hmac)>`. The previous implementation just
//   base64'd a JSON blob — anyone could craft `{userId:"1"}` and become
//   admin. The new format rejects any token whose HMAC doesn't recompute,
//   in constant time.
// • Cookies on the wire are HttpOnly + SameSite=lax + Secure (in prod).
// • Login attempts are persisted to auth_attempts with timestamps so the
//   route can throttle by (username, ip) without keeping per-process state.
// • All password / username comparisons are case-insensitive on username
//   thanks to the citext column type.

import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type AppUserRow = Database["public"]["Tables"]["app_users"]["Row"];

export type Role = "admin" | "editor" | "viewer";

// Public user shape — no password material ever leaves the server.
export interface SafeUser {
  id: string;
  username: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

const SCRYPT_N = 16384; // 2^14 — ~50ms on a typical Vercel serverless cold start
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

// ---------------------------------------------------------------------------
// Password hashing
// ---------------------------------------------------------------------------

export function hashPassword(password: string): string {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("password must be at least 8 characters");
  }
  if (password.length > 256) {
    throw new Error("password too long");
  }
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[1], "hex");
    expected = Buffer.from(parts[2], "hex");
  } catch {
    return false;
  }
  if (expected.length !== SCRYPT_KEYLEN) return false;
  let actual: Buffer;
  try {
    actual = scryptSync(password, salt, SCRYPT_KEYLEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    });
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------------------
// Signed session tokens (HMAC-SHA256)
// ---------------------------------------------------------------------------

interface TokenPayload {
  uid: string;
  iat: number; // ms
  exp: number; // ms
}

function getAuthSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set a 32+ character random string."
    );
  }
  return s;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Buffer {
  const pad = (4 - (s.length % 4)) % 4;
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad), "base64");
}

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function createSessionToken(userId: string): string {
  const payload: TokenPayload = {
    uid: userId,
    iat: Date.now(),
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = createHmac("sha256", getAuthSecret()).update(body).digest("hex");
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string): { userId: string } | null {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const idx = token.lastIndexOf(".");
  const body = token.slice(0, idx);
  const sigHex = token.slice(idx + 1);
  if (!body || !sigHex) return null;
  let provided: Buffer;
  try {
    provided = Buffer.from(sigHex, "hex");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", getAuthSecret()).update(body).digest();
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;
  let payload: TokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8")) as TokenPayload;
  } catch {
    return null;
  }
  if (typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
  if (Date.now() >= payload.exp) return null;
  return { userId: payload.uid };
}

// ---------------------------------------------------------------------------
// User mapping + lookup
// ---------------------------------------------------------------------------

function mapUser(r: AppUserRow): SafeUser {
  return {
    id: r.id,
    username: r.username,
    email: r.email,
    name: r.name,
    role: (r.role as Role) ?? "viewer",
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastLoginAt: r.last_login_at,
  };
}

export async function getUserById(id: string): Promise<SafeUser | null> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("app_users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getUserById: ${error.message}`);
  if (!data) return null;
  if (!data.is_active) return null;
  return mapUser(data);
}

// Authenticate a username/password pair against the DB. Returns a SafeUser
// on success and null on every other path — same response shape so callers
// can't distinguish "no such user" from "wrong password" by timing.
export async function authenticateUser(
  username: string,
  password: string
): Promise<SafeUser | null> {
  if (typeof username !== "string" || typeof password !== "string") return null;
  const u = username.trim();
  if (!u || u.length > 64) return null;

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("app_users")
    .select("*")
    .ilike("username", u)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    // Don't leak DB errors via the auth surface.
    return null;
  }

  // Always run the scrypt verify even when no user matched — this stops a
  // timing attack that distinguishes "username doesn't exist" from
  // "username exists, password wrong".
  const stored =
    data?.password_hash ??
    "scrypt$00000000000000000000000000000000$" + "0".repeat(SCRYPT_KEYLEN * 2);
  const ok = verifyPassword(password, stored);
  if (!ok || !data) return null;

  return mapUser(data);
}

export async function touchLastLogin(userId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return;
  const sb = getSupabaseAdmin();
  await sb
    .from("app_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", userId);
}

// ---------------------------------------------------------------------------
// Login throttle helpers
// ---------------------------------------------------------------------------

export interface ThrottleVerdict {
  allowed: boolean;
  retryAfterSec: number;
}

const THROTTLE_WINDOW_SEC = 15 * 60; // 15 minutes
const THROTTLE_MAX_FAILS = 8;

export async function recordAuthAttempt(args: {
  username: string;
  ip: string | null;
  succeeded: boolean;
}): Promise<void> {
  const sb = getSupabaseAdmin();
  await sb.from("auth_attempts").insert({
    username: args.username.slice(0, 64),
    ip: args.ip,
    succeeded: args.succeeded,
  });
}

export async function checkAuthThrottle(
  username: string
): Promise<ThrottleVerdict> {
  const sb = getSupabaseAdmin();
  const since = new Date(Date.now() - THROTTLE_WINDOW_SEC * 1000).toISOString();
  const { count, error } = await sb
    .from("auth_attempts")
    .select("id", { count: "exact", head: true })
    .ilike("username", username.trim().slice(0, 64))
    .eq("succeeded", false)
    .gte("attempted_at", since);
  if (error) return { allowed: true, retryAfterSec: 0 };
  const fails = count ?? 0;
  if (fails < THROTTLE_MAX_FAILS) return { allowed: true, retryAfterSec: 0 };
  return { allowed: false, retryAfterSec: THROTTLE_WINDOW_SEC };
}

// ---------------------------------------------------------------------------
// First-run admin seed — creates the initial admin from env if no admin
// exists yet. Safe to call repeatedly; it's a no-op once an admin is present.
// ---------------------------------------------------------------------------

let seedAttempted = false;

export async function ensureAdminSeeded(): Promise<void> {
  if (seedAttempted) return;
  seedAttempted = true;
  try {
    const sb = getSupabaseAdmin();
    const { count } = await sb
      .from("app_users")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true);
    if ((count ?? 0) > 0) return;

    const username = (process.env.ADMIN_USERNAME ?? "").trim();
    const email = (process.env.ADMIN_EMAIL ?? "").trim();
    const password = process.env.ADMIN_PASSWORD ?? "";
    const name = (process.env.ADMIN_NAME ?? "Administrator").trim();
    if (!username || !email || password.length < 8) {
      // Allow the auth route to surface a useful error; don't crash on import.
      return;
    }
    await sb.from("app_users").insert({
      username,
      email,
      name,
      role: "admin",
      is_active: true,
      password_hash: hashPassword(password),
    });
  } catch {
    // Never throw from a side-effect path; logging is the route's job.
  }
}
