import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/api-auth";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  getDailyStats,
  listRecentRuns,
  listBrands,
  listSources,
} from "@/lib/scraper/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId") ?? undefined;
  const days = Number(searchParams.get("days") ?? "30");

  try {
    const [stats, runs, brands, sources] = await Promise.all([
      getDailyStats({ brandId, days }),
      listRecentRuns({ brandId, limit: 100 }),
      listBrands(),
      listSources(brandId),
    ]);
    return NextResponse.json({ stats, runs, brands, sources });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
