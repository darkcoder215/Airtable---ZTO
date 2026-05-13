import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAdmin } from "@/lib/api-auth";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { listBrands, createBrand } from "@/lib/scraper/db";
import { listTables, listRecords } from "@/lib/airtable";

// Same base id the destination mapping uses. Hard-coding is safe — every
// scraped article + every brand lives in this base.
const DESTINATION_BASE_ID = "appIpXIFs2yxyxaUm";

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

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  // Airtable Brands table lookup — used by access-control to verify
  // that each scraper_brands.name actually exists as a record in the
  // "Brands" Airtable table. Names that don't match yield zero records
  // through the writer filter, so surfacing the mismatch up front
  // saves the admin a debugging round-trip.
  if (action === "airtable-names") {
    try {
      const tables = await listTables(DESTINATION_BASE_ID);
      // Match by name (case-insensitive). "Brands" is the documented
      // table name; fall back to any table whose name normalises to it.
      const table =
        tables.find((t) => t.name === "Brands") ??
        tables.find((t) => t.name.toLowerCase() === "brands");
      if (!table) {
        return NextResponse.json(
          {
            ok: false,
            error: "لم يُعثر على جدول «Brands» في Airtable",
            names: [] as string[],
          },
          { status: 200 }
        );
      }
      // The first two columns are the primary field + the next field
      // (typically a slug / display name). We dedupe values across both
      // so the picker can match either.
      const firstTwoNames = table.fields.slice(0, 2).map((f) => f.name);
      const records: { records: { fields: Record<string, unknown> }[] } =
        await listRecords(DESTINATION_BASE_ID, table.id, { pageSize: 100 });
      const set = new Set<string>();
      for (const r of records.records) {
        for (const fn of firstTwoNames) {
          const v = r.fields[fn];
          if (typeof v === "string" && v.trim()) set.add(v.trim());
        }
      }
      return NextResponse.json({
        ok: true,
        tableId: table.id,
        tableName: table.name,
        fields: firstTwoNames,
        names: Array.from(set).sort((a, b) => a.localeCompare(b, "ar")),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ ok: false, error: msg, names: [] }, { status: 200 });
    }
  }

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
