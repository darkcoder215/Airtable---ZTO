import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAdmin } from "@/lib/api-auth";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { getSource, updateSource, deleteSource } from "@/lib/scraper/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notConfigured() {
  return NextResponse.json(
    { error: "Supabase not configured." },
    { status: 503 }
  );
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  if (!isSupabaseConfigured()) return notConfigured();
  const { id } = await ctx.params;
  try {
    const source = await getSource(id);
    if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ source });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
  }
  if (!isSupabaseConfigured()) return notConfigured();
  const { id } = await ctx.params;
  try {
    const body = await request.json();
    const allowed: Record<string, unknown> = {};
    for (const k of [
      "name",
      "url",
      "type",
      "category",
      "is_active",
      "fetch_interval_minutes",
      "config",
    ]) {
      if (k in body) allowed[k] = body[k];
    }
    if (
      "fetch_interval_minutes" in allowed &&
      (typeof allowed.fetch_interval_minutes !== "number" ||
        allowed.fetch_interval_minutes < 1 ||
        allowed.fetch_interval_minutes > 10080)
    ) {
      return NextResponse.json(
        { error: "fetch_interval_minutes يجب أن يكون بين 1 و 10080" },
        { status: 400 }
      );
    }
    const source = await updateSource(id, allowed);
    return NextResponse.json({ source });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
  }
  if (!isSupabaseConfigured()) return notConfigured();
  const { id } = await ctx.params;
  try {
    await deleteSource(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
