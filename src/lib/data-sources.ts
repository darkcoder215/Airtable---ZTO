// Data sources management — RSS / Twitter / Apify, persisted in Supabase.
// Source CRUD lives in scraper_sources, fetched articles in scraper_articles,
// AI filter outcomes in scraper_filter_runs, and per-fetch run rows in
// scraper_fetch_runs. Airtable continues to be the human-facing destination.

import { createRecord } from "./airtable";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { logger } from "@/lib/logger";
import {
  applyMapping,
  getMappingForType,
  getPerTypeMapping,
  DESTINATION_BASE_ID,
  DEFAULT_TABLE_NAME,
  type TypeMapping,
} from "@/lib/destination-mapping";
import { listTables, type AirtableField } from "@/lib/airtable";

// Destination base is fixed per environment; per-type table + columns come
// from the dashboard-editable mapping.
const ZTO_BASE_ID = DESTINATION_BASE_ID;

type SourceRow = Database["public"]["Tables"]["scraper_sources"]["Row"];
type SourceInsert = Database["public"]["Tables"]["scraper_sources"]["Insert"];
type ArticleRow = Database["public"]["Tables"]["scraper_articles"]["Row"];
type FilterRunRow = Database["public"]["Tables"]["scraper_filter_runs"]["Row"];

export type SourceType = "rss" | "twitter" | "linkedin" | "apify" | "custom";
export type SourceCategory = "startups" | "investment" | "tech" | "general";
export type SourceTopic = "news" | "insights" | "real_estate";

export const VALID_SOURCE_TYPES: readonly SourceType[] = [
  "rss",
  "twitter",
  "linkedin",
  "apify",
  "custom",
];
export const VALID_SOURCE_CATEGORIES: readonly SourceCategory[] = [
  "startups",
  "investment",
  "tech",
  "general",
];
export const VALID_SOURCE_TOPICS: readonly SourceTopic[] = [
  "news",
  "insights",
  "real_estate",
];

export class SourceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceValidationError";
  }
}

const TWITTER_HOSTS = new Set(["x.com", "twitter.com", "www.x.com", "www.twitter.com"]);
const LINKEDIN_HOSTS = new Set(["linkedin.com", "www.linkedin.com"]);
const TWITTER_HANDLE_PATH = /^\/[A-Za-z0-9_]{1,15}\/?$/;
const LINKEDIN_PROFILE_PATH = /^\/(in|company|school)\/[A-Za-z0-9\-_%.]+\/?$/i;

function parseHttpUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new SourceValidationError("الرابط غير صالح");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SourceValidationError("يجب أن يبدأ الرابط بـ https://");
  }
  return parsed;
}

// Validate + normalize a URL to the canonical shape for the given source type.
// Profile-style sources (twitter/linkedin) get scheme + host normalised and
// any query/fragment stripped so the same person can't be added twice under
// slightly different links. RSS keeps its query string (often required).
export function normalizeSourceUrl(type: SourceType, raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) throw new SourceValidationError("الرابط مطلوب");
  const u = parseHttpUrl(trimmed);
  const host = u.hostname.toLowerCase();

  switch (type) {
    case "twitter": {
      if (!TWITTER_HOSTS.has(host)) {
        throw new SourceValidationError(
          "رابط X يجب أن يكون بصيغة https://x.com/username"
        );
      }
      if (!TWITTER_HANDLE_PATH.test(u.pathname)) {
        throw new SourceValidationError(
          "رابط X يجب أن يكون بصيغة https://x.com/username"
        );
      }
      return `https://x.com${u.pathname.replace(/\/$/, "")}`;
    }
    case "linkedin": {
      if (!LINKEDIN_HOSTS.has(host)) {
        throw new SourceValidationError(
          "رابط LinkedIn يجب أن يكون على نطاق linkedin.com"
        );
      }
      if (!LINKEDIN_PROFILE_PATH.test(u.pathname)) {
        throw new SourceValidationError(
          "رابط LinkedIn يجب أن يكون بصيغة https://www.linkedin.com/in/username أو /company/name"
        );
      }
      return `https://www.linkedin.com${u.pathname.replace(/\/$/, "")}`;
    }
    case "rss":
    case "apify":
    case "custom":
    default:
      return u.toString();
  }
}

interface SourcePayloadInput {
  name?: unknown;
  url?: unknown;
  type?: unknown;
  category?: unknown;
  topic?: unknown;
  fetchInterval?: unknown;
  isActive?: unknown;
  filterAgentId?: unknown;
}

interface SourcePayloadValidated {
  name?: string;
  url?: string;
  type?: SourceType;
  category?: SourceCategory;
  topic?: SourceTopic;
  fetchInterval?: number;
  isActive?: boolean;
  filterAgentId?: string | null;
}

// Throws SourceValidationError on bad input. With { partial: true } only the
// supplied fields are checked (used by update). With partial=false (create)
// name/type/url are required and validated together.
export function validateSourcePayload(
  input: SourcePayloadInput,
  opts: { partial?: boolean; existingType?: SourceType } = {}
): SourcePayloadValidated {
  const out: SourcePayloadValidated = {};

  if (input.type !== undefined) {
    if (
      typeof input.type !== "string" ||
      !VALID_SOURCE_TYPES.includes(input.type as SourceType)
    ) {
      throw new SourceValidationError("نوع المصدر غير صالح");
    }
    out.type = input.type as SourceType;
  } else if (!opts.partial) {
    throw new SourceValidationError("نوع المصدر مطلوب");
  }

  if (input.name !== undefined) {
    if (typeof input.name !== "string") {
      throw new SourceValidationError("اسم المصدر غير صالح");
    }
    const n = input.name.trim();
    if (!n) throw new SourceValidationError("اسم المصدر مطلوب");
    if (n.length > 200) throw new SourceValidationError("اسم المصدر طويل جداً");
    out.name = n;
  } else if (!opts.partial) {
    throw new SourceValidationError("اسم المصدر مطلوب");
  }

  if (input.url !== undefined) {
    if (typeof input.url !== "string") {
      throw new SourceValidationError("الرابط غير صالح");
    }
    const typeForUrl = out.type ?? opts.existingType;
    if (!typeForUrl) {
      throw new SourceValidationError("النوع مطلوب للتحقق من الرابط");
    }
    out.url = normalizeSourceUrl(typeForUrl, input.url);
  } else if (!opts.partial) {
    throw new SourceValidationError("الرابط مطلوب");
  }

  if (input.category !== undefined) {
    if (
      typeof input.category !== "string" ||
      !VALID_SOURCE_CATEGORIES.includes(input.category as SourceCategory)
    ) {
      throw new SourceValidationError("الفئة غير صالحة");
    }
    out.category = input.category as SourceCategory;
  }

  if (input.topic !== undefined) {
    if (
      typeof input.topic !== "string" ||
      !VALID_SOURCE_TOPICS.includes(input.topic as SourceTopic)
    ) {
      throw new SourceValidationError("الموضوع غير صالح (news / insights / real_estate)");
    }
    out.topic = input.topic as SourceTopic;
  } else if (!opts.partial) {
    throw new SourceValidationError("الموضوع مطلوب");
  }

  if (input.fetchInterval !== undefined) {
    const n =
      typeof input.fetchInterval === "number"
        ? input.fetchInterval
        : Number(input.fetchInterval);
    if (!Number.isFinite(n) || n < 5 || n > 10080) {
      throw new SourceValidationError(
        "فترة الجلب يجب أن تكون بين 5 و 10080 دقيقة"
      );
    }
    out.fetchInterval = Math.round(n);
  }

  if (input.isActive !== undefined) {
    if (typeof input.isActive !== "boolean") {
      throw new SourceValidationError("isActive يجب أن يكون boolean");
    }
    out.isActive = input.isActive;
  }

  // filterAgentId may be a UUID string, null, or undefined (= leave unchanged).
  // Empty string is normalised to null so the column can clear cleanly.
  if (input.filterAgentId !== undefined) {
    const v = input.filterAgentId;
    if (v === null || v === "") {
      out.filterAgentId = null;
    } else if (typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
      out.filterAgentId = v;
    } else {
      throw new SourceValidationError("filterAgentId غير صالح");
    }
  }

  return out;
}

