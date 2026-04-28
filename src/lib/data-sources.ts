// Data sources management - RSS feeds, Apify/Twitter, social media, custom scrapers
// In-memory storage (same pattern as agents.ts)

import { createRecord, listRecords } from "./airtable";
import { logger } from "./logger";
import { getBrandIntervalMap, DEFAULT_BRAND_INTERVAL_MINUTES } from "./brands";

// Base & table for saving scraped content
const ZTO_BASE_ID = "appIpXIFs2yxyxaUm";
const APIFY_TABLE_NAME = "Apify - Websites";

// Time-window defaults for the "find latest news" filter
const TWITTER_FRESHNESS_MIN = 20;
const RSS_FRESHNESS_HOURS = 24;
// How far back we read Airtable to build the cursor + dedup set
const STATE_LOOKBACK_DAYS = 30;

export interface DataSource {
  id: string;
  name: string;
  type: "rss" | "twitter" | "linkedin" | "apify" | "custom";
  url: string;
  category: "startups" | "investment" | "tech" | "general";
  brand: string;
  isActive: boolean;
  fetchInterval: number; // minutes — legacy field, retained but no longer authoritative
  lastFetchedAt: string | null;
  createdAt: string;
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
  articles: {
    title: string;
    url: string;
    passed: boolean;
  }[];
  rawResponse?: string;
}

// In-memory stores
let dataSources: DataSource[] = [];
let fetchedArticles: FetchedArticle[] = [];
let filterHistory: FilterResult[] = [];

// ---------------------------------------------------------------------------
// Default sources
// ---------------------------------------------------------------------------

export function getDefaultSources(): DataSource[] {
  const now = new Date().toISOString();
  return [
    {
      id: "src-default-techcrunch",
      name: "TechCrunch",
      type: "rss",
      url: "https://techcrunch.com/feed/",
      category: "tech",
      brand: "Zero to One",
      isActive: true,
      fetchInterval: 30,
      lastFetchedAt: null,
      createdAt: now,
    },
    {
      id: "src-default-venturebeat",
      name: "VentureBeat",
      type: "rss",
      url: "https://feeds.feedburner.com/venturebeat/SZYF",
      category: "tech",
      brand: "Zero to One",
      isActive: true,
      fetchInterval: 30,
      lastFetchedAt: null,
      createdAt: now,
    },
    {
      id: "src-default-jawlah",
      name: "Jawlah",
      type: "rss",
      url: "https://jawlah.co/feed",
      category: "startups",
      brand: "Zero to One",
      isActive: true,
      fetchInterval: 60,
      lastFetchedAt: null,
      createdAt: now,
    },
    {
      id: "src-default-waya",
      name: "Waya Media",
      type: "rss",
      url: "https://waya.media/feed/",
      category: "general",
      brand: "Zero to One",
      isActive: true,
      fetchInterval: 60,
      lastFetchedAt: null,
      createdAt: now,
    },
    {
      id: "src-default-finsmes",
      name: "FinSMEs",
      type: "rss",
      url: "https://www.finsmes.com/feed",
      category: "investment",
      brand: "Zero to One",
      isActive: true,
      fetchInterval: 30,
      lastFetchedAt: null,
      createdAt: now,
    },
    {
      id: "src-default-zawya",
      name: "Zawya",
      type: "rss",
      url: "https://www.zawya.com/sitemaps/en/rss",
      category: "investment",
      brand: "Zero to One",
      isActive: true,
      fetchInterval: 30,
      lastFetchedAt: null,
      createdAt: now,
    },
    // X (Twitter) accounts — scraped via Apify twitter-scraper-lite
    ...getDefaultTwitterSources(now),
  ];
}

