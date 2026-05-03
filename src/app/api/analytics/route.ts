import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/api-auth";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  getDailyStats,
  listRunsAdvanced,
  listBrands,
  listSources,
  type RunStatus,
} from "@/lib/scraper/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES: RunStatus[] = ["success", "partial", "error", "empty", "skipped"];
const VALID_SOURCE_TYPES = ["rss", "twitter", "linkedin", "apify", "custom"];

// Parse a comma-separated query param into a string array, dropping empty
// fragments and trimming whitespace. Returns undefined when missing so the
// caller can default cleanly.
function csv(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function clampHour(value: string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(23, Math.round(n)));
}

function isoOr(value: string | null): string | undefined {
  if (!value) return undefined;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return undefined;
  return new Date(t).toISOString();
}

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

  // Time range: prefer explicit from/to ISO strings; fall back to the legacy
  // `days` shortcut so callers from older builds still work.
  const fromIso = isoOr(searchParams.get("from"));
  const toIso = isoOr(searchParams.get("to"));
  const days = Number(searchParams.get("days") ?? "30");
  const effectiveFromIso =
    fromIso ?? new Date(Date.now() - days * 86400_000).toISOString();
  const effectiveToIso = toIso ?? new Date().toISOString();

  // Multi-value filters.
  const sourceIds = csv(searchParams.get("sourceIds"));
  const sourceTypes = csv(searchParams.get("sourceTypes"))?.filter((s) =>
    VALID_SOURCE_TYPES.includes(s)
  );
  const statuses = csv(searchParams.get("statuses"))?.filter((s): s is RunStatus =>
    (VALID_STATUSES as string[]).includes(s)
  );
  const daysOfWeek = csv(searchParams.get("daysOfWeek"))
    ?.map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);

  const hourOfDayFrom = clampHour(searchParams.get("hourFrom"));
  const hourOfDayTo = clampHour(searchParams.get("hourTo"));
  const searchText = searchParams.get("search") || undefined;
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "1000"), 1), 5000);

  try {
    const [stats, runs, brands, sources] = await Promise.all([
      // Daily aggregate view doesn't carry hour-of-day or status filters; we
      // hand it the wider range and let the client recompute when those
      // narrow filters are active.
      getDailyStats({
        brandId,
        days: Math.max(1, Math.ceil((Date.parse(effectiveToIso) - Date.parse(effectiveFromIso)) / 86400_000)),
      }),
      listRunsAdvanced({
        brandId,
        sourceIds,
        sourceTypes,
        statuses,
        fromIso: effectiveFromIso,
        toIso: effectiveToIso,
        hourOfDayFrom,
        hourOfDayTo,
        daysOfWeek,
        searchText,
        limit,
      }),
      listBrands(),
      listSources(brandId),
    ]);
    return NextResponse.json({
      stats,
      runs,
      brands,
      sources,
      // Echo back the resolved filter so the UI can display chips reflecting
      // exactly what the server applied (and clamp any out-of-range params).
      filter: {
        from: effectiveFromIso,
        to: effectiveToIso,
        brandId: brandId ?? null,
        sourceIds: sourceIds ?? null,
        sourceTypes: sourceTypes ?? null,
        statuses: statuses ?? null,
        hourOfDayFrom: hourOfDayFrom ?? null,
        hourOfDayTo: hourOfDayTo ?? null,
        daysOfWeek: daysOfWeek ?? null,
        search: searchText ?? null,
        limit,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
