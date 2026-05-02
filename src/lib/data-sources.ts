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
  getDestinationMapping,
  DESTINATION_BASE_ID,
  DESTINATION_TABLE_NAME,
} from "@/lib/destination-mapping";

// Hard-coded destination is now sourced from destination-mapping.ts so the
// dashboard can override the column shape at runtime without redeploying.
const ZTO_BASE_ID = DESTINATION_BASE_ID;
const APIFY_TABLE_NAME = DESTINATION_TABLE_NAME;

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
}

interface SourcePayloadValidated {
  name?: string;
  url?: string;
  type?: SourceType;
  category?: SourceCategory;
  topic?: SourceTopic;
  fetchInterval?: number;
  isActive?: boolean;
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
}

export interface FetchedArticle {
  id: string;
  sourceId: string;
  sourceName?: string;
  title: string;
  description: string;
  url: string;
  author: string;
  publishedAt: string;
  fetchedAt: string;
  categories: string[];
  imageUrl?: string;
  isInvestmentRelated: boolean;
  savedToAirtable?: boolean;
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
  articles: { title: string; url: string; passed: boolean }[];
  rawResponse?: string;
}

interface ArticleRaw {
  categories?: unknown;
  imageUrl?: unknown;
  externalId?: unknown;
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
  };
}

function mapArticle(r: ArticleRow, sourceName?: string): FetchedArticle {
  const raw = (r.raw ?? {}) as ArticleRaw;
  return {
    id: r.id,
    sourceId: r.source_id,
    sourceName,
    title: r.title ?? "",
    description: r.description ?? "",
    url: r.url,
    author: r.author ?? "",
    publishedAt: r.published_at ?? r.fetched_at,
    fetchedAt: r.fetched_at,
    categories: Array.isArray(raw.categories)
      ? (raw.categories as unknown[]).filter((c): c is string => typeof c === "string")
      : [],
    imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : undefined,
    isInvestmentRelated: !!r.is_investment_related,
    savedToAirtable: r.saved_to_airtable,
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

const AI_FILTER_MODEL = "openai/gpt-4o-mini";

const AI_FILTER_SYSTEM_PROMPT = `You're an agent that analyzes the titles of some news and ONLY OUTPUTS JSON ONLY. Just analyze the title of the news and output whether it's related to startups & rounds of investments of startups or not. If you have multiple titles, extract the ones that have to do with startups & funding and remove the rest. Don't tweak anything in them, keep them as is with the headline & the link. Output them within the json as news with the value being the news and then the link leading to each. Stack all the news in the 2nd key as a paragraph where an empty row in between each news and its corresponding link. Don't create a collection.

Your output is the following key with values either "yes" or "no".

Investment_related:
News:`;

// OpenRouter structured-outputs schema. strict=true so the model can't
// return extra keys or wrong types — drastically simpler downstream parsing
// than the old "match any JSON-ish blob" heuristics.
const AI_FILTER_RESPONSE_SCHEMA = {
  name: "investment_filter",
  strict: true,
  schema: {
    type: "object",
    properties: {
      Investment_related: {
        type: "string",
        enum: ["yes", "no"],
        description:
          "Set to 'yes' if any of the supplied titles are about a startup funding round, investment, or fundraise. Otherwise 'no'.",
      },
      News: {
        type: "string",
        description:
          "When Investment_related is 'yes', list ONLY the qualifying titles followed by their link. Each entry separated by a blank line. Keep titles verbatim, never invent links. When Investment_related is 'no', return an empty string.",
      },
    },
    required: ["Investment_related", "News"],
    additionalProperties: false,
  },
} as const;

interface OpenRouterChoice {
  message?: { content?: string | null };
}
interface OpenRouterError {
  error?: { message?: string };
}
interface AIFilterParsed {
  Investment_related: "yes" | "no";
  News: string;
}

function parseStrictFilterResponse(raw: string): AIFilterParsed | null {
  if (!raw) return null;
  // strict mode usually returns clean JSON, but some providers prefix/suffix
  // whitespace or markdown fences. Strip a single fence if present.
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed.Investment_related === "yes" || parsed.Investment_related === "no") &&
      typeof parsed.News === "string"
    ) {
      return parsed as AIFilterParsed;
    }
  } catch {
    // fall through
  }
  return null;
}