function getDefaultTwitterSources(now: string): DataSource[] {
  const accounts = [
    { handle: "athmnsa", name: "أثمن للعقارات" },
    { handle: "ahmed_alshuhail", name: "أحمد الشهيل" },
    { handle: "realEstates_10", name: "عبدالله العباد" },
    { handle: "aqari__sa", name: "أهل العقار" },
    { handle: "Bandar_MD", name: "بندر الضحيك" },
    { handle: "alfageeh9", name: "المهندس احمد الفقيه" },
    { handle: "Alajelab", name: "عبدالله العجل" },
    { handle: "dr_alshuwaier", name: "د بدر الشويعر" },
    { handle: "AZK_SA", name: "عبدالله الخميس" },
    { handle: "THEWOLFOFTASI", name: "Wolf of Tasi" },
    { handle: "altuwaim_s", name: "سعد التويم" },
    { handle: "Brooker_2030", name: "عبدالله القرني" },
    { handle: "Alaboudi_rei", name: "العبودي بن عبدالله" },
    { handle: "abdulnassersa", name: "عبدالناصر العبداللطيف" },
    { handle: "majedawad6", name: "ماجد العرابي الحارثي" },
    { handle: "U_FUN1", name: "عبدالله اللعبون" },
  ];
  return accounts.map((a) => ({
    id: `src-default-x-${a.handle}`,
    name: `${a.name} (@${a.handle})`,
    type: "twitter" as const,
    url: `https://x.com/${a.handle}`,
    category: "investment" as const,
    brand: "Zero to One",
    isActive: true,
    fetchInterval: 180,
    lastFetchedAt: null,
    createdAt: now,
  }));
}

// ---------------------------------------------------------------------------
// Initialization – seed defaults if store is empty
// ---------------------------------------------------------------------------

function ensureInitialized() {
  if (dataSources.length === 0) {
    dataSources = getDefaultSources();
  }
}

// ---------------------------------------------------------------------------
// CRUD for data sources
// ---------------------------------------------------------------------------

export function getDataSources(): DataSource[] {
  ensureInitialized();
  return [...dataSources];
}

export function getDataSourceById(id: string): DataSource | null {
  ensureInitialized();
  return dataSources.find((s) => s.id === id) || null;
}

export function createDataSource(
  config: Omit<DataSource, "id" | "createdAt" | "lastFetchedAt">
): DataSource {
  ensureInitialized();
  const source: DataSource = {
    ...config,
    brand: config.brand?.trim() || "Zero to One",
    id: `src-${Date.now()}`,
    lastFetchedAt: null,
    createdAt: new Date().toISOString(),
  };
  dataSources.push(source);
  return source;
}

export function updateDataSource(
  id: string,
  update: Partial<DataSource>
): DataSource | null {
  ensureInitialized();
  const index = dataSources.findIndex((s) => s.id === id);
  if (index === -1) return null;
  dataSources[index] = { ...dataSources[index], ...update };
  return dataSources[index];
}

export function deleteDataSource(id: string): boolean {
  ensureInitialized();
  const index = dataSources.findIndex((s) => s.id === id);
  if (index === -1) return false;
  dataSources.splice(index, 1);
  // Also remove articles belonging to this source
  fetchedArticles = fetchedArticles.filter((a) => a.sourceId !== id);
  return true;
}

// ---------------------------------------------------------------------------
// Article helpers
// ---------------------------------------------------------------------------

export function getArticles(sourceId?: string): FetchedArticle[] {
  if (sourceId) return fetchedArticles.filter((a) => a.sourceId === sourceId);
  return [...fetchedArticles];
}

export function getArticleById(id: string): FetchedArticle | null {
  return fetchedArticles.find((a) => a.id === id) || null;
}

