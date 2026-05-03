import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAdmin } from "@/lib/api-auth";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { listBrands, createBrand } from "@/lib/scraper/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notConfigured() {
  return NextResponse.json(
    { error: "Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." },
    { status: 503 }
  );
}

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  if (!isSupabaseConfigured()) return notConfigured();
  try {
    const brands = await listBrands();
    return NextResponse.json({ brands });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
  }
  if (!isSupabaseConfigured()) return notConfigured();

  try {
    const body = await request.json();
    const slug = String(body.slug ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim();
    if (!slug || !name) {
      return NextResponse.json(
        { error: "slug و name مطلوبان" },
        { status: 400 }
      );
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      return NextResponse.json(
        { error: "slug يجب أن يحتوي على أحرف صغيرة وأرقام وشرطات فقط" },
        { status: 400 }
      );
    }
    const brand = await createBrand({
      slug,
      name,
      description: body.description ?? null,
      logo_url: body.logo_url ?? null,
      is_active: body.is_active ?? true,
      airtable_base_id: body.airtable_base_id ?? null,
      airtable_table_id: body.airtable_table_id ?? null,
    });
    return NextResponse.json({ brand });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg.includes("duplicate") ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
