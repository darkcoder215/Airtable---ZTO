// Data sources management — RSS / Twitter / Apify, persisted in Supabase.
// Source CRUD lives in scraper_sources, fetched articles in scraper_articles,
// AI filter outcomes in scraper_filter_runs, and per-fetch run rows in
// scraper_fetch_runs. Airtable continues to be the human-facing destination.

import { createRecord } from "./airtable";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

const ZTO_BASE_ID = "appIpXIFs2yxyxaUm";
const APIFY_TABLE_NAME = "Apify - Websites";

type SourceRow = Database["public"]["Tables"]["scraper_sources"]["Row"];
type SourceInsert = Database["public"]["Tables"]["scraper_sources"]["Insert"];
type ArticleRow = Database["public"]["Tables"]["scraper_articles"]["Row"];
type FilterRunRow = Database["public"]["Tables"]["scraper_filter_runs"]["Row"];

export type SourceType = "rss" | "twitter" | "linkedin" | "apify" | "custom";
export type SourceCategory = "startups" | "investment" | "tech" | "general";

export interface DataSource {
  id: string;
  name: string;
  type: SourceType;
  url: string;
  category: SourceCategory;
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
  const sb = getSupabaseAdmin();
  const insert: SourceInsert = {
    name: config.name,
    type: config.type,
    url: config.url,
    category: config.category,
    is_active: config.isActive,
    fetch_interval_minutes: config.fetchInterval,
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

export async function updateDataSource(
  id: string,
  update: Partial<DataSource>
): Promise<DataSource | null> {
  if (!isUuid(id)) return null;
  const sb = getSupabaseAdmin();
  const patch: Database["public"]["Tables"]["scraper_sources"]["Update"] = {
    updated_at: new Date().toISOString(),
  };
  if (update.name !== undefined) patch.name = update.name;
  if (update.type !== undefined) patch.type = update.type;
  if (update.url !== undefined) patch.url = update.url;
  if (update.category !== undefined) patch.category = update.category;
  if (update.isActive !== undefined) patch.is_active = update.isActive;
  if (update.fetchInterval !== undefined) patch.fetch_interval_minutes = update.fetchInterval;
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

export async function filterArticlesWithAI(
  articles: FetchedArticle[],
  sourceId: string,
  sourceName: string
): Promise<{ passed: FetchedArticle[]; filterResult: FilterResult }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
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
        temperature: 0.1,
        max_tokens: 4000,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter error (${response.status}): ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    rawResponse = data.choices?.[0]?.message?.content || "";
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown AI error";
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

  const passedUrls = new Set<string>();
  const passedTitles = new Set<string>();

  try {
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.Investment_related === "yes" || parsed.investment_related === "yes") {
        articles.forEach((a) => passedUrls.add(a.url));
      } else if (parsed.Investment_related === "no" || parsed.investment_related === "no") {
        if (parsed.News) {
          const urls = (parsed.News as string).match(/https?:\/\/[^\s"<>]+/g) || [];
          urls.forEach((u: string) => passedUrls.add(u));
        }
      } else if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.Investment_related === "yes" || item.investment_related === "yes") {
            if (item.link) passedUrls.add(item.link);
            if (item.News || item.news || item.title) {
              passedTitles.add(String(item.News || item.news || item.title).trim());
            }
          }
        }
      } else {
        for (const key of Object.keys(parsed)) {
          const val = parsed[key];
          if (Array.isArray(val)) {
            for (const item of val) {
              if (typeof item === "object" && item !== null) {
                if (item.Investment_related === "yes" || item.investment_related === "yes") {
                  if (item.link) passedUrls.add(item.link);
                  if (item.News || item.news || item.title) {
                    passedTitles.add(String(item.News || item.news || item.title).trim());
                  }
                }
              }
            }
          } else if (typeof val === "string" && key.toLowerCase().includes("news")) {
            const urls = val.match(/https?:\/\/[^\s"<>]+/g) || [];
            urls.forEach((u: string) => passedUrls.add(u));
          }
        }
      }
    }
  } catch {
    const urls = rawResponse.match(/https?:\/\/[^\s"<>]+/g) || [];
    urls.forEach((u) => passedUrls.add(u));
  }

  const passed: FetchedArticle[] = [];
  const articleResults: FilterResult["articles"] = [];

  for (const article of articles) {
    const isRelevant =
      passedUrls.has(article.url) ||
      passedTitles.has(article.title.trim()) ||
      Array.from(passedTitles).some(
        (t) =>
          t.length > 10 &&
          (article.title.toLowerCase().includes(t.toLowerCase()) ||
            t.toLowerCase().includes(article.title.toLowerCase()))
      );
    if (isRelevant) {
      article.isInvestmentRelated = true;
      passed.push(article);
    }
    articleResults.push({ title: article.title, url: article.url, passed: isRelevant });
  }

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
    const created = await createRecord(ZTO_BASE_ID, APIFY_TABLE_NAME, {
      Source: sourceName,
      "Original Post": article.description || article.title,
      Status: "New",
      "Link to Post (If Applicable)": article.url,
    });
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
  } catch {
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
    } else if (source.type === "apify") {
      result = await fetchApifyGeneric(source.url, source.id, source.name);
    } else {
      result = { articles: [], error: `Fetching not yet supported for type "${source.type}"` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown fetch error";
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
    if (source.type === "rss") {
      try {
        const { passed } = await filterArticlesWithAI(fresh, source.id, source.name);
        passedCount = passed.length;
        if (passed.length > 0) savedCount = await saveArticlesToAirtable(passed, source.name);
      } catch {
        // Non-blocking
      }
    } else {
      try {
        savedCount = await saveArticlesToAirtable(fresh, source.name);
      } catch {
        // Non-blocking
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