export function getFilterHistory(): FilterResult[] {
  return [...filterHistory].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// ---------------------------------------------------------------------------
// AI Filtering – uses OpenRouter GPT-4o-mini to classify articles
// ---------------------------------------------------------------------------

const AI_FILTER_MODEL = "openai/gpt-4o-mini";

const AI_FILTER_SYSTEM_PROMPT = `You're an agent that analyzes the titles of some news and ONLY OUTPUTS JSON ONLY. Just analyze the title of the news and output whether it's related to startups & rounds of investments of startups or not. If you have multiple titles, extract the ones that have to do with startups & funding and remove the rest. Don't tweak anything in them, keep them as is with the headline & the link. Output them within the json as news with the value being the news and then the link leading to each. Stack all the news in the 2nd key as a paragraph where an empty row in between each news and its corresponding link. Don't create a collection.

Your output is the following key with values either "yes" or "no".

Investment_related:
News:`;

interface AIFilterArticle {
  Investment_related: string;
  News: string;
  link?: string;
}

export async function filterArticlesWithAI(
  articles: FetchedArticle[],
  sourceId: string,
  sourceName: string
): Promise<{ passed: FetchedArticle[]; filterResult: FilterResult }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    // No API key — pass all articles through unfiltered
    const result: FilterResult = {
      id: `filter-${Date.now()}`,
      sourceId,
      sourceName,
      timestamp: new Date().toISOString(),
      totalArticles: articles.length,
      passedArticles: articles.length,
      rejectedArticles: 0,
      model: AI_FILTER_MODEL,
      articles: articles.map((a) => ({ title: a.title, url: a.url, passed: true })),
      rawResponse: "OpenRouter API key not configured — all articles passed through",
    };
    filterHistory.push(result);
    return { passed: articles, filterResult: result };
  }

  // Build the user message with article titles and links
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
    // On AI error, pass all articles through
    const errorMsg = err instanceof Error ? err.message : "Unknown AI error";
    const result: FilterResult = {
      id: `filter-${Date.now()}`,
      sourceId,
      sourceName,
      timestamp: new Date().toISOString(),
      totalArticles: articles.length,
      passedArticles: articles.length,
      rejectedArticles: 0,
      model: AI_FILTER_MODEL,
      articles: articles.map((a) => ({ title: a.title, url: a.url, passed: true })),
      rawResponse: `AI Error: ${errorMsg} — all articles passed through`,
    };
    filterHistory.push(result);
    return { passed: articles, filterResult: result };
  }

  // Parse the AI response — try to extract JSON
  const passedUrls = new Set<string>();
  const passedTitles = new Set<string>();

  try {
    // Try to find JSON in the response
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      // Handle various response formats the AI might return
      if (parsed.Investment_related === "yes" || parsed.investment_related === "yes") {
        // Single article case — all passed
        articles.forEach((a) => passedUrls.add(a.url));
      } else if (parsed.Investment_related === "no" || parsed.investment_related === "no") {
        // Single article — none passed (but check if there's a News field)
        if (parsed.News) {
          // Extract URLs from the News field
          const urls = (parsed.News as string).match(/https?:\/\/[^\s"<>]+/g) || [];
          urls.forEach((u: string) => passedUrls.add(u));
        }
      } else if (Array.isArray(parsed)) {
        // Array of results
        for (const item of parsed) {
          if (
            item.Investment_related === "yes" ||
            item.investment_related === "yes"
          ) {
            if (item.link) passedUrls.add(item.link);
            if (item.News || item.news || item.title) {
              passedTitles.add(String(item.News || item.news || item.title).trim());
            }
          }
        }
      } else {
        // Object with nested results — check for arrays or News field
        for (const key of Object.keys(parsed)) {
          const val = parsed[key];
          if (Array.isArray(val)) {
            for (const item of val) {
              if (typeof item === "object" && item !== null) {
                if (
                  item.Investment_related === "yes" ||
                  item.investment_related === "yes"
                ) {
                  if (item.link) passedUrls.add(item.link);
                  if (item.News || item.news || item.title) {
                    passedTitles.add(String(item.News || item.news || item.title).trim());
                  }
                }
              }
            }
          } else if (typeof val === "string" && key.toLowerCase().includes("news")) {
            // News field as a paragraph — extract URLs
            const urls = val.match(/https?:\/\/[^\s"<>]+/g) || [];
            urls.forEach((u: string) => passedUrls.add(u));
          }
        }
      }
    }
  } catch {
    // JSON parse failed — try to extract URLs from raw text
    const urls = rawResponse.match(/https?:\/\/[^\s"<>]+/g) || [];
    urls.forEach((u) => passedUrls.add(u));
  }

  // Match articles to the AI results
  const passed: FetchedArticle[] = [];
  const articleResults: FilterResult["articles"] = [];

  for (const article of articles) {
    const isRelevant =
      passedUrls.has(article.url) ||
      passedTitles.has(article.title.trim()) ||
      // Fuzzy match: check if any passed title is contained in article title
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

  const result: FilterResult = {
    id: `filter-${Date.now()}`,
    sourceId,
    sourceName,
    timestamp: new Date().toISOString(),
    totalArticles: articles.length,
    passedArticles: passed.length,
    rejectedArticles: articles.length - passed.length,
    model: AI_FILTER_MODEL,
    articles: articleResults,
    rawResponse,
  };
  filterHistory.push(result);

  return { passed, filterResult: result };
}

// ---------------------------------------------------------------------------
// XML helpers – zero-dependency RSS 2.0 / Atom parser
// ---------------------------------------------------------------------------

/** Extract the text content of a single XML tag (first match). */
function extractTag(xml: string, tag: string): string {
  // Match <tag ...>content</tag> — non-greedy, dotAll via [\s\S]
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  // Strip CDATA wrappers if present
  return m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

/** Extract an attribute value from an element string. */
function extractAttr(element: string, attr: string): string {
  const re = new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, "i");
  const m = element.match(re);
  return m ? m[1] : "";
}

/** Split XML into repeated element blocks. */
function extractElements(xml: string, tag: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[0]);
  }
  return results;
}

/** Try to find an image URL from enclosure, media:content, media:thumbnail, or <image> in an item. */
function extractImage(itemXml: string): string | undefined {
  // <enclosure url="..." type="image/...">
  const enclosureRe = /<enclosure[^>]*type\s*=\s*["']image\/[^"']*["'][^>]*>/i;
  const encMatch = itemXml.match(enclosureRe);
  if (encMatch) {
    const url = extractAttr(encMatch[0], "url");
    if (url) return url;
  }
  // Also match enclosure without explicit image type but with url
  const enclosureRe2 = /<enclosure[^>]*url\s*=\s*["']([^"']*)["'][^>]*/i;
  const encMatch2 = itemXml.match(enclosureRe2);
  if (encMatch2 && encMatch2[1]) return encMatch2[1];

  // <media:content url="...">
  const mediaRe = /<media:content[^>]*url\s*=\s*["']([^"']*)["']/i;
  const mediaMatch = itemXml.match(mediaRe);
  if (mediaMatch) return mediaMatch[1];

  // <media:thumbnail url="...">
  const thumbRe = /<media:thumbnail[^>]*url\s*=\s*["']([^"']*)["']/i;
  const thumbMatch = itemXml.match(thumbRe);
  if (thumbMatch) return thumbMatch[1];

  return undefined;
}

/** Parse categories from an item – may have multiple <category> tags. */
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

/** Strip HTML tags (very simple). */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

// ---------------------------------------------------------------------------
// RSS Fetch
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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml, application/atom+xml, */*",
      },
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!response.ok) {
      return { articles: [], error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const xml = await response.text();

    // Determine feed format: Atom vs RSS
    const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);

    const items = isAtom
      ? extractElements(xml, "entry")
      : extractElements(xml, "item");

    const now = new Date().toISOString();
    const articles: FetchedArticle[] = [];

    for (const item of items.slice(0, maxItems)) {
      // Title
      const title = stripHtml(extractTag(item, "title")) || "Untitled";

      // Link – Atom uses <link href="..."/>, RSS uses <link>text</link>
      let link = "";
      if (isAtom) {
        const linkTagRe = /<link[^>]*href\s*=\s*["']([^"']*)["'][^>]*\/?>/i;
        const linkMatch = item.match(linkTagRe);
        link = linkMatch ? linkMatch[1] : "";
      } else {
        link = extractTag(item, "link");
      }

      // Description / summary / content
      const description =
        stripHtml(
          extractTag(item, "description") ||
            extractTag(item, "summary") ||
            extractTag(item, "content") ||
            extractTag(item, "content:encoded")
        ).slice(0, 1000) || "";

      // Author
      const author =
        extractTag(item, "author") ||
        extractTag(item, "dc:creator") ||
        extractTag(item, "name") ||
        "";

      // Published date
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

      // Categories
      const categories = extractCategories(item);

      // Image
      const imageUrl = extractImage(item);

      articles.push({
        id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sourceId,
        title,
        description,
        url: link,
        author: stripHtml(author),
        publishedAt,
        fetchedAt: now,
        categories,
        imageUrl,
        isInvestmentRelated: false, // placeholder – AI filtering later
      });
    }

    return { articles };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown fetch error";
    return { articles: [], error: msg };
  }
}

// ---------------------------------------------------------------------------
// Fetch a single source and store articles
// ---------------------------------------------------------------------------

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

// Normalize tweet timestamps. Apify's twitter-scraper-lite returns either
// ISO 8601 ("2024-04-24T12:34:56.000Z") or Twitter's legacy format
// ("Wed Apr 24 12:34:56 +0000 2024"). Returns ISO string or null.
function parseTweetDate(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== "string") return null;

  const native = new Date(raw);
  if (!isNaN(native.getTime())) return native.toISOString();

  const legacy = raw.match(
    /^\w{3}\s+(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})\s+(\d{4})$/
  );
  if (!legacy) return null;
  const [, monthStr, day, hh, mm, ss, tz, year] = legacy;
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const month = months[monthStr];
  if (month === undefined) return null;
  const tzHours = parseInt(tz.slice(0, 3), 10);
  const tzMins = parseInt(tz[0] + tz.slice(3), 10);
  const utcMs = Date.UTC(
    parseInt(year, 10),
    month,
    parseInt(day, 10),
    parseInt(hh, 10) - tzHours,
    parseInt(mm, 10) - tzMins,
    parseInt(ss, 10)
  );
  return isNaN(utcMs) ? null : new Date(utcMs).toISOString();
}

export async function fetchApifyTwitter(
  profileUrl: string,
  sourceId: string,
  sourceName: string,
  maxItems: number = 5
): Promise<RSSFetchResult> {
  const token = getApifyToken();
  if (!token) {
    return { articles: [], error: "مفتاح Apify API غير مُعد. أضف APIFY_API_TOKEN في إعدادات البيئة." };
  }

  try {
    const response = await fetch(
      `https://api.apify.com/v2/acts/apidojo~twitter-scraper-lite/run-sync-get-dataset-items?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxItems,
          sort: "Latest",
          startUrls: [profileUrl],
        }),
        signal: AbortSignal.timeout(120000), // 2 min — Apify sync runs can be slow
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return { articles: [], error: `Apify error (${response.status}): ${errText.slice(0, 200)}` };
    }

    const tweets: ApifyTweet[] = await response.json();
    const now = new Date().toISOString();
    const articles: FetchedArticle[] = [];
    let droppedDates = 0;

    for (const tweet of tweets) {
      const publishedAt = parseTweetDate(tweet.createdAt);
      if (!publishedAt) {
        droppedDates++;
        continue;
      }
      const text = tweet.fullText || tweet.text || "";
      const authorName = tweet.author?.name || tweet.author?.userName || sourceName;
      articles.push({
        id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sourceId,
        sourceName,
        title: `${authorName}: ${text.slice(0, 80)}${text.length > 80 ? "..." : ""}`,
        description: text,
        url: tweet.twitterUrl || tweet.url || profileUrl,
        author: authorName,
        publishedAt,
        fetchedAt: now,
        categories: ["twitter"],
        isInvestmentRelated: false,
        savedToAirtable: false,
      });
    }

    if (droppedDates > 0) {
      logger.warn(
        `Dropped ${droppedDates} tweet(s) with unparseable createdAt from ${sourceName}`,
        "DataSources"
      );
    }

    return { articles };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown Apify error";
    return { articles: [], error: msg };
  }
}

// ---------------------------------------------------------------------------
// Save article to Airtable "Apify - Websites" table
// ---------------------------------------------------------------------------

export async function saveArticleToAirtable(
  article: FetchedArticle,
  sourceName: string
): Promise<boolean> {
  try {
    await createRecord(ZTO_BASE_ID, APIFY_TABLE_NAME, {
      Source: sourceName,
      "Original Post": article.description || article.title,
      Status: "New",
      "Link to Post (If Applicable)": article.url,
    });
    // Mark as saved
    const idx = fetchedArticles.findIndex((a) => a.id === article.id);
    if (idx !== -1) fetchedArticles[idx].savedToAirtable = true;
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
// Airtable-backed cursor + dedup state
// ---------------------------------------------------------------------------

export interface FetchContext {
  // Most recent createdTime in Airtable per source name (ISO string)
  cursorByName: Record<string, string>;
  // URLs already in Airtable from the lookback window
  seenUrls: Set<string>;
}

function escapeFormulaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Read the destination Airtable table to derive the per-source last-checked
// timestamp and a set of URLs we've already saved. This replaces the cold-start
// in-memory dedup so duplicate rows aren't written every time the cron runs on
// a fresh Lambda.
export async function loadAirtableState(
  sourceNames: string[]
): Promise<FetchContext> {
  const cursorByName: Record<string, string> = {};
  const seenUrls = new Set<string>();
  if (sourceNames.length === 0) return { cursorByName, seenUrls };

  const sourceClause = sourceNames
    .map((n) => `{Source}="${escapeFormulaString(n)}"`)
    .join(",");
  const filterByFormula = `AND(IS_AFTER(CREATED_TIME(),DATEADD(NOW(),-${STATE_LOOKBACK_DAYS},'days')),OR(${sourceClause}))`;

  try {
    let offset: string | undefined;
    let pages = 0;
    const maxPages = 5; // up to 500 records — plenty for cursor + recent dedup
    do {
      const result = await listRecords(ZTO_BASE_ID, APIFY_TABLE_NAME, {
        pageSize: 100,
        offset,
        filterByFormula,
        fields: ["Source", "Link to Post (If Applicable)"],
      });
      for (const rec of result.records) {
        const source = String(rec.fields["Source"] || "");
        const url = String(rec.fields["Link to Post (If Applicable)"] || "");
        if (url) seenUrls.add(url);
        if (source && rec.createdTime) {
          const existing = cursorByName[source];
          if (!existing || rec.createdTime > existing) {
            cursorByName[source] = rec.createdTime;
          }
        }
      }
      offset = result.offset;
      pages++;
    } while (offset && pages < maxPages);
  } catch (err) {
    logger.warn(
      "Failed to load Airtable state for cursor/dedup; proceeding with empty state",
      "DataSources",
      err
    );
  }

  return { cursorByName, seenUrls };
}

// Compute the earliest publishedAt timestamp (ms) we'll accept for a source.
function computeFloorMs(sourceType: string, lastCheckedAt: string | undefined): number {
  const nowMs = Date.now();
  const cursorMs = lastCheckedAt ? new Date(lastCheckedAt).getTime() : 0;
  const validCursor = !isNaN(cursorMs) && cursorMs > 0 ? cursorMs : 0;

  if (sourceType === "twitter") {
    // Match Make's `addMinutes(now, -20)` floor — never accept tweets older
    // than the freshness window even if the cursor is very old.
    const minMs = nowMs - TWITTER_FRESHNESS_MIN * 60_000;
    return Math.max(validCursor, minMs);
  }
  // RSS / apify / generic: cursor when present, else 24h fallback.
  return validCursor > 0 ? validCursor : nowMs - RSS_FRESHNESS_HOURS * 3600_000;
}

// ---------------------------------------------------------------------------
// Fetch a single source and store articles
// ---------------------------------------------------------------------------

export async function fetchSource(
  sourceId: string,
  ctx?: FetchContext
): Promise<RSSFetchResult> {
  ensureInitialized();
  const source = dataSources.find((s) => s.id === sourceId);
  if (!source) return { articles: [], error: "Source not found" };

  // Lazy-load state if we weren't given one (single-source manual fetch path).
  const state = ctx || (await loadAirtableState([source.name]));

  let result: RSSFetchResult;

  if (source.type === "rss") {
    result = await fetchRSSFeed(source.url, source.id);
  } else if (source.type === "twitter") {
    result = await fetchApifyTwitter(source.url, source.id, source.name);
  } else if (source.type === "apify") {
    // Generic Apify — treat URL as direct dataset endpoint
    result = await fetchApifyGeneric(source.url, source.id, source.name);
  } else {
    return { articles: [], error: `Fetching not yet supported for type "${source.type}"` };
  }

  // Update lastFetchedAt regardless of whether items were fetched, so the UI
  // can show the source is being polled even on empty cycles.
  const idx = dataSources.findIndex((s) => s.id === sourceId);
  if (idx !== -1) {
    dataSources[idx].lastFetchedAt = new Date().toISOString();
  }

  if (result.articles.length === 0) {
    return result;
  }

  // 1. Time-window filter: drop items older than the cursor (or freshness floor).
  const lastCheckedAt = state.cursorByName[source.name];
  const floorMs = computeFloorMs(source.type, lastCheckedAt);
  const windowed = result.articles.filter((a) => {
    const dt = new Date(a.publishedAt).getTime();
    return !isNaN(dt) && dt >= floorMs;
  });

  // 2. Dedup against URLs already in Airtable. Mutating state.seenUrls means
  //    parallel sources in the same run can't double-save the same URL.
  const newArticles = windowed.filter((a) => {
    if (!a.url) return false;
    if (state.seenUrls.has(a.url)) return false;
    state.seenUrls.add(a.url);
    return true;
  });

  // 3. Cache for the dashboard "articles" view.
  newArticles.forEach((a) => (a.sourceName = source.name));
  fetchedArticles.push(...newArticles);

  if (newArticles.length === 0) {
    return { articles: [] };
  }

  // 4. Persist to Airtable. RSS goes through aggregate-then-classify;
  //    Twitter/Apify save directly.
  if (source.type === "rss") {
    try {
      const { passed } = await filterArticlesWithAI(
        newArticles,
        sourceId,
        source.name
      );
      if (passed.length > 0) {
        await saveArticlesToAirtable(passed, source.name);
      }
    } catch (err) {
      logger.warn(
        `AI filter or Airtable save failed for "${source.name}"`,
        "DataSources",
        err
      );
    }
  } else {
    try {
      await saveArticlesToAirtable(newArticles, source.name);
    } catch (err) {
      logger.warn(
        `Airtable save failed for "${source.name}"`,
        "DataSources",
        err
      );
    }
  }

  return { articles: newArticles };
}

// ---------------------------------------------------------------------------
// Generic Apify dataset fetch (for custom Apify actor URLs)
// ---------------------------------------------------------------------------

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
    if (!response.ok) {
      return { articles: [], error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    const items = Array.isArray(data) ? data : [];
    const now = new Date().toISOString();
    const articles: FetchedArticle[] = items.slice(0, 50).map((item: Record<string, unknown>) => ({
      id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
// Fetch all active sources
// ---------------------------------------------------------------------------

export async function fetchAllSources(): Promise<
  {
    sourceId: string;
    sourceName: string;
    result: RSSFetchResult;
    skipped?: boolean;
    skipReason?: string;
  }[]
> {
  ensureInitialized();
  const activeSources = dataSources.filter((s) => s.isActive);

  // Per-brand scrape interval gating. Cron fires often; we only fetch a source
  // when `now - lastFetchedAt >= brand.scrapeIntervalMinutes`.
  const brandIntervals = await getBrandIntervalMap();
  const nowMs = Date.now();
  const dueSources: DataSource[] = [];
  const skipped: {
    sourceId: string;
    sourceName: string;
    result: RSSFetchResult;
    skipped: true;
    skipReason: string;
  }[] = [];

  for (const source of activeSources) {
    const intervalMin =
      brandIntervals[source.brand] ?? DEFAULT_BRAND_INTERVAL_MINUTES;
    const lastFetchedMs = source.lastFetchedAt
      ? new Date(source.lastFetchedAt).getTime()
      : 0;
    const dueAt = lastFetchedMs + intervalMin * 60_000;
    if (lastFetchedMs > 0 && nowMs < dueAt) {
      const minutesLeft = Math.ceil((dueAt - nowMs) / 60_000);
      skipped.push({
        sourceId: source.id,
        sourceName: source.name,
        result: { articles: [] },
        skipped: true,
        skipReason: `Not due for ${minutesLeft} more min (interval: ${intervalMin}m)`,
      });
    } else {
      dueSources.push(source);
    }
  }

  // One Airtable read up front: builds the cursor + dedup set shared across
  // all parallel fetches. Skipping this when there are no due sources.
  const ctx =
    dueSources.length > 0
      ? await loadAirtableState(dueSources.map((s) => s.name))
      : { cursorByName: {}, seenUrls: new Set<string>() };

  const results = await Promise.allSettled(
    dueSources.map(async (source) => {
      const result = await fetchSource(source.id, ctx);
      return { sourceId: source.id, sourceName: source.name, result };
    })
  );

  const fetched = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      sourceId: dueSources[i].id,
      sourceName: dueSources[i].name,
      result: {
        articles: [],
        error: r.reason?.message || "Unknown error",
      },
    };
  });

  return [...fetched, ...skipped];
}
