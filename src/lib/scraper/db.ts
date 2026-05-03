// Typed CRUD helpers over the scraper_* schema in Supabase.
// All callers must run server-side (uses the service-role client).
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
type Views = Database["public"]["Views"];

export type Brand = Tables["scraper_brands"]["Row"];
export type BrandInsert = Tables["scraper_brands"]["Insert"];
export type BrandUpdate = Tables["scraper_brands"]["Update"];

export type Source = Tables["scraper_sources"]["Row"];
export type SourceInsert = Tables["scraper_sources"]["Insert"];
export type SourceUpdate = Tables["scraper_sources"]["Update"];

export type FetchRun = Tables["scraper_fetch_runs"]["Row"];
export type FetchRunInsert = Tables["scraper_fetch_runs"]["Insert"];

export type Article = Tables["scraper_articles"]["Row"];
export type ArticleInsert = Tables["scraper_articles"]["Insert"];

export type DailyStats = Views["scraper_run_daily_stats"]["Row"];

export type SourceType = Database["public"]["Enums"]["scraper_source_type"];
export type RunStatus = Database["public"]["Enums"]["scraper_run_status"];

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

export async function listBrands(): Promise<Brand[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_brands")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getBrand(id: string): Promise<Brand | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_brands")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createBrand(input: BrandInsert): Promise<Brand> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_brands")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBrand(
  id: string,
  patch: BrandUpdate
): Promise<Brand> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_brands")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBrand(id: string): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("scraper_brands").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Sources (brand-scoped)
// ---------------------------------------------------------------------------

export async function listSources(brandId?: string): Promise<Source[]> {
  const sb = getSupabaseAdmin();
  let q = sb
    .from("scraper_sources")
    .select("*")
    .order("created_at", { ascending: false });
  if (brandId) q = q.eq("brand_id", brandId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getSource(id: string): Promise<Source | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_sources")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createSource(input: SourceInsert): Promise<Source> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_sources")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSource(
  id: string,
  patch: SourceUpdate
): Promise<Source> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_sources")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSource(id: string): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("scraper_sources").delete().eq("id", id);
  if (error) throw error;
}

// Sources whose interval has elapsed since last_fetched_at (or never fetched).
// Used by the cron route to decide what to scrape on each tick.
//
// Subtle: pg_cron fires every 5 minutes at :00/:05/:10/... but the actual
// fetch finishes a second or two later, so last_fetched_at drifts. With a
// strict ">= interval" check, a source set to "every 10 minutes" misses the
// 10-minute boundary tick by 0.02 minutes and only runs every other tick —
// effectively a 15-minute cadence. A 30-second grace period bridges that
// gap without ever firing more than once per cron tick.
const DUE_GRACE_SECONDS = 30;

export async function listDueSources(now: Date = new Date()): Promise<Source[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_sources")
    .select("*")
    .eq("is_active", true);
  if (error) throw error;
  const due = (data ?? []).filter((s) => {
    if (!s.last_fetched_at) return true;
    const elapsedSec =
      (now.getTime() - new Date(s.last_fetched_at).getTime()) / 1000;
    return elapsedSec + DUE_GRACE_SECONDS >= s.fetch_interval_minutes * 60;
  });
  return due;
}

// ---------------------------------------------------------------------------
// Fetch runs
// ---------------------------------------------------------------------------

