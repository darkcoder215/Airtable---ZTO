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
export async function listDueSources(now: Date = new Date()): Promise<Source[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_sources")
    .select("*")
    .eq("is_active", true);
  if (error) throw error;
  const due = (data ?? []).filter((s) => {
    if (!s.last_fetched_at) return true;
    const elapsedMin =
      (now.getTime() - new Date(s.last_fetched_at).getTime()) / 60000;
    return elapsedMin >= s.fetch_interval_minutes;
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