export interface DataSource {
  id: string;
  name: string;
  type: SourceType;
  url: string;
  category: SourceCategory;
  topic: SourceTopic;
  isActive: boolean;
  fetchInterval: number;
  lastFetchedAt: string | null;
  createdAt: string;
  brandId?: string | null;
  filterAgentId?: string | null;
}

export interface FetchedArticle {
  id: string;
  sourceId: string;
  sourceName?: string;
  title: string;
  description: string;
  url: string;
  author: string;
  // null when the fetched item had no date or its date was unparseable /
  // future-skewed. Stored as null in scraper_articles.published_at so the
  // dedup pass falls back to the URL set instead of treating the item as
  // "newer than the cutoff" on every tick.
  publishedAt: string | null;
  fetchedAt: string;
  categories: string[];
  imageUrl?: string;
  isInvestmentRelated: boolean;
  savedToAirtable?: boolean;
  // Per-channel engagement / metadata. X populates retweetCount / likeCount /
  // replyCount / quoteCount / bookmarkCount / isRetweet / isQuote / authorHandle.
  // LinkedIn populates numShares / numLikes / numComments / numImpressions /
  // authorType / authorFollowersCount / authorProfileUrl / authorProfilePicture.
  // Stored in scraper_articles.raw and surfaced as mapping tokens.
  engagement?: Record<string, string | number | boolean | null>;
}

export interface FilterResult {
  id: string;
  sourceId: string;
  sourceName: string;
  timestamp: string;
  totalArticles: number;
  passedArticles: number;
  rejectedArticles: number;
  model: string;
  // `reason` is the per-item justification the filter agent returned (new
  // generic schema). Kept optional so historical runs without it still parse.
  articles: { title: string; url: string; passed: boolean; reason?: string }[];
  rawResponse?: string;
}

interface ArticleRaw {
  categories?: unknown;
  imageUrl?: unknown;
  externalId?: unknown;
  // Channel-specific metadata (X / LinkedIn engagement counters etc.).
  engagement?: unknown;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapSource(r: SourceRow): DataSource {
  return {
    id: r.id,
    name: r.name,
    type: r.type as SourceType,
    url: r.url,
    category: (r.category as SourceCategory) || "general",
    topic: (r.topic as SourceTopic) || "insights",
    isActive: r.is_active,
    fetchInterval: r.fetch_interval_minutes,
    lastFetchedAt: r.last_fetched_at,
    createdAt: r.created_at,
    brandId: r.brand_id,
    filterAgentId: r.filter_agent_id,
  };
}

function mapArticle(r: ArticleRow, sourceName?: string): FetchedArticle {
  const raw = (r.raw ?? {}) as ArticleRaw;
  // engagement is a free-form { string: scalar } map. We accept whatever's
  // there but coerce types so the consumer never gets a surprise object.
  let engagement: FetchedArticle["engagement"];
  if (raw.engagement && typeof raw.engagement === "object" && !Array.isArray(raw.engagement)) {
    engagement = {};
    for (const [k, v] of Object.entries(raw.engagement as Record<string, unknown>)) {
      if (v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        engagement[k] = v as string | number | boolean | null;
      }
    }
  }
  return {
    id: r.id,
    sourceId: r.source_id,
    sourceName,
    title: r.title ?? "",
    description: r.description ?? "",
    url: r.url,
    author: r.author ?? "",
    publishedAt: r.published_at,
    fetchedAt: r.fetched_at,
    categories: Array.isArray(raw.categories)
      ? (raw.categories as unknown[]).filter((c): c is string => typeof c === "string")
      : [],
    imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : undefined,
    isInvestmentRelated: !!r.is_investment_related,
    savedToAirtable: r.saved_to_airtable,
    engagement,
  };
}

function mapFilterRun(r: FilterRunRow): FilterResult {
  return {
    id: r.id,
    sourceId: r.source_id ?? "",
    sourceName: r.source_name,
    timestamp: r.created_at,
    totalArticles: r.total_articles,
    passedArticles: r.passed_articles,
    rejectedArticles: r.rejected_articles,
    model: r.model,
    articles: Array.isArray(r.articles)
      ? (r.articles as unknown as { title: string; url: string; passed: boolean }[])
      : [],
    rawResponse: r.raw_response ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Date normalization
//
// Every fetcher feeds raw publisher dates through `parseSourceDate`. The
// helper tries five strategies in order and returns either a canonical ISO
// string or null. Returning null (instead of falling back to "now()") is a
// deliberate choice — falling back to now() makes a broken item look "newer
// than the cutoff" on every single tick, so it would get re-processed
// forever. With null, the caller falls through to the known-URL safety net
// instead.
//
// We also reject future-dated items beyond a 5-minute skew window so a
// single misconfigured publisher with a wrong clock can't poison the cutoff
// and silently hide every legitimate post that follows.
//
// Observed real-world inputs:
//   - RSS: RFC 822 ("Mon, 28 Apr 2025 14:30:00 +0000"), ISO 8601, dc:date,
//     occasional non-standard Arabic strings (those return null).
//   - X / Twitter (Apify): ASCTIME-ish ("Sat May 02 12:22:51 +0000 2026")
//     — Date.parse handles it natively.
//   - LinkedIn (Apify): postedAtISO (clean ISO with ms) + postedAtTimestamp
//     (epoch ms) — both clean.
// ---------------------------------------------------------------------------

const FUTURE_SKEW_MS = 5 * 60 * 1000; // accept up to 5 min into the future

export function parseSourceDate(raw: unknown): string | null {
  // Numeric epoch (ms or seconds) — handle before string coercion so
  // "1777748436506" still wins as an epoch.
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return clampAndStringify(raw < 1e12 ? raw * 1000 : raw);
  }
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Numeric string — same epoch handling.
  if (/^-?\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n)) {
      return clampAndStringify(n < 1e12 ? n * 1000 : n);
    }
  }

  // Date.parse covers ISO 8601, RFC 822/2822, and the ASCTIME variant
  // Twitter/Apify uses ("Sat May 02 12:22:51 +0000 2026"). Anything it
  // accepts, we accept — reject the rest.
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return clampAndStringify(parsed);
}

function clampAndStringify(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return null; // pre-1970 is almost always a parser bug
  if (ms > Date.now() + FUTURE_SKEW_MS) return null;
  return new Date(ms).toISOString();
}

// ---------------------------------------------------------------------------
// Source CRUD
// ---------------------------------------------------------------------------

export async function getDataSources(): Promise<DataSource[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_sources")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getDataSources: ${error.message}`);
  return (data ?? []).map(mapSource);
}

export async function getDataSourceById(id: string): Promise<DataSource | null> {
  if (!isUuid(id)) return null;
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_sources")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getDataSourceById: ${error.message}`);
  return data ? mapSource(data) : null;
}

export async function createDataSource(
  config: Omit<DataSource, "id" | "createdAt" | "lastFetchedAt"> & { brandId?: string | null }
): Promise<DataSource> {
  const validated = validateSourcePayload(config, { partial: false });
  const sb = getSupabaseAdmin();
  const insert: SourceInsert = {
    name: validated.name!,
    type: validated.type!,
    url: validated.url!,
    category: validated.category ?? config.category,
    topic: validated.topic!,
    is_active: validated.isActive ?? config.isActive,
    fetch_interval_minutes: validated.fetchInterval ?? config.fetchInterval,
    brand_id: config.brandId ?? null,
    filter_agent_id:
      validated.filterAgentId !== undefined
        ? validated.filterAgentId
        : config.filterAgentId ?? null,
  };
  const { data, error } = await sb
    .from("scraper_sources")
    .insert(insert)
    .select()
    .single();
  if (error) throw new Error(`createDataSource: ${error.message}`);
  return mapSource(data);
}

// Per-row outcome of a bulk create. We never throw — the route mirrors this
// shape back to the UI so it can show a per-row pass/fail summary.
export interface BulkCreateRowResult {
  index: number;
  input: Partial<Pick<DataSource, "name" | "url" | "type" | "category" | "topic">>;
  ok: boolean;
  source?: DataSource;
  error?: string;
}

export interface BulkCreateInputRow {
  name?: string;
  url: string;
  type: SourceType;
  category?: SourceCategory;
  topic: SourceTopic;
  fetchInterval?: number;
  isActive?: boolean;
  brandId?: string | null;
}

const BULK_CREATE_LIMIT = 100;

