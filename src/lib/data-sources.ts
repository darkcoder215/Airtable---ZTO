// Data sources management - RSS feeds, social media, custom scrapers
// In-memory storage (same pattern as agents.ts)

export interface DataSource {
  id: string;
  name: string;
  type: "rss" | "twitter" | "linkedin" | "apify" | "custom";
  url: string;
  category: "startups" | "investment" | "tech" | "general";
  isActive: boolean;
  fetchInterval: number; // minutes
  lastFetchedAt: string | null;
  createdAt: string;
}

export interface FetchedArticle {
  id: string;
  sourceId: string;
  title: string;
  description: string;
  url: string;
  author: string;
  publishedAt: string;
  fetchedAt: string;
  categories: string[];
  imageUrl?: string;
  isInvestmentRelated: boolean; // placeholder for AI filtering later
}

// In-memory stores
let dataSources: DataSource[] = [];
let fetchedArticles: FetchedArticle[] = [];

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
      isActive: true,
      fetchInterval: 30,
      lastFetchedAt: null,
      createdAt: now,
    },
  ];
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
        "User-Agent": "ZTO-DataSources/1.0",
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

export async function fetchSource(
  sourceId: string
): Promise<RSSFetchResult> {
  ensureInitialized();
  const source = dataSources.find((s) => s.id === sourceId);
  if (!source) return { articles: [], error: "Source not found" };

  if (source.type !== "rss") {
    return { articles: [], error: `Fetching not yet supported for type "${source.type}"` };
  }

  const result = await fetchRSSFeed(source.url, source.id);

  if (result.articles.length > 0) {
    // De-duplicate by URL – keep existing articles, add new ones
    const existingUrls = new Set(
      fetchedArticles.filter((a) => a.sourceId === sourceId).map((a) => a.url)
    );
    const newArticles = result.articles.filter((a) => !existingUrls.has(a.url));
    fetchedArticles.push(...newArticles);

    // Update lastFetchedAt
    const idx = dataSources.findIndex((s) => s.id === sourceId);
    if (idx !== -1) {
      dataSources[idx].lastFetchedAt = new Date().toISOString();
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Fetch all active sources
// ---------------------------------------------------------------------------

export async function fetchAllSources(): Promise<
  { sourceId: string; sourceName: string; result: RSSFetchResult }[]
> {
  ensureInitialized();
  const activeSources = dataSources.filter((s) => s.isActive);
  const results = await Promise.allSettled(
    activeSources.map(async (source) => {
      const result = await fetchSource(source.id);
      return { sourceId: source.id, sourceName: source.name, result };
    })
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      sourceId: activeSources[i].id,
      sourceName: activeSources[i].name,
      result: {
        articles: [],
        error: r.reason?.message || "Unknown error",
      },
    };
  });
}