async function persistFilterRun(args: {
  sourceId: string;
  sourceName: string;
  total: number;
  passed: number;
  articles: { title: string; url: string; passed: boolean }[];
  rawResponse?: string;
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
      model: AI_FILTER_MODEL,
      articles: args.articles as unknown as Database["public"]["Tables"]["scraper_filter_runs"]["Insert"]["articles"],
      raw_response: args.rawResponse ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`persistFilterRun: ${error.message}`);
  return mapFilterRun(data);
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
  sourceName: string
): Promise<{ passed: FetchedArticle[]; filterResult: FilterResult }> {
  if (articles.length === 0) {
    const filterResult = await persistFilterRun({
      sourceId,
      sourceName,
      total: 0,
      passed: 0,
      articles: [],
      rawResponse: "no articles to filter",
    });
    return { passed: [], filterResult };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    logger.warn(
      "OpenRouter API key not configured — passing all articles through filter",
      "AIFilter",
      { sourceId, sourceName, total: articles.length }
    );
    const filterResult = await persistFilterRun({
      sourceId,
      sourceName,
      total: articles.length,
      passed: articles.length,
      articles: articles.map((a) => ({ title: a.title, url: a.url, passed: true })),
      rawResponse: "OpenRouter API key not configured — all articles passed through",
    });
    return { passed: articles, filterResult };
  }

  const userMessage = articles
    .map((a, i) => `${i + 1}. ${a.title}\nLink: ${a.url}`)
    .join("\n\n");

  let rawResponse = "";
  let parsed: AIFilterParsed | null = null;

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
        model: AI_FILTER_MODEL,
        messages: [
          { role: "system", content: AI_FILTER_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0,
        max_tokens: 4000,
        response_format: {
          type: "json_schema",
          json_schema: AI_FILTER_RESPONSE_SCHEMA,
        },
        provider: { require_parameters: true },
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!response.ok) {
      const errText = await response.text();
      let detail = errText.slice(0, 300);
      try {
        const j = JSON.parse(errText) as OpenRouterError;
        if (j.error?.message) detail = j.error.message.slice(0, 300);
      } catch {
        // not JSON, keep raw
      }
      throw new Error(`OpenRouter ${response.status}: ${detail}`);
    }

    const data = (await response.json()) as { choices?: OpenRouterChoice[] };
    rawResponse = data.choices?.[0]?.message?.content ?? "";
    parsed = parseStrictFilterResponse(rawResponse);
    if (!parsed) {
      throw new Error("Filter response did not match schema");
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown AI error";
    logger.error(
      `AI filter call failed for "${sourceName}" — passing all articles through`,
      "AIFilter",
      { sourceId, sourceName, error: errorMsg, total: articles.length }
    );
    const filterResult = await persistFilterRun({
      sourceId,
      sourceName,
      total: articles.length,
      passed: articles.length,
      articles: articles.map((a) => ({ title: a.title, url: a.url, passed: true })),
      rawResponse: `AI Error: ${errorMsg} — all articles passed through`,
    });
    return { passed: articles, filterResult };
  }

  // Build the "passed" set strictly from the structured response. We match
  // by URL when present (definitive), then fall back to title substring for
  // entries the model rendered as "Title\nlink" without an exact URL match.
  const passedUrls = new Set<string>();
  const passedTitles: string[] = [];

  if (parsed.Investment_related === "yes" && parsed.News) {
    const urlMatches = parsed.News.match(/https?:\/\/[^\s"<>)]+/g) ?? [];
    for (const u of urlMatches) {
      passedUrls.add(u.replace(/[.,;:)]+$/, ""));
    }
    // Each entry is title-then-link separated by blank lines. Pull title
    // candidates: any non-empty line that isn't a URL.
    for (const line of parsed.News.split(/\r?\n/)) {
      const t = line.trim();
      if (t && !/^https?:\/\//i.test(t)) passedTitles.push(t);
    }
  }

  const passed: FetchedArticle[] = [];
  const articleResults: FilterResult["articles"] = [];

  for (const article of articles) {
    const titleNorm = article.title.trim();
    const isRelevant =
      passedUrls.has(article.url) ||
      passedTitles.some(
        (t) =>
          t.length > 10 &&
          (titleNorm.toLowerCase().includes(t.toLowerCase()) ||
            t.toLowerCase().includes(titleNorm.toLowerCase()))
      );
    if (isRelevant) {
      article.isInvestmentRelated = true;
      passed.push(article);
    }
    articleResults.push({ title: article.title, url: article.url, passed: isRelevant });
  }

  logger.info(
    `AI filter "${sourceName}": ${passed.length}/${articles.length} passed`,
    "AIFilter",
    {
      sourceId,
      sourceName,
      total: articles.length,
      passed: passed.length,
      investmentRelated: parsed.Investment_related,
    }
  );

  const filterResult = await persistFilterRun({
    sourceId,
    sourceName,
    total: articles.length,
    passed: passed.length,
    articles: articleResults,
    rawResponse,
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
      let publishedAt: string;
      try {
        publishedAt = pubDateRaw ? new Date(pubDateRaw).toISOString() : now;
      } catch {
        publishedAt = now;
      }

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
  author?: { name?: string; userName?: string };
  fullText?: string;
  text?: string;
  createdAt?: string;
  twitterUrl?: string;
  url?: string;
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
      return {
        id: `transient-${Math.random().toString(36).slice(2, 10)}`,
        sourceId,
        sourceName,
        title: `${authorName}: ${text.slice(0, 80)}${text.length > 80 ? "..." : ""}`,
        description: text,
        url: tweet.twitterUrl || tweet.url || profileUrl,
        author: authorName,
        publishedAt: tweet.createdAt ? new Date(tweet.createdAt).toISOString() : now,
        fetchedAt: now,
        categories: ["twitter"],
        isInvestmentRelated: false,
        savedToAirtable: false,
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
  author?: LinkedInAuthor;
  linkedinVideo?: { videoPlayMetadata?: LinkedInVideoMetadata };
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
        let publishedAt = now;
        if (post.postedAtISO) {
          const d = new Date(post.postedAtISO);
          if (!isNaN(d.getTime())) publishedAt = d.toISOString();
        } else if (typeof post.postedAtTimestamp === "number") {
          const d = new Date(post.postedAtTimestamp);
          if (!isNaN(d.getTime())) publishedAt = d.toISOString();
        }
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
          imageUrl: pickLinkedInImage(post),
          isInvestmentRelated: false,
          savedToAirtable: false,
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
      publishedAt: item.createdAt ? new Date(String(item.createdAt)).toISOString() : now,
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

export async function saveArticleToAirtable(
  article: FetchedArticle,
  sourceName: string
): Promise<boolean> {
  try {
    // Pull the latest mapping per call (cheap one-row lookup) so admin edits
    // take effect immediately instead of waiting for a process restart.
    const mapping = await getDestinationMapping().catch(() => null);
    const enrichedArticle: FetchedArticle = {
      ...article,
      sourceName: article.sourceName || sourceName,
    };
    const fields = mapping
      ? applyMapping(mapping, enrichedArticle)
      : {
          Source: sourceName,
          "Original Post": article.description || article.title,
          Status: "New",
          "Link to Post (If Applicable)": article.url,
        };
    const created = await createRecord(ZTO_BASE_ID, APIFY_TABLE_NAME, fields);
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
      `Save to destination failed for "${article.title?.slice(0, 80)}"`,
      "DataSources",
      { error: err instanceof Error ? err.message : String(err) }
    );
    return false;
  }
}

export async function saveArticlesToAirtable(
  articles: FetchedArticle[],
  sourceName: string
): Promise<number> {
  let saved = 0;
  for (const article of articles) {
    if (article.savedToAirtable) continue;
    const ok = await saveArticleToAirtable(article, sourceName);
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

  const known = await getKnownUrls(source.id);
  const fresh = result.articles.filter((a) => a.url && !known.has(a.url));
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
        const { passed } = await filterArticlesWithAI(fresh, source.id, source.name);
        passedCount = passed.length;
        if (passed.length > 0) savedCount = await saveArticlesToAirtable(passed, source.name);
      } catch (err) {
        logger.error(
          `AI filter+save pipeline failed for "${source.name}"`,
          "DataSources",
          err
        );
      }
    } else {
      try {
        savedCount = await saveArticlesToAirtable(fresh, source.name);
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
