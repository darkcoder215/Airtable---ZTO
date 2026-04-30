import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, getUserById } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  if (!token) {
    return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  }
  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: "الجلسة منتهية" }, { status: 401 });
  }
  const user = getUserById(session.userId);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const level = searchParams.get("level") as "info" | "warn" | "error" | "debug" | null;
  const limit = parseInt(searchParams.get("limit") || "100");

  const logs = await logger.getLogs(level || undefined, limit);
  return NextResponse.json({ logs });
}