// Best-effort bulk add. Each row is independent — one bad URL doesn't kill
// the whole batch. Validation/normalisation runs row-by-row so the report
// can call out exactly which entries failed and why.
export async function bulkCreateDataSources(
  rows: BulkCreateInputRow[]
): Promise<{ results: BulkCreateRowResult[]; created: number }> {
  if (!Array.isArray(rows)) {
    throw new SourceValidationError("قائمة المصادر مطلوبة");
  }
  if (rows.length === 0) {
    throw new SourceValidationError("لا توجد مصادر للإضافة");
  }
  if (rows.length > BULK_CREATE_LIMIT) {
    throw new SourceValidationError(
      `الحد الأقصى لكل عملية هو ${BULK_CREATE_LIMIT} مصدر`
    );
  }

  const results: BulkCreateRowResult[] = [];
  let created = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? ({} as BulkCreateInputRow);
    // Auto-fill name from URL host if the user didn't supply one — common
    // case when bulk-pasting a list of feeds.
    let derivedName = row.name?.trim();
    if (!derivedName && typeof row.url === "string") {
      try {
        const u = new URL(row.url);
        const path = u.pathname.replace(/\/$/, "").split("/").filter(Boolean).pop();
        derivedName = path
          ? `${u.hostname.replace(/^www\./, "")} — ${path}`
          : u.hostname.replace(/^www\./, "");
      } catch {
        // leave undefined; validator will reject below
      }
    }

    const input = {
      name: derivedName,
      url: row.url,
      type: row.type,
      category: row.category ?? "general",
      topic: row.topic,
      fetchInterval: row.fetchInterval ?? 60,
      isActive: row.isActive ?? true,
      brandId: row.brandId ?? null,
    };

    try {
      const source = await createDataSource(input as never);
      created++;
      results.push({
        index: i,
        input: {
          name: source.name,
          url: source.url,
          type: source.type,
          category: source.category,
          topic: source.topic,
        },
        ok: true,
        source,
      });
    } catch (err) {
      const msg =
        err instanceof SourceValidationError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unknown error";
      results.push({
        index: i,
        input: {
          name: derivedName,
          url: row.url,
          type: row.type,
          category: row.category,
          topic: row.topic,
        },
        ok: false,
        error: msg,
      });
    }
  }

  return { results, created };
}

export async function updateDataSource(
  id: string,
  update: Partial<DataSource>
): Promise<DataSource | null> {
  if (!isUuid(id)) return null;
  const sb = getSupabaseAdmin();

  // If type or url is being changed, we need the existing type so url
  // validation can run when only the url is supplied.
  let existingType: SourceType | undefined;
  if (update.url !== undefined && update.type === undefined) {
    const current = await getDataSourceById(id);
    if (!current) return null;
    existingType = current.type;
  }

  const validated = validateSourcePayload(update, {
    partial: true,
    existingType,
  });

  const patch: Database["public"]["Tables"]["scraper_sources"]["Update"] = {
    updated_at: new Date().toISOString(),
  };
  if (validated.name !== undefined) patch.name = validated.name;
  if (validated.type !== undefined) patch.type = validated.type;
  if (validated.url !== undefined) patch.url = validated.url;
  if (validated.category !== undefined) patch.category = validated.category;
  if (validated.topic !== undefined) patch.topic = validated.topic;
  if (validated.isActive !== undefined) patch.is_active = validated.isActive;
  if (validated.fetchInterval !== undefined) {
    patch.fetch_interval_minutes = validated.fetchInterval;
  }
  if (update.lastFetchedAt !== undefined) patch.last_fetched_at = update.lastFetchedAt;
  if (update.brandId !== undefined) patch.brand_id = update.brandId;
  if (validated.filterAgentId !== undefined) patch.filter_agent_id = validated.filterAgentId;

  const { data, error } = await sb
    .from("scraper_sources")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`updateDataSource: ${error.message}`);
  return data ? mapSource(data) : null;
}

