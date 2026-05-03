import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAdmin } from "@/lib/api-auth";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { getBrand, updateBrand, deleteBrand } from "@/lib/scraper/db";

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
    const brand = await getBrand(id);
    if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ brand });
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
      "slug",
      "description",
      "logo_url",
      "is_active",
      "airtable_base_id",
      "airtable_table_id",
    ]) {
      if (k in body) allowed[k] = body[k];
    }
    const brand = await updateBrand(id, allowed);
    return NextResponse.json({ brand });
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
    await deleteBrand(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
