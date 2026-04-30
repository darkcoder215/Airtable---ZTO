import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAdmin } from "@/lib/api-auth";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { listSources, createSource, type SourceType } from "@/lib/scraper/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES: SourceType[] = ["rss", "twitter", "linkedin", "apify", "custom"];

function notConfigured() {
  return NextResponse.json(
    { error: "Supabase not configured." },
    { status: 503 }
  );
}

export async function GET(request: NextRequest) {
  const user = getRequestUser(request);
  if (!user) return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  if (!isSupabaseConfigured()) return notConfigured();
  const brandId = new URL(request.url).searchParams.get("brandId") ?? undefined;
  try {
    const sources = await listSources(brandId);
    return NextResponse.json({ sources });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = getRequestUser(request);
  if (!user) return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
  }
  if (!isSupabaseConfigured()) return notConfigured();

  try {
    const body = await request.json();
    const brand_id = String(body.brand_id ?? "").trim();
    const name = String(body.name ?? "").trim();
    const url = String(body.url ?? "").trim();
    const type = body.type as SourceType;
    if (!brand_id || !name || !url || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: "brand_id و name و url و type مطلوبة" },
        { status: 400 }
      );
    }
    const fetch_interval_minutes = Number.isFinite(body.fetch_interval_minutes)
      ? Math.max(1, Math.min(10080, Math.round(body.fetch_interval_minutes)))
      : 60;
    const source = await createSource({
      brand_id,
      name,
      url,
      type,
      category: body.category ?? "general",
      is_active: body.is_active ?? true,
      fetch_interval_minutes,
      config: body.config ?? {},
    });
    return NextResponse.json({ source });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg.includes("duplicate") ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