export async function deleteDataSource(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const sb = getSupabaseAdmin();
  const { error, count } = await sb
    .from("scraper_sources")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw new Error(`deleteDataSource: ${error.message}`);
  return (count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

export async function getArticles(sourceId?: string): Promise<FetchedArticle[]> {
  const sb = getSupabaseAdmin();
  let q = sb
    .from("scraper_articles")
    .select("*, source:scraper_sources(name)")
    .order("fetched_at", { ascending: false })
    .limit(500);
  if (sourceId && isUuid(sourceId)) q = q.eq("source_id", sourceId);
  const { data, error } = await q;
  if (error) throw new Error(`getArticles: ${error.message}`);
  return (data ?? []).map((row) => {
    const sourceName = (row as unknown as { source?: { name: string } | null }).source?.name;
    return mapArticle(row as ArticleRow, sourceName);
  });
}

export async function getArticleById(id: string): Promise<FetchedArticle | null> {
  if (!isUuid(id)) return null;
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_articles")
    .select("*, source:scraper_sources(name)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getArticleById: ${error.message}`);
  if (!data) return null;
  const sourceName = (data as unknown as { source?: { name: string } | null }).source?.name;
  return mapArticle(data as ArticleRow, sourceName);
}

export async function getFilterHistory(): Promise<FilterResult[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_filter_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`getFilterHistory: ${error.message}`);
  return (data ?? []).map(mapFilterRun);
}

// ---------------------------------------------------------------------------
// AI Filtering
// ---------------------------------------------------------------------------

// Baseline fallback when the source has no filter_agent_id set AND no
// filtering agent exists in scraper_agents (e.g. fresh DB before the seed
// runs). Kept identical to the historical hard-coded behaviour.
const AI_FILTER_FALLBACK_MODEL = "openai/gpt-4o-mini";

// Criterion-only fallback prompt. Output formatting is appended automatically
// by buildSystemPrompt(), so admin-authored agents can focus entirely on
// "what to keep" in their own language.
const AI_FILTER_FALLBACK_PROMPT = `CRITERION:
Keep an item only if it is about a startup funding round, investment, fundraise, acquisition, IPO, or VC deal — anywhere in the world.
Reject anything else (general industry news, opinion pieces, hires, product launches without a funding angle, lifestyle, sports, etc.).
Be strict: when in doubt, mark "no". Reasons should be in the original language of the item.`;

export interface FilterAgentSpec {
  agentId: string | null;
  agentName: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}

const FILTER_AGENT_FALLBACK: FilterAgentSpec = {
  agentId: null,
  agentName: "فلتر افتراضي",
  model: AI_FILTER_FALLBACK_MODEL,
  systemPrompt: AI_FILTER_FALLBACK_PROMPT,
  temperature: 0,
  maxTokens: 4000,
};

// Resolve which filter agent applies to this source. Order:
//   1. The source's explicit filter_agent_id, if any (active or not — admin
//      override wins).
//   2. The first active scraper_agents row with type 'filtering'.
//   3. The hard-coded fallback prompt.
export async function resolveFilterAgentForSource(
  source: Pick<DataSource, "filterAgentId">
): Promise<FilterAgentSpec> {
  const sb = getSupabaseAdmin();
  if (source.filterAgentId && isUuid(source.filterAgentId)) {
    const { data, error } = await sb
      .from("scraper_agents")
      .select("id, name, model_name, system_prompt, temperature, max_tokens, is_active")
      .eq("id", source.filterAgentId)
      .maybeSingle();
    if (!error && data) {
      return {
        agentId: data.id,
        agentName: data.name,
        model: data.model_name,
        systemPrompt: data.system_prompt,
        temperature: Number(data.temperature ?? 0),
        maxTokens: Number(data.max_tokens ?? 4000),
      };
    }
  }
  const { data: defaults } = await sb
    .from("scraper_agents")
    .select("id, name, model_name, system_prompt, temperature, max_tokens")
    .eq("agent_type", "filtering")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (defaults) {
    return {
      agentId: defaults.id,
      agentName: defaults.name,
      model: defaults.model_name,
      systemPrompt: defaults.system_prompt,
      temperature: Number(defaults.temperature ?? 0),
      maxTokens: Number(defaults.max_tokens ?? 4000),
    };
  }
  return FILTER_AGENT_FALLBACK;
}

// Generic per-item decision schema. The agent's prompt describes the
// criterion in any language / any domain — the engine handles structured
// output parsing. Each input item gets one decision so we can show the
// admin exactly why an item passed or was dropped.
const AI_FILTER_RESPONSE_SCHEMA = {
  name: "filter_decisions",
  strict: true,
  schema: {
    type: "object",
    properties: {
      decisions: {
        type: "array",
        description:
          "One entry per input item, in the SAME order the items were given.",
        items: {
          type: "object",
          properties: {
            index: {
              type: "integer",
              description: "0-based index of the input item this decision is about.",
            },
            keep: {
              type: "string",
              enum: ["yes", "no"],
              description:
                "'yes' if the item matches the criterion in the system prompt, otherwise 'no'.",
            },
            reason: {
              type: "string",
              description:
                "Short justification (≤140 chars) for the decision, in the original language of the item.",
            },
          },
          required: ["index", "keep", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["decisions"],
    additionalProperties: false,
  },
} as const;

interface OpenRouterChoice {
  message?: { content?: string | null };
}
interface OpenRouterError {
  error?: { message?: string };
}

export interface FilterDecision {
  index: number;
  keep: "yes" | "no";
  reason: string;
}
export interface AIFilterParsed {
  decisions: FilterDecision[];
}

// Wrapper appended to every agent's prompt. The agent author writes the
// criterion in whatever language / format they like; this section instructs
// the model how to format its output regardless. Strict-mode JSON schema
// makes this a belt + suspenders.
function buildSystemPrompt(criterion: string): string {
  const tail = `

— OUTPUT FORMAT (DO NOT IGNORE) —
You will receive a numbered list of items (titles + links). For EACH item,
output one decision object: { index, keep ("yes"|"no"), reason }.
"keep" = "yes" only when the item matches the CRITERION above.
"reason" is a short justification in the item's original language.
Return strict JSON: { "decisions": [...] }. Do not add any other text.`;
  return `${criterion.trim()}\n${tail}`;
}

function parseStrictFilterResponse(raw: string): AIFilterParsed | null {
  if (!raw) return null;
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(trimmed) as { decisions?: unknown };
    if (!parsed || typeof parsed !== "object") return null;
    const arr = parsed.decisions;
    if (!Array.isArray(arr)) return null;
    const decisions: FilterDecision[] = [];
    for (const d of arr) {
      if (!d || typeof d !== "object") continue;
      const o = d as Record<string, unknown>;
      const index = typeof o.index === "number" ? o.index : Number(o.index);
      const keep = o.keep === "yes" ? "yes" : o.keep === "no" ? "no" : null;
      const reason = typeof o.reason === "string" ? o.reason.slice(0, 280) : "";
      if (!Number.isFinite(index) || !keep) continue;
      decisions.push({ index, keep, reason });
    }
    if (decisions.length === 0) return null;
    return { decisions };
  } catch {
    return null;
  }
}

async function persistFilterRun(args: {
  sourceId: string;
  sourceName: string;
  total: number;
  passed: number;
  articles: { title: string; url: string; passed: boolean; reason?: string }[];
  rawResponse?: string;
  model?: string;
}): Promise<FilterResult> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_filter_runs")
    .insert({
      source_id: isUuid(args.sourceId) ? args.sourceId : null,
      source_name: args.sourceName,
      total_articles: args.total,
      passed_articles: args.passed,
      rejected_articles: args.total - args.passed,
      model: args.model ?? AI_FILTER_FALLBACK_MODEL,
      articles: args.articles as unknown as Database["public"]["Tables"]["scraper_filter_runs"]["Insert"]["articles"],
      raw_response: args.rawResponse ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`persistFilterRun: ${error.message}`);
  return mapFilterRun(data);
}

// Stateless agent invocation. Returns the parsed structured-output (or null),
// the raw assistant content for transparency, and an error string when the
// upstream call fails. No DB writes happen here — the caller decides what to
// log/persist.
export interface FilterAgentResult {
  parsed: AIFilterParsed | null;
  rawResponse: string;
  error: string | null;
}

export async function runFilterAgent(
  spec: FilterAgentSpec,
  articles: { title: string; url: string }[]
): Promise<FilterAgentResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      parsed: null,
      rawResponse: "",
      error: "OPENROUTER_API_KEY not configured",
    };
  }
  // 0-based index because the response schema's `index` is 0-based.
  const userMessage = articles
    .map((a, i) => `[${i}] ${a.title}\nURL: ${a.url}`)
    .join("\n\n");
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "ZTO Data Sources Filter",
      },
      body: JSON.stringify({
        model: spec.model,
        messages: [
          // Auto-wrap the agent's prompt with output-format instructions so
          // the agent author only writes the criterion (in any language).
          { role: "system", content: buildSystemPrompt(spec.systemPrompt) },
          { role: "user", content: userMessage },
        ],
        temperature: spec.temperature,
        max_tokens: spec.maxTokens,
        response_format: { type: "json_schema", json_schema: AI_FILTER_RESPONSE_SCHEMA },
        provider: { require_parameters: true },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) {
      const errText = await response.text();
      let detail = errText.slice(0, 300);
      try {
        const j = JSON.parse(errText) as OpenRouterError;
        if (j.error?.message) detail = j.error.message.slice(0, 300);
      } catch {
        // not JSON
      }
      return {
        parsed: null,
        rawResponse: "",
        error: `OpenRouter ${response.status}: ${detail}`,
      };
    }
    const data = (await response.json()) as { choices?: OpenRouterChoice[] };
    const rawResponse = data.choices?.[0]?.message?.content ?? "";
    const parsed = parseStrictFilterResponse(rawResponse);
    return {
      parsed,
      rawResponse,
      error: parsed ? null : "Filter response did not match schema",
    };
  } catch (err) {
    return {
      parsed: null,
      rawResponse: "",
      error: err instanceof Error ? err.message : "Unknown filter error",
    };
  }
}

// Resolve a parsed filter result against the original input batch.
// Returns:
//   passedIndices  — indices the agent said keep="yes"
//   reasonByIndex  — short justification per index for logging / UI
// The caller maps indices back to the actual articles.
export function resolvePassedFromFilterResult(
  parsed: AIFilterParsed | null,
  totalItems: number
): { passedIndices: Set<number>; reasonByIndex: Map<number, string> } {
  const passedIndices = new Set<number>();
  const reasonByIndex = new Map<number, string>();
  if (!parsed) return { passedIndices, reasonByIndex };
  for (const d of parsed.decisions) {
    if (!Number.isInteger(d.index) || d.index < 0 || d.index >= totalItems) continue;
    if (d.keep === "yes") passedIndices.add(d.index);
    if (d.reason) reasonByIndex.set(d.index, d.reason);
  }
  return { passedIndices, reasonByIndex };
}

// Run the article batch through the OpenRouter investment-relevance filter.
// Uses structured outputs (json_schema, strict) so the response is guaranteed
// to be a valid object with Investment_related ∈ {yes,no} + News string.
//
// Failure policy: if OpenRouter is unreachable, returns an error, or the
// response can't be parsed, we LOG the failure and pass everything through
// (better to over-fetch to Airtable than to silently drop news).
export async function filterArticlesWithAI(
  articles: FetchedArticle[],
  sourceId: string,
  sourceName: string,
  spec?: FilterAgentSpec
): Promise<{ passed: FetchedArticle[]; filterResult: FilterResult }> {
  // Resolve the agent for this source if the caller didn't pre-pass one.
  // Cheap one-row lookup; admin edits to the agent take effect immediately.
  const resolvedSpec =
    spec ??
    (await resolveFilterAgentForSource({
      filterAgentId: null,
    }).catch(() => FILTER_AGENT_FALLBACK));

  if (articles.length === 0) {
    const filterResult = await persistFilterRun({
      sourceId,
      sourceName,
      total: 0,
      passed: 0,
      articles: [],
      rawResponse: "no articles to filter",
      model: resolvedSpec.model,
    });
    return { passed: [], filterResult };
  }

  // No API key → record the run as a pass-through and bail.
  if (!process.env.OPENROUTER_API_KEY) {
    logger.warn(
      "OpenRouter API key not configured — passing all articles through filter",
      "AIFilter",
      {
        sourceId,
        sourceName,
        agentId: resolvedSpec.agentId,
        agentName: resolvedSpec.agentName,
        total: articles.length,
      }
    );
    const filterResult = await persistFilterRun({
      sourceId,
      sourceName,
      total: articles.length,
      passed: articles.length,
      articles: articles.map((a) => ({ title: a.title, url: a.url, passed: true })),
      rawResponse: "OpenRouter API key not configured — all articles passed through",
      model: resolvedSpec.model,
    });
    return { passed: articles, filterResult };
  }

  const result = await runFilterAgent(
    resolvedSpec,
    articles.map((a) => ({ title: a.title, url: a.url }))
  );

  if (result.error || !result.parsed) {
    logger.error(
      `AI filter call failed for "${sourceName}" via agent "${resolvedSpec.agentName}" — passing all articles through`,
      "AIFilter",
      {
        sourceId,
        sourceName,
        agentId: resolvedSpec.agentId,
        agentName: resolvedSpec.agentName,
        model: resolvedSpec.model,
        error: result.error,
        total: articles.length,
      }
    );
    const filterResult = await persistFilterRun({
      sourceId,
      sourceName,
      total: articles.length,
      passed: articles.length,
      articles: articles.map((a) => ({ title: a.title, url: a.url, passed: true })),
      rawResponse: `AI Error: ${result.error} — all articles passed through`,
      model: resolvedSpec.model,
    });
    return { passed: articles, filterResult };
  }

  // The new schema gives us a per-item decision indexed against the input
  // batch, so the matching loop is just an index lookup.
  const { passedIndices, reasonByIndex } = resolvePassedFromFilterResult(
    result.parsed,
    articles.length
  );
  const passed: FetchedArticle[] = [];
  const articleResults: FilterResult["articles"] = [];
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const isRelevant = passedIndices.has(i);
    const reason = reasonByIndex.get(i);
    if (isRelevant) {
      article.isInvestmentRelated = true;
      passed.push(article);
    }
    articleResults.push({
      title: article.title,
      url: article.url,
      passed: isRelevant,
      reason,
    } as FilterResult["articles"][number]);
  }

  logger.info(
    `AI filter "${sourceName}" via agent "${resolvedSpec.agentName}": ${passed.length}/${articles.length} passed`,
    "AIFilter",
    {
      sourceId,
      sourceName,
      agentId: resolvedSpec.agentId,
      agentName: resolvedSpec.agentName,
      model: resolvedSpec.model,
      total: articles.length,
      passed: passed.length,
      decisionCount: result.parsed.decisions.length,
    }
  );

  const filterResult = await persistFilterRun({
    sourceId,
    sourceName,
    total: articles.length,
    passed: passed.length,
    articles: articleResults,
    rawResponse: result.rawResponse,
    model: resolvedSpec.model,
  });

  return { passed, filterResult };
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  return m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function extractAttr(element: string, attr: string): string {
  const re = new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, "i");
  const m = element.match(re);
  return m ? m[1] : "";
}

