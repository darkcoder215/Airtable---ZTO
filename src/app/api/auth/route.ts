// Login + session-introspection endpoint.
//
// Hardening notes:
// • POST validates body shape, throttles by username (8 fails / 15 min) via
//   the auth_attempts table, runs a constant-time scrypt verify even when
//   the username doesn't exist (no user-enumeration via timing), and sets
//   an HttpOnly + SameSite=lax + (in prod) Secure cookie carrying an
//   HMAC-signed token.
// • GET returns the current user when the cookie is valid.
// • DELETE clears the cookie and audit-logs the logout.

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateUser,
  createSessionToken,
  verifySessionToken,
  getUserById,
  ensureAdminSeeded,
  recordAuthAttempt,
  checkAuthThrottle,
  touchLastLogin,
} from "@/lib/auth";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getClientIp(request: NextRequest): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}

function setSessionCookie(response: NextResponse, token: string) {
  const isProd = process.env.NODE_ENV === "production";
  response.cookies.set("session", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 86400,
  });
}

function clearSessionCookie(response: NextResponse) {
  response.cookies.set("session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function POST(request: NextRequest) {
  await ensureAdminSeeded();

  let body: { username?: unknown; password?: unknown };
  try {
    body = (await request.json()) as { username?: unknown; password?: unknown };
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) {
    return NextResponse.json(
      { error: "اسم المستخدم وكلمة المرور مطلوبان" },
      { status: 400 }
    );
  }
  if (username.length > 64 || password.length > 256) {
    return NextResponse.json({ error: "بيانات الدخول غير صالحة" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const verdict = await checkAuthThrottle(username);
  if (!verdict.allowed) {
    logger.warn(
      `Login throttled for "${username}" — too many failures`,
      "Auth",
      { ip, retryAfterSec: verdict.retryAfterSec }
    );
    const res = NextResponse.json(
      { error: "تم إيقاف محاولات تسجيل الدخول مؤقتاً، حاول لاحقاً." },
      { status: 429 }
    );
    res.headers.set("Retry-After", String(verdict.retryAfterSec));
    return res;
  }

  let user = null;
  try {
    user = await authenticateUser(username, password);
  } catch (err) {
    logger.error("Login error during authenticate", "Auth", err);
    return NextResponse.json({ error: "حدث خطأ في النظام" }, { status: 500 });
  }

  await recordAuthAttempt({ username, ip, succeeded: !!user }).catch(() => {});

  if (!user) {
    logger.warn(`Failed login for username: ${username}`, "Auth", { ip });
    return NextResponse.json(
      { error: "اسم المستخدم أو كلمة المرور غير صحيحة" },
      { status: 401 }
    );
  }

  const token = createSessionToken(user.id);
  await touchLastLogin(user.id).catch(() => {});
  logger.info(
    `User ${user.name} logged in successfully`,
    "Auth",
    { ip, role: user.role },
    user.id
  );

  const response = NextResponse.json({ user });
  setSessionCookie(response, token);
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
    }
    const session = verifySessionToken(token);
    if (!session) {
      return NextResponse.json({ error: "الجلسة منتهية" }, { status: 401 });
    }
    const user = await getUserById(session.userId);
    if (!user) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    }
    return NextResponse.json({ user });
  } catch (error) {
    logger.error("Session verification error", "Auth", error);
    return NextResponse.json({ error: "حدث خطأ في النظام" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  let userId: string | null = null;
  if (token) {
    const s = verifySessionToken(token);
    if (s) userId = s.userId;
  }
  if (userId) {
    logger.info("User logged out", "Auth", null, userId);
  }
  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  return response;
}
