import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, createSessionToken, verifySessionToken, getUserById } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      logger.warn("Login attempt with missing credentials", "Auth");
      return NextResponse.json(
        { error: "اسم المستخدم وكلمة المرور مطلوبان" },
        { status: 400 }
      );
    }

    const user = authenticateUser(username, password);
    if (!user) {
      logger.warn(`Failed login attempt for username: ${username}`, "Auth");
      return NextResponse.json(
        { error: "اسم المستخدم أو كلمة المرور غير صحيحة" },
        { status: 401 }
      );
    }

    const token = createSessionToken(user.id);
    logger.info(`User ${user.name} logged in successfully`, "Auth", null, user.id);

    const response = NextResponse.json({ user, token });
    response.cookies.set("session", token, {
      httpOnly: false, // needs to be accessible from client for dummy auth
      path: "/",
      maxAge: 86400,
      sameSite: "lax",
    });

    return response;
  } catch (error) {
    logger.error("Login error", "Auth", error);
    return NextResponse.json({ error: "حدث خطأ في النظام" }, { status: 500 });
  }
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

    const user = getUserById(session.userId);
    if (!user) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    logger.error("Session verification error", "Auth", error);
    return NextResponse.json({ error: "حدث خطأ في النظام" }, { status: 500 });
  }
}