function extractElements(xml: string, tag: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) results.push(m[0]);
  return results;
}

function extractImage(itemXml: string): string | undefined {
  const enclosureRe = /<enclosure[^>]*type\s*=\s*["']image\/[^"']*["'][^>]*>/i;
  const encMatch = itemXml.match(enclosureRe);
  if (encMatch) {
    const url = extractAttr(encMatch[0], "url");
    if (url) return url;
  }
  const enclosureRe2 = /<enclosure[^>]*url\s*=\s*["']([^"']*)["'][^>]*/i;
  const encMatch2 = itemXml.match(enclosureRe2);
  if (encMatch2 && encMatch2[1]) return encMatch2[1];
  const mediaRe = /<media:content[^>]*url\s*=\s*["']([^"']*)["']/i;
  const mediaMatch = itemXml.match(mediaRe);
  if (mediaMatch) return mediaMatch[1];
  const thumbRe = /<media:thumbnail[^>]*url\s*=\s*["']([^"']*)["']/i;
  const thumbMatch = itemXml.match(thumbRe);
  if (thumbMatch) return thumbMatch[1];
  return undefined;
}

function extractCategories(itemXml: string): string[] {
  const cats: string[] = [];
  const re = /<category[^>]*>([^<]*)<\/category>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(itemXml)) !== null) {
    const c = m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
    if (c) cats.push(c);
  }
  return cats;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

// ---------------------------------------------------------------------------
// RSS Fetch (returns transient article objects, no DB writes here)
// ---------------------------------------------------------------------------

export interface RSSFetchResult {
  articles: FetchedArticle[];
  error?: string;
}

