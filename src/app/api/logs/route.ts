// Logs endpoint. Two modes share one route:
//   - Default: system event timeline (scraper_logs in level/time order).
//   - ?actions=1: audit trail of user-attributed actions only — joins
//     against app_users so the UI can render names instead of UUIDs.

import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, getUserById } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  if (!token) {
    return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  }
  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: "الجلسة منتهية" }, { status: 401 });
  }
  const user = await getUserById(session.userId);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const level = searchParams.get("level") as "info" | "warn" | "error" | "debug" | null;
  const actionsOnly = searchParams.get("actions") === "1";
  const userId = searchParams.get("userId") ?? undefined;
  const limit = parseInt(searchParams.get("limit") || "200");

  const logs = await logger.getLogs({
    level: level ?? undefined,
    actionsOnly,
    userId,
    limit: Math.min(Math.max(limit, 1), 1000),
  });

  // When the caller is on the actions tab, also return a lightweight user
  // directory so the UI can resolve user_id → name without a second call.
  let users: Array<{ id: string; name: string; role: string; email: string }> = [];
  if ((actionsOnly || userId) && isSupabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("app_users")
      .select("id, name, role, email");
    if (!error && data) {
      users = data.map((r) => ({
        id: r.id,
        name: r.name ?? "",
        role: r.role ?? "",
        email: r.email ?? "",
      }));
    }
  }

  return NextResponse.json({ logs, users });
}