export async function recordRun(input: FetchRunInsert): Promise<FetchRun> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_fetch_runs")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listRecentRuns(opts: {
  brandId?: string;
  sourceId?: string;
  limit?: number;
} = {}): Promise<FetchRun[]> {
  const sb = getSupabaseAdmin();
  let q = sb
    .from("scraper_fetch_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.brandId) q = q.eq("brand_id", opts.brandId);
  if (opts.sourceId) q = q.eq("source_id", opts.sourceId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// Hard cap so a misconfigured filter (e.g. 6-month range with no other
// constraints) can't pull half the runs table into memory.
const MAX_RUNS_RETURNED = 5000;

// Advanced filtered run listing — used by the analytics page. Every option
// is optional; combinations of them refine server-side (Supabase) where
// possible, then we apply hour-of-day / day-of-week filters in JS because
// Postgrest can't express them directly without a custom RPC.
export async function listRunsAdvanced(opts: {
  brandId?: string;
  sourceIds?: string[];           // narrow to specific sources
  sourceTypes?: string[];         // resolved → sourceIds via a side query
  statuses?: RunStatus[];         // success/partial/error/empty/skipped
  fromIso?: string;               // inclusive lower bound on started_at
  toIso?: string;                 // inclusive upper bound on started_at
  hourOfDayFrom?: number;         // 0-23 in viewer's preferred TZ (UTC here);
  hourOfDayTo?: number;           //   wraps when from > to (e.g. 22 → 6)
  daysOfWeek?: number[];          // 0-6 (Sunday=0). Empty means "all days".
  searchText?: string;            // substring on error_message
  limit?: number;
} = {}): Promise<FetchRun[]> {
  const sb = getSupabaseAdmin();

  // sourceTypes are stored on scraper_sources, not on the runs table.
  // Resolve them to a sourceIds list and merge with any explicit filter.
  let sourceIds = opts.sourceIds ? [...opts.sourceIds] : undefined;
  if (opts.sourceTypes && opts.sourceTypes.length > 0) {
    const { data, error } = await sb
      .from("scraper_sources")
      .select("id, type")
      .in("type", opts.sourceTypes as SourceType[]);
    if (error) throw error;
    const ids = (data ?? []).map((r) => r.id);
    sourceIds = sourceIds ? sourceIds.filter((id) => ids.includes(id)) : ids;
    // If the type filter resolves to zero matching sources, short-circuit
    // — Postgrest's .in() with an empty array returns everything.
    if (sourceIds.length === 0) return [];
  }

  let q = sb
    .from("scraper_fetch_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(Math.min(opts.limit ?? 1000, MAX_RUNS_RETURNED));
  if (opts.brandId) q = q.eq("brand_id", opts.brandId);
  if (sourceIds && sourceIds.length > 0) q = q.in("source_id", sourceIds);
  if (opts.statuses && opts.statuses.length > 0) q = q.in("status", opts.statuses);
  if (opts.fromIso) q = q.gte("started_at", opts.fromIso);
  if (opts.toIso) q = q.lte("started_at", opts.toIso);
  if (opts.searchText && opts.searchText.trim()) {
    // Single-column ILIKE is the cheapest cross-row search Postgrest gives
    // us. Wide cross-column search would need a custom RPC.
    q = q.ilike("error_message", `%${opts.searchText.trim()}%`);
  }

  const { data, error } = await q;
  if (error) throw error;
  let rows = data ?? [];

  // Hour-of-day + day-of-week — applied here because they can't be
  // expressed in the SQL filter chain without a server-side function.
  // All times treated as UTC; the UI shows the same.
  const { hourOfDayFrom, hourOfDayTo, daysOfWeek } = opts;
  const hourFilterActive =
    typeof hourOfDayFrom === "number" &&
    typeof hourOfDayTo === "number" &&
    !(hourOfDayFrom === 0 && hourOfDayTo === 23);
  const dayFilterActive = Array.isArray(daysOfWeek) && daysOfWeek.length > 0 && daysOfWeek.length < 7;

  if (hourFilterActive || dayFilterActive) {
    rows = rows.filter((r) => {
      const d = new Date(r.started_at);
      if (Number.isNaN(d.getTime())) return false;
      if (dayFilterActive) {
        if (!daysOfWeek!.includes(d.getUTCDay())) return false;
      }
      if (hourFilterActive) {
        const h = d.getUTCHours();
        const from = hourOfDayFrom!;
        const to = hourOfDayTo!;
        // Wrap-around window (e.g. 22:00–06:00 spans midnight).
        if (from <= to) {
          if (h < from || h > to) return false;
        } else {
          if (h < from && h > to) return false;
        }
      }
      return true;
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

export async function upsertArticles(rows: ArticleInsert[]): Promise<Article[]> {
  if (rows.length === 0) return [];
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_articles")
    .upsert(rows, { onConflict: "source_id,url", ignoreDuplicates: false })
    .select();
  if (error) throw error;
  return data ?? [];
}

// Fetch URLs already stored for a set of sources – used as a dedup set
// so we never re-save the same article on a cold start.
export async function getKnownUrls(
  sourceIds: string[]
): Promise<Set<string>> {
  if (sourceIds.length === 0) return new Set();
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_articles")
    .select("url")
    .in("source_id", sourceIds);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.url));
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export async function getDailyStats(opts: {
  brandId?: string;
  days?: number;
} = {}): Promise<DailyStats[]> {
  const sb = getSupabaseAdmin();
  const days = opts.days ?? 30;
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  let q = sb
    .from("scraper_run_daily_stats")
    .select("*")
    .gte("day", since)
    .order("day", { ascending: false });
  if (opts.brandId) q = q.eq("brand_id", opts.brandId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