export async function fetchRSSFeed(
  url: string,
  sourceId: string,
  maxItems: number = 50
): Promise<RSSFetchResult> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml, application/atom+xml, */*",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return { articles: [], error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const xml = await response.text();
    const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
    const items = isAtom ? extractElements(xml, "entry") : extractElements(xml, "item");
    const now = new Date().toISOString();
    const articles: FetchedArticle[] = [];

    for (const item of items.slice(0, maxItems)) {
      const title = stripHtml(extractTag(item, "title")) || "Untitled";
      let link = "";
      if (isAtom) {
        const linkTagRe = /<link[^>]*href\s*=\s*["']([^"']*)["'][^>]*\/?>/i;
        const linkMatch = item.match(linkTagRe);
        link = linkMatch ? linkMatch[1] : "";
      } else {
        link = extractTag(item, "link");
      }
      const description =
        stripHtml(
          extractTag(item, "description") ||
            extractTag(item, "summary") ||
            extractTag(item, "content") ||
            extractTag(item, "content:encoded")
        ).slice(0, 1000) || "";
      const author =
        extractTag(item, "author") ||
        extractTag(item, "dc:creator") ||
        extractTag(item, "name") ||
        "";
      const pubDateRaw =
        extractTag(item, "pubDate") ||
        extractTag(item, "published") ||
        extractTag(item, "updated") ||
        extractTag(item, "dc:date") ||
        "";
      const publishedAt = parseSourceDate(pubDateRaw);

      articles.push({
        id: `transient-${Math.random().toString(36).slice(2, 10)}`,
        sourceId,
        title,
        description,
        url: link,
        author: stripHtml(author),
        publishedAt,
        fetchedAt: now,
        categories: extractCategories(item),
        imageUrl: extractImage(item),
        isInvestmentRelated: false,
      });
    }

    return { articles };
  } catch (err) {
    return { articles: [], error: err instanceof Error ? err.message : "Unknown fetch error" };
  }
}

// ---------------------------------------------------------------------------
// Apify Twitter Scraper
// ---------------------------------------------------------------------------

export function getApifyToken(): string | null {
  return process.env.APIFY_API_TOKEN || null;
}

interface ApifyTweet {
  id?: string;
  author?: { name?: string; userName?: string; profilePicture?: string };
  fullText?: string;
  text?: string;
  createdAt?: string;
  twitterUrl?: string;
  url?: string;
  // Engagement counters and flags.
  retweetCount?: number;
  replyCount?: number;
  likeCount?: number;
  quoteCount?: number;
  bookmarkCount?: number;
  viewCount?: number;
  isRetweet?: boolean;
  isQuote?: boolean;
  // Inline media — first image's URL is what we want for thumbnails.
  media?: Array<{ media_url_https?: string; type?: string }>;
  extendedEntities?: { media?: Array<{ media_url_https?: string; type?: string }> };
}

export async function fetchApifyTwitter(
  profileUrl: string,
  sourceId: string,
  sourceName: string,
  maxItems: number = 5
): Promise<RSSFetchResult> {
  const token = getApifyToken();
  if (!token) {
    return {
      articles: [],
      error: "مفتاح Apify API غير مُعد. أضف APIFY_API_TOKEN في إعدادات البيئة.",
    };
  }

  try {
    const response = await fetch(
      `https://api.apify.com/v2/acts/apidojo~twitter-scraper-lite/run-sync-get-dataset-items?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxItems, sort: "Latest", startUrls: [profileUrl] }),
        signal: AbortSignal.timeout(120000),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return { articles: [], error: `Apify error (${response.status}): ${errText.slice(0, 200)}` };
    }

    const tweets: ApifyTweet[] = await response.json();
    const now = new Date().toISOString();
    const articles: FetchedArticle[] = tweets.map((tweet) => {
      const text = tweet.fullText || tweet.text || "";
      const authorName = tweet.author?.name || tweet.author?.userName || sourceName;
      const handle = tweet.author?.userName ? `@${tweet.author.userName}` : "";
      // First inline image (if any) becomes the thumbnail.
      const firstMedia =
        tweet.extendedEntities?.media?.find((m) => m?.media_url_https)?.media_url_https ??
        tweet.media?.find((m) => m?.media_url_https)?.media_url_https;
      return {
        id: `transient-${Math.random().toString(36).slice(2, 10)}`,
        sourceId,
        sourceName,
        title: `${authorName}: ${text.slice(0, 80)}${text.length > 80 ? "..." : ""}`,
        description: text,
        url: tweet.twitterUrl || tweet.url || profileUrl,
        author: authorName,
        publishedAt: parseSourceDate(tweet.createdAt),
        fetchedAt: now,
        categories: ["twitter"],
        imageUrl: firstMedia ?? tweet.author?.profilePicture,
        isInvestmentRelated: false,
        savedToAirtable: false,
        engagement: {
          tweetId: tweet.id ?? null,
          authorHandle: handle,
          authorAvatar: tweet.author?.profilePicture ?? null,
          retweetCount: tweet.retweetCount ?? 0,
          replyCount: tweet.replyCount ?? 0,
          likeCount: tweet.likeCount ?? 0,
          quoteCount: tweet.quoteCount ?? 0,
          bookmarkCount: tweet.bookmarkCount ?? 0,
          viewCount: tweet.viewCount ?? 0,
          isRetweet: !!tweet.isRetweet,
          isQuote: !!tweet.isQuote,
        },
      };
    });
    return { articles };
  } catch (err) {
    return { articles: [], error: err instanceof Error ? err.message : "Unknown Apify error" };
  }
}

// ---------------------------------------------------------------------------
// Apify LinkedIn Scraper (supreme_coder/linkedin-post)
// ---------------------------------------------------------------------------

interface LinkedInAuthor {
  firstName?: string;
  lastName?: string;
  occupation?: string;
}

interface LinkedInVideoArtifact {
  width?: number;
  height?: number;
  fileIdentifyingUrlPathSegment?: string;
}

interface LinkedInVideoThumbnail {
  rootUrl?: string;
  artifacts?: LinkedInVideoArtifact[];
}

interface LinkedInVideoMetadata {
  thumbnail?: LinkedInVideoThumbnail;
}

interface LinkedInPost {
  type?: string;
  text?: string;
  url?: string;
  urn?: string;
  images?: string[];
  postedAtISO?: string;
  postedAtTimestamp?: number;
  authorName?: string;
  authorProfileUrl?: string;
  authorProfilePicture?: string;
  authorType?: string;
  authorProfileId?: string;
  authorUrn?: string;
  authorFollowersCount?: string | number;
  author?: LinkedInAuthor;
  linkedinVideo?: { videoPlayMetadata?: LinkedInVideoMetadata };
  // Engagement counters Apify returns.
  numShares?: number;
  numLikes?: number;
  numComments?: number;
  numImpressions?: number | null;
  canReact?: boolean;
  canPostComments?: boolean;
  canShare?: boolean;
}

function pickLinkedInImage(post: LinkedInPost): string | undefined {
  if (Array.isArray(post.images) && post.images.length > 0 && typeof post.images[0] === "string") {
    return post.images[0];
  }
  const thumb = post.linkedinVideo?.videoPlayMetadata?.thumbnail;
  if (thumb?.rootUrl && Array.isArray(thumb.artifacts) && thumb.artifacts.length > 0) {
    const best = [...thumb.artifacts].sort(
      (a, b) => (b.width ?? 0) - (a.width ?? 0)
    )[0];
    if (best?.fileIdentifyingUrlPathSegment) {
      return `${thumb.rootUrl}${best.fileIdentifyingUrlPathSegment}`;
    }
  }
  return undefined;
}

export async function fetchApifyLinkedIn(
  profileUrl: string,
  sourceId: string,
  sourceName: string,
  maxItems: number = 10
): Promise<RSSFetchResult> {
  const token = getApifyToken();
  if (!token) {
    return {
      articles: [],
      error: "مفتاح Apify API غير مُعد. أضف APIFY_API_TOKEN في إعدادات البيئة.",
    };
  }

  // Defense in depth: re-validate the URL even though create/update
  // already normalised it — we never want to forward an arbitrary URL
  // to a paid Apify actor.
  let safeUrl: string;
  try {
    safeUrl = normalizeSourceUrl("linkedin", profileUrl);
  } catch (err) {
    return {
      articles: [],
      error: err instanceof SourceValidationError ? err.message : "رابط LinkedIn غير صالح",
    };
  }

  const cappedMax = Math.max(1, Math.min(50, Math.round(maxItems)));

  try {
    const response = await fetch(
      // Token stays in the Authorization header so it never lands in
      // server logs (URL strings often do).
      "https://api.apify.com/v2/acts/supreme_coder~linkedin-post/run-sync-get-dataset-items",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          deepScrape: false,
          limitPerSource: cappedMax,
          rawData: false,
          urls: [safeUrl],
        }),
        signal: AbortSignal.timeout(180000),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return {
        articles: [],
        error: `Apify LinkedIn error (${response.status}): ${errText.slice(0, 200)}`,
      };
    }

    const raw = await response.json();
    const posts: LinkedInPost[] = Array.isArray(raw) ? raw.slice(0, cappedMax) : [];
    const now = new Date().toISOString();
    const articles: FetchedArticle[] = posts
      .filter((p) => p && (p.url || p.urn))
      .map((post) => {
        const text = (post.text ?? "").toString().trim().slice(0, 8000);
        const authorName =
          post.authorName ||
          [post.author?.firstName, post.author?.lastName].filter(Boolean).join(" ") ||
          sourceName;
        const titleSnippet = text.slice(0, 80).replace(/\s+/g, " ").trim();
        const title = titleSnippet
          ? `${authorName}: ${titleSnippet}${text.length > 80 ? "..." : ""}`
          : `${authorName} — ${post.type ?? "post"}`;
        const url = post.url || post.authorProfileUrl || safeUrl;
        const publishedAt =
          parseSourceDate(post.postedAtISO) ??
          parseSourceDate(post.postedAtTimestamp);
        return {
          id: `transient-${Math.random().toString(36).slice(2, 10)}`,
          sourceId,
          sourceName,
          title,
          description: text,
          url,
          author: authorName,
          publishedAt,
          fetchedAt: now,
          categories: ["linkedin", post.type ?? "post"].filter(Boolean) as string[],
          imageUrl: pickLinkedInImage(post) ?? post.authorProfilePicture,
          isInvestmentRelated: false,
          savedToAirtable: false,
          engagement: {
            postUrn: post.urn ?? null,
            postType: post.type ?? "post",
            authorType: post.authorType ?? null,
            authorProfileId: post.authorProfileId ?? null,
            authorProfileUrl: post.authorProfileUrl ?? null,
            authorAvatar: post.authorProfilePicture ?? null,
            authorFollowersCount: post.authorFollowersCount ?? null,
            numShares: post.numShares ?? 0,
            numLikes: post.numLikes ?? 0,
            numComments: post.numComments ?? 0,
            numImpressions: post.numImpressions ?? null,
            canReact: post.canReact ?? null,
            canShare: post.canShare ?? null,
            canComment: post.canPostComments ?? null,
          },
        };
      });
    return { articles };
  } catch (err) {
    return {
      articles: [],
      error: err instanceof Error ? err.message : "Unknown LinkedIn fetch error",
    };
  }
}

async function fetchApifyGeneric(
  url: string,
  sourceId: string,
  sourceName: string
): Promise<RSSFetchResult> {
  try {
    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return { articles: [], error: `HTTP ${response.status}` };
    const data = await response.json();
    const items = Array.isArray(data) ? data : [];
    const now = new Date().toISOString();
    const articles: FetchedArticle[] = items.slice(0, 50).map((item: Record<string, unknown>) => ({
      id: `transient-${Math.random().toString(36).slice(2, 10)}`,
      sourceId,
      sourceName,
      title: String(item.title || item.name || item.fullText || "").slice(0, 120) || "Untitled",
      description: String(item.description || item.fullText || item.text || item.content || ""),
      url: String(item.url || item.link || item.twitterUrl || ""),
      author: String(item.author || item.userName || item.authorName || sourceName),
      publishedAt: parseSourceDate(item.createdAt),
      fetchedAt: now,
      categories: ["apify"],
      isInvestmentRelated: false,
      savedToAirtable: false,
    }));
    return { articles };
  } catch (err) {
    return { articles: [], error: err instanceof Error ? err.message : "Fetch error" };
  }
}

// ---------------------------------------------------------------------------
// Article persistence (scraper_articles)
// ---------------------------------------------------------------------------

async function getKnownUrls(sourceId: string): Promise<Set<string>> {
  if (!isUuid(sourceId)) return new Set();
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_articles")
    .select("url")
    .eq("source_id", sourceId);
  if (error) throw new Error(`getKnownUrls: ${error.message}`);
  return new Set((data ?? []).map((r) => r.url));
}

// Returns the most recent published_at (in ms epoch) we've already saved for
// this source, or null when nothing's been saved yet. Drives date-based
// dedup so we don't reprocess articles older than what we have on file.
async function getLatestPublishedAt(sourceId: string): Promise<number | null> {
  if (!isUuid(sourceId)) return null;
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_articles")
    .select("published_at")
    .eq("source_id", sourceId)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestPublishedAt: ${error.message}`);
  const v = data?.published_at;
  if (!v) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

async function persistArticles(
  source: DataSource,
  newArticles: FetchedArticle[]
): Promise<FetchedArticle[]> {
  if (newArticles.length === 0 || !isUuid(source.id)) return [];
  const sb = getSupabaseAdmin();
  const rows = newArticles.map((a) => ({
    source_id: source.id,
    brand_id: source.brandId ?? null,
    url: a.url,
    title: a.title,
    description: a.description,
    author: a.author,
    published_at: a.publishedAt,
    fetched_at: a.fetchedAt,
    is_investment_related: a.isInvestmentRelated,
    saved_to_airtable: false,
    raw: {
      categories: a.categories,
      imageUrl: a.imageUrl ?? null,
      engagement: a.engagement ?? null,
    } as unknown as Database["public"]["Tables"]["scraper_articles"]["Insert"]["raw"],
  }));
  const { data, error } = await sb
    .from("scraper_articles")
    .upsert(rows, { onConflict: "source_id,url", ignoreDuplicates: false })
    .select();
  if (error) throw new Error(`persistArticles: ${error.message}`);
  return (data ?? []).map((r) => mapArticle(r, source.name));
}

// ---------------------------------------------------------------------------
// Airtable destination (writes record id back into scraper_articles)
// ---------------------------------------------------------------------------

// Cache of column-name sets keyed by Airtable table name. Refreshed lazily;
// invalidated whenever a save sees an unknown column so a freshly-added
// Airtable column starts working on the next attempt without a restart.
const tableColumnCache = new Map<string, Set<string>>();

async function getKnownColumns(
  tableName: string,
  forceRefresh = false
): Promise<Set<string> | null> {
  if (!forceRefresh && tableColumnCache.has(tableName)) {
    return tableColumnCache.get(tableName)!;
  }
  try {
    const tables = await listTables(ZTO_BASE_ID);
    const t = tables.find((tt) => tt.name === tableName || tt.id === tableName);
    if (!t) {
      logger.warn(
        `Destination table "${tableName}" not found in base — falling back to send-everything`,
        "DataSources",
        { tableName, baseId: ZTO_BASE_ID }
      );
      return null;
    }
    const set = new Set(t.fields.map((f: AirtableField) => f.name));
    tableColumnCache.set(tableName, set);
    return set;
  } catch (err) {
    logger.warn(
      `Could not list destination columns — proceeding without column validation`,
      "DataSources",
      { tableName, error: err instanceof Error ? err.message : String(err) }
    );
    return null;
  }
}

export async function saveArticleToAirtable(
  article: FetchedArticle,
  sourceName: string,
  sourceType: SourceType = "rss"
): Promise<boolean> {
  // Pick the per-type mapping. Fall back to a sane default mapping shape if
  // the settings store is unreachable so saves don't silently disappear.
  let mapping: TypeMapping;
  try {
    const perType = await getPerTypeMapping();
    mapping = getMappingForType(perType, sourceType);
  } catch (err) {
    logger.warn(
      "Could not load destination mapping — using default shape",
      "DataSources",
      { error: err instanceof Error ? err.message : String(err) }
    );
    mapping = {
      tableName: DEFAULT_TABLE_NAME,
      columns: {
        Source: { type: "field", field: "sourceName" },
        "Original Post": { type: "field", field: "description", fallback: "title" },
        Status: { type: "literal", value: "New" },
        "Link to Post (If Applicable)": { type: "field", field: "url" },
      },
    };
  }

  const enrichedArticle: FetchedArticle = {
    ...article,
    sourceName: article.sourceName || sourceName,
  };

  const known = await getKnownColumns(mapping.tableName);
  const { fields, unknownColumns } = applyMapping(
    mapping,
    enrichedArticle,
    known ?? undefined
  );

  if (unknownColumns.length > 0) {
    // Bust the cache so a column added in Airtable a moment ago isn't held
    // off forever, then re-resolve once before giving up.
    tableColumnCache.delete(mapping.tableName);
    const refreshed = await getKnownColumns(mapping.tableName, true);
    if (refreshed) {
      const recheck = applyMapping(mapping, enrichedArticle, refreshed);
      if (recheck.unknownColumns.length === 0) {
        Object.assign(fields, recheck.fields);
        unknownColumns.length = 0;
      } else {
        unknownColumns.length = 0;
        unknownColumns.push(...recheck.unknownColumns);
      }
    }
  }

  if (unknownColumns.length > 0) {
    logger.error(
      `Destination table "${mapping.tableName}" missing ${unknownColumns.length} mapped column(s) — they were skipped`,
      "DataSources",
      {
        sourceType,
        sourceName,
        articleTitle: enrichedArticle.title?.slice(0, 80),
        tableName: mapping.tableName,
        unknownColumns,
      }
    );
  }

  if (Object.keys(fields).length === 0) {
    logger.error(
      `Destination save aborted — no valid columns left after pruning unknowns`,
      "DataSources",
      {
        sourceType,
        sourceName,
        tableName: mapping.tableName,
        articleTitle: enrichedArticle.title?.slice(0, 80),
      }
    );
    return false;
  }

  try {
    const created = await createRecord(ZTO_BASE_ID, mapping.tableName, fields);
    if (isUuid(article.id)) {
      const sb = getSupabaseAdmin();
      await sb
        .from("scraper_articles")
        .update({
          saved_to_airtable: true,
          airtable_record_id: created?.id ?? null,
        })
        .eq("id", article.id);
    }
    article.savedToAirtable = true;
    return true;
  } catch (err) {
    logger.error(
      `Save to destination failed for "${enrichedArticle.title?.slice(0, 80)}"`,
      "DataSources",
      {
        sourceType,
        sourceName,
        tableName: mapping.tableName,
        error: err instanceof Error ? err.message : String(err),
      }
    );
    return false;
  }
}

export async function saveArticlesToAirtable(
  articles: FetchedArticle[],
  sourceName: string,
  sourceType: SourceType = "rss"
): Promise<number> {
  let saved = 0;
  for (const article of articles) {
    if (article.savedToAirtable) continue;
    const ok = await saveArticleToAirtable(article, sourceName, sourceType);
    if (ok) saved++;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// Fetch single source (scraper_fetch_runs row + persisted articles)
// ---------------------------------------------------------------------------

async function recordRun(input: {
  sourceId: string;
  brandId: string | null;
  status: "success" | "error" | "partial" | "empty" | "skipped";
  startedAt: Date;
  itemsFetched: number;
  itemsPassed: number;
  itemsSaved: number;
  errorMessage?: string;
}): Promise<void> {
  if (!isUuid(input.sourceId)) return;
  const sb = getSupabaseAdmin();
  const finishedAt = new Date();
  await sb.from("scraper_fetch_runs").insert({
    source_id: input.sourceId,
    brand_id: input.brandId,
    status: input.status,
    started_at: input.startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - input.startedAt.getTime(),
    items_fetched: input.itemsFetched,
    items_passed: input.itemsPassed,
    items_saved: input.itemsSaved,
    error_message: input.errorMessage ?? null,
  });
}

async function bumpSourceStatus(
  sourceId: string,
  ok: boolean,
  errorMessage?: string
): Promise<void> {
  if (!isUuid(sourceId)) return;
  const sb = getSupabaseAdmin();
  const now = new Date().toISOString();
  if (ok) {
    await sb
      .from("scraper_sources")
      .update({
        last_fetched_at: now,
        last_success_at: now,
        last_error: null,
        consecutive_errors: 0,
        updated_at: now,
      })
      .eq("id", sourceId);
  } else {
    const { data } = await sb
      .from("scraper_sources")
      .select("consecutive_errors")
      .eq("id", sourceId)
      .maybeSingle();
    const errCount = (data?.consecutive_errors ?? 0) + 1;
    await sb
      .from("scraper_sources")
      .update({
        last_fetched_at: now,
        last_error: errorMessage ?? "unknown error",
        consecutive_errors: errCount,
        updated_at: now,
      })
      .eq("id", sourceId);
  }
}

// Stateless preview fetch: validate the URL for the type, hit the provider,
// return up to `limit` articles without writing anything to scraper_articles,
// scraper_fetch_runs, or the source row. Used by the "test source" UX so the
// admin can confirm the feed parses before committing to a save.
export async function previewSource(args: {
  type: SourceType;
  url: string;
  limit?: number;
}): Promise<RSSFetchResult> {
  const limit = Math.max(1, Math.min(10, args.limit ?? 5));
  let safeUrl: string;
  try {
    safeUrl = normalizeSourceUrl(args.type, args.url);
  } catch (err) {
    return {
      articles: [],
      error: err instanceof SourceValidationError ? err.message : "رابط غير صالح",
    };
  }

  // Use a synthetic sourceId / sourceName so the existing fetchers can
  // populate sourceName + transient ids consistently.
  const TEST_ID = "preview";
  const TEST_NAME = "اختبار";

  let result: RSSFetchResult;
  try {
    if (args.type === "rss") {
      result = await fetchRSSFeed(safeUrl, TEST_ID, limit);
    } else if (args.type === "twitter") {
      result = await fetchApifyTwitter(safeUrl, TEST_ID, TEST_NAME, limit);
    } else if (args.type === "linkedin") {
      result = await fetchApifyLinkedIn(safeUrl, TEST_ID, TEST_NAME, limit);
    } else if (args.type === "apify") {
      result = await fetchApifyGeneric(safeUrl, TEST_ID, TEST_NAME);
    } else {
      return {
        articles: [],
        error: `الاختبار غير مدعوم لهذا النوع: ${args.type}`,
      };
    }
  } catch (err) {
    return {
      articles: [],
      error: err instanceof Error ? err.message : "فشل الاختبار",
    };
  }

  // Trim to the requested limit and strip any incidental DB-only fields.
  const articles = result.articles.slice(0, limit).map((a) => ({
    ...a,
    sourceName: TEST_NAME,
    savedToAirtable: false,
  }));
  return { articles, error: result.error };
}

export async function fetchSource(sourceId: string): Promise<RSSFetchResult> {
  const source = await getDataSourceById(sourceId);
  if (!source) return { articles: [], error: "Source not found" };

  const startedAt = new Date();
  let result: RSSFetchResult;
  try {
    if (source.type === "rss") {
      result = await fetchRSSFeed(source.url, source.id);
    } else if (source.type === "twitter") {
      result = await fetchApifyTwitter(source.url, source.id, source.name);
    } else if (source.type === "linkedin") {
      result = await fetchApifyLinkedIn(source.url, source.id, source.name);
    } else if (source.type === "apify") {
      result = await fetchApifyGeneric(source.url, source.id, source.name);
    } else {
      result = { articles: [], error: `Fetching not yet supported for type "${source.type}"` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown fetch error";
    logger.error(
      `Fetch threw for "${source.name}" (${source.type}): ${msg}`,
      "DataSources",
      { sourceId: source.id, sourceName: source.name, sourceType: source.type, sourceUrl: source.url, error: msg }
    );
    await bumpSourceStatus(source.id, false, msg);
    await recordRun({
      sourceId: source.id,
      brandId: source.brandId ?? null,
      status: "error",
      startedAt,
      itemsFetched: 0,
      itemsPassed: 0,
      itemsSaved: 0,
      errorMessage: msg,
    });
    return { articles: [], error: msg };
  }

  if (result.error) {
    logger.warn(
      `Fetch returned error for "${source.name}" (${source.type}): ${result.error}`,
      "DataSources",
      { sourceId: source.id, sourceName: source.name, sourceType: source.type, sourceUrl: source.url, error: result.error }
    );
    await bumpSourceStatus(source.id, false, result.error);
    await recordRun({
      sourceId: source.id,
      brandId: source.brandId ?? null,
      status: "error",
      startedAt,
      itemsFetched: result.articles.length,
      itemsPassed: 0,
      itemsSaved: 0,
      errorMessage: result.error,
    });
    return result;
  }

  // Date-based dedup with a 30-minute safety overlap. Items whose
  // publishedAt is newer than (cutoff − 30 min) survive — RSS feeds
  // routinely publish out of order (a slow editorial workflow lands an
  // "older" piece a few minutes after a "newer" one), and the 30-min
  // window costs nothing because the known-URL set + DB-level
  // UNIQUE(source_id, url) catch the actual duplicates inside that
  // window. Items with no parseable date (publishedAt === null) fall
  // through to the known-URL check unconditionally so a feed that
  // suddenly drops dates doesn't flood Airtable on every tick.
  const cutoff = await getLatestPublishedAt(source.id);
  const known = await getKnownUrls(source.id);
  const overlap = 30 * 60 * 1000; // 30 min
  const fresh = result.articles.filter((a) => {
    if (!a.url) return false;
    if (known.has(a.url)) return false; // saved before — skip outright
    if (cutoff != null && a.publishedAt) {
      const t = Date.parse(a.publishedAt);
      if (Number.isFinite(t)) return t >= cutoff - overlap;
    }
    // No cutoff yet, or unparseable / null date: known-URL check above
    // already filtered, so this item is genuinely new.
    return true;
  });
  fresh.forEach((a) => (a.sourceName = source.name));

  const persisted = await persistArticles(source, fresh);
  // Re-link transient ids to db ids by url so saving to Airtable updates the right row
  const idByUrl = new Map(persisted.map((p) => [p.url, p.id]));
  fresh.forEach((a) => {
    const dbId = idByUrl.get(a.url);
    if (dbId) a.id = dbId;
  });

  let savedCount = 0;
  let passedCount = fresh.length;
  if (fresh.length > 0) {
    if (source.topic === "news") {
      try {
        const filterSpec = await resolveFilterAgentForSource(source);
        const { passed } = await filterArticlesWithAI(
          fresh,
          source.id,
          source.name,
          filterSpec
        );
        passedCount = passed.length;
        if (passed.length > 0) savedCount = await saveArticlesToAirtable(passed, source.name, source.type);
      } catch (err) {
        logger.error(
          `AI filter+save pipeline failed for "${source.name}"`,
          "DataSources",
          err
        );
      }
    } else {
      try {
        savedCount = await saveArticlesToAirtable(fresh, source.name, source.type);
      } catch (err) {
        logger.error(
          `Airtable save failed for "${source.name}"`,
          "DataSources",
          err
        );
      }
    }
  }

  await bumpSourceStatus(source.id, true);
  await recordRun({
    sourceId: source.id,
    brandId: source.brandId ?? null,
    status: "success",
    startedAt,
    itemsFetched: result.articles.length,
    itemsPassed: passedCount,
    itemsSaved: savedCount,
  });

  return { articles: fresh.length > 0 ? persisted : [] };
}

// ---------------------------------------------------------------------------
// Fetch all active sources (parallel)
// ---------------------------------------------------------------------------

export async function fetchAllSources(): Promise<
  { sourceId: string; sourceName: string; result: RSSFetchResult }[]
> {
  const all = await getDataSources();
  const active = all.filter((s) => s.isActive);
  const results = await Promise.allSettled(
    active.map(async (source) => {
      const result = await fetchSource(source.id);
      return { sourceId: source.id, sourceName: source.name, result };
    })
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      sourceId: active[i].id,
      sourceName: active[i].name,
      result: {
        articles: [],
        error:
          r.reason instanceof Error ? r.reason.message : String(r.reason ?? "Unknown error"),
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string | null | undefined): boolean {
  return !!s && UUID_RE.test(s);
}
