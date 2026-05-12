// Destination mapping — per source type (rss / twitter / linkedin) + its own
// Airtable destination table. Dashboard admins edit these at runtime; the
// store accepts both the legacy single-mapping shape and the new per-type
// shape for backward compatibility.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { FetchedArticle, SourceType } from "@/lib/data-sources";

const SETTINGS_KEY = "destination_mapping";

// All scraper source types live in the same Airtable base; only the table can
// vary. Locking the base id avoids one more thing the admin can break.
export const DESTINATION_BASE_ID = "appIpXIFs2yxyxaUm";

// Defaults for source types where the admin hasn't picked a custom table yet.
// "Apify - Websites" is the historical destination; using it as the rss
// default preserves prior behaviour while still letting the admin override.
export const DEFAULT_TABLE_NAME = "Apify - Websites";

// Base tokens (always available for every source type). Backed by
// FetchedArticle. Per-channel engagement counters are exposed as
// `engagement.<key>` tokens (see ENGAGEMENT_TOKENS_* below) — those resolve
// against article.engagement at apply time and are validated by name.
export const ARTICLE_TOKENS = [
  "title",
  "description",
  "url",
  "author",
  "publishedAt",
  "fetchedAt",
  "sourceName",
  // brandName resolves at fetch time from scraper_brands.name (the brand
  // the source is linked to). This is what the new Airtable "Brand"
  // column wants — wire it once and every Twitter/LinkedIn/RSS source
  // tagged to that brand fills it automatically.
  "brandName",
  "categories",
  "imageUrl",
] as const;
type BaseArticleToken = (typeof ARTICLE_TOKENS)[number];
// Loose string so "engagement.likeCount" etc. also fit through the type
// system. Validation happens against the per-type whitelist at sanitize time.
export type ArticleToken = string;

// Per-source-type field metadata. The underlying FetchedArticle shape is
// shared, but each source populates a different subset and uses different
// semantics — e.g. for X "description" is the tweet text and "categories"
// is just the literal ["twitter"] tag, not a real classification.
//
// Each entry has a short Arabic description the mapping UI shows next to
// the field, plus a `populated` flag that's true when the corresponding
// fetcher reliably sets that field for that source type. Fields that are
// usually empty appear dimmed in the picker so admins don't accidentally
// map them.
export interface TokenMeta {
  token: ArticleToken;
  label: string;       // short Arabic name
  description: string; // one-line Arabic description for the mapping UI
  populated: boolean;  // does this source type usually fill this field?
}

const META_RSS: TokenMeta[] = [
  { token: "title",        label: "العنوان",       description: "عنوان المقال كما يظهر في الخلاصة",                populated: true  },
  { token: "description",  label: "الوصف",         description: "ملخّص أو فقرة من المقال (يُستخرج من الـRSS)",   populated: true  },
  { token: "url",          label: "الرابط",        description: "رابط المقال الأصلي على الموقع",                  populated: true  },
  { token: "author",       label: "الكاتب",        description: "اسم الكاتب — يعتمد على إتاحته في الخلاصة",      populated: true  },
  { token: "publishedAt",  label: "تاريخ النشر",   description: "تاريخ نشر المقال كما ورد من الموقع",             populated: true  },
  { token: "fetchedAt",    label: "وقت الجلب",     description: "وقت سحب المقال من قِبَلنا",                      populated: true  },
  { token: "sourceName",   label: "اسم المصدر",    description: "اسم المصدر كما عرّفته في صفحة المصادر",        populated: true  },
  { token: "brandName",    label: "اسم العلامة",    description: "اسم العلامة المربوطة بالمصدر — يُملأ تلقائياً (للعمود Brand)", populated: true  },
  { token: "categories",   label: "الفئات",        description: "وسوم/تصنيفات من الـRSS (مثل political/business)", populated: true  },
  { token: "imageUrl",     label: "رابط الصورة",   description: "صورة بارزة من المقال إن وُجدت في الخلاصة",       populated: true  },
];

const META_TWITTER: TokenMeta[] = [
  { token: "title",        label: "العنوان",       description: "نُولَّد آلياً: «اسم الحساب: أول 80 حرفاً من التغريدة...»", populated: true  },
  { token: "description",  label: "نص التغريدة",   description: "النص الكامل للتغريدة (بدون اقتطاع)",             populated: true  },
  { token: "url",          label: "رابط التغريدة", description: "رابط التغريدة على X",                            populated: true  },
  { token: "author",       label: "اسم الحساب",    description: "اسم العرض أو @المُعرّف للحساب صاحب التغريدة",  populated: true  },
  { token: "publishedAt",  label: "تاريخ التغريدة", description: "وقت نشر التغريدة",                              populated: true  },
  { token: "fetchedAt",    label: "وقت الجلب",     description: "وقت سحب التغريدة من قِبَلنا",                    populated: true  },
  { token: "sourceName",   label: "اسم الحساب",    description: "اسم المصدر كما عرّفته (الحساب)",                populated: true  },
  { token: "brandName",    label: "اسم العلامة",    description: "اسم العلامة المربوطة بالمصدر — يُملأ تلقائياً (للعمود Brand)", populated: true  },
  { token: "categories",   label: "الفئات",        description: "ثابت = [\"twitter\"] — يدلّ على المنصّة فقط",   populated: false },
  { token: "imageUrl",     label: "صورة التغريدة", description: "أول صورة في التغريدة أو صورة الحساب",          populated: true  },
  // X-specific engagement metadata captured into article.engagement.
  { token: "engagement.tweetId",       label: "معرّف التغريدة",     description: "ID فريد للتغريدة (يصلح مفتاحاً ثانوياً)",          populated: true  },
  { token: "engagement.authorHandle",  label: "@الحساب",            description: "@username لصاحب التغريدة",                          populated: true  },
  { token: "engagement.authorAvatar",  label: "صورة الحساب",        description: "رابط صورة الملف الشخصي",                          populated: true  },
  { token: "engagement.likeCount",     label: "عدد الإعجابات",     description: "likeCount من Apify",                              populated: true  },
  { token: "engagement.retweetCount",  label: "إعادات النشر",       description: "retweetCount",                                     populated: true  },
  { token: "engagement.replyCount",    label: "عدد الردود",         description: "replyCount",                                       populated: true  },
  { token: "engagement.quoteCount",    label: "اقتباسات",           description: "quoteCount",                                       populated: true  },
  { token: "engagement.bookmarkCount", label: "حفظات",              description: "bookmarkCount",                                    populated: true  },
  { token: "engagement.viewCount",     label: "مشاهدات",            description: "viewCount (قد تكون 0 إن لم تُرجَع)",              populated: false },
  { token: "engagement.isRetweet",     label: "هل هي إعادة نشر؟",   description: "true / false — مفيد لعزل المحتوى الأصلي",        populated: true  },
  { token: "engagement.isQuote",       label: "هل هي اقتباس؟",      description: "true / false",                                     populated: true  },
];

const META_LINKEDIN: TokenMeta[] = [
  { token: "title",        label: "العنوان",       description: "نُولَّد آلياً: «الكاتب: أول 80 حرفاً من المنشور...»", populated: true  },
  { token: "description",  label: "نص المنشور",    description: "النص الكامل للمنشور (يُقتَطَع عند 8000 حرف)",     populated: true  },
  { token: "url",          label: "رابط المنشور",  description: "رابط المنشور على LinkedIn",                       populated: true  },
  { token: "author",       label: "اسم الكاتب",    description: "اسم الكاتب الكامل (firstName + lastName)",        populated: true  },
  { token: "publishedAt",  label: "تاريخ المنشور", description: "وقت نشر المنشور كما ورد من LinkedIn",            populated: true  },
  { token: "fetchedAt",    label: "وقت الجلب",     description: "وقت سحب المنشور من قِبَلنا",                     populated: true  },
  { token: "sourceName",   label: "اسم الحساب",    description: "اسم المصدر كما عرّفته (الصفحة/الحساب)",         populated: true  },
  { token: "brandName",    label: "اسم العلامة",    description: "اسم العلامة المربوطة بالمصدر — يُملأ تلقائياً (للعمود Brand)", populated: true  },
  { token: "categories",   label: "الفئات",        description: "[\"linkedin\", النوع] — مثلاً [\"linkedin\", \"image\"]", populated: true  },
  { token: "imageUrl",     label: "رابط الصورة",   description: "أول صورة من المنشور أو غلاف الفيديو",            populated: true  },
  // LinkedIn-specific engagement / author metadata.
  { token: "engagement.postUrn",                 label: "URN المنشور",          description: "urn:li:activity:... (مفتاح ثانوي ثابت)",  populated: true  },
  { token: "engagement.postType",                label: "نوع المنشور",          description: "image / linkedinVideo / article / ...",  populated: true  },
  { token: "engagement.authorType",              label: "نوع الحساب",           description: "Person / Company",                       populated: true  },
  { token: "engagement.authorProfileId",         label: "معرّف الحساب",         description: "السلاج المختصر للحساب",                  populated: true  },
  { token: "engagement.authorProfileUrl",        label: "رابط الحساب",          description: "رابط الصفحة الكاملة",                    populated: true  },
  { token: "engagement.authorAvatar",            label: "صورة الحساب",          description: "صورة العرض/الشعار",                      populated: true  },
  { token: "engagement.authorFollowersCount",    label: "متابعو الحساب",        description: "كنص (قد يحتوي فاصلة آلاف)",            populated: true  },
  { token: "engagement.numLikes",                label: "إعجابات",              description: "numLikes",                                populated: true  },
  { token: "engagement.numComments",             label: "تعليقات",              description: "numComments",                             populated: true  },
  { token: "engagement.numShares",               label: "مشاركات",              description: "numShares",                               populated: true  },
  { token: "engagement.numImpressions",          label: "ظهور",                 description: "numImpressions (قد تكون null)",           populated: false },
];

export const ARTICLE_TOKEN_META_BY_TYPE: Record<SourceType, TokenMeta[]> = {
  rss: META_RSS,
  twitter: META_TWITTER,
  linkedin: META_LINKEDIN,
  apify: META_RSS,
  custom: META_RSS,
};

export type MappingEntry =
  | {
      type: "field";
      field: ArticleToken;
      fallback?: ArticleToken;
    }
  | {
      type: "literal";
      value: string;
    };

export interface TypeMapping {
  tableName: string;
  columns: Record<string, MappingEntry>;
  // Per-brand overrides. When a fetched article carries a brandId
  // matching one of these keys, that mapping wins over the type
  // default. The override is a complete TypeMapping (its own table
  // + columns) so each brand can route to a different destination
  // table if needed. The override map is intentionally flat — no
  // recursive byBrand chains — so the apply path stays trivial.
  byBrand?: Record<string, Omit<TypeMapping, "byBrand">>;
}

export type PerTypeMapping = Partial<Record<SourceType, TypeMapping>>;

// Source types we let admins map. apify/custom inherit the rss mapping for
// safety since they share the same flow.
export const MAPPABLE_SOURCE_TYPES: SourceType[] = ["rss", "twitter", "linkedin"];

// Default RSS mapping mirrors the historical hard-coded shape so existing
// installs preserve behaviour the moment per-type mapping ships.
const DEFAULT_RSS: TypeMapping = {
  tableName: DEFAULT_TABLE_NAME,
  columns: {
    Source: { type: "field", field: "sourceName" },
    Brand: { type: "field", field: "brandName" },
    "Original Post": {
      type: "field",
      field: "description",
      fallback: "title",
    },
    Status: { type: "literal", value: "New" },
    "Link to Post (If Applicable)": { type: "field", field: "url" },
  },
};

// Twitter / LinkedIn defaults mirror the same shape — admins typically want
// the same destination semantics regardless of source channel and can edit
// table/columns once the social channel is wired.
const DEFAULT_TWITTER: TypeMapping = {
  tableName: DEFAULT_TABLE_NAME,
  columns: {
    Source: { type: "field", field: "sourceName" },
    Brand: { type: "field", field: "brandName" },
    "Original Post": { type: "field", field: "description", fallback: "title" },
    Status: { type: "literal", value: "New" },
    "Link to Post (If Applicable)": { type: "field", field: "url" },
  },
};

const DEFAULT_LINKEDIN: TypeMapping = {
  tableName: DEFAULT_TABLE_NAME,
  columns: {
    Source: { type: "field", field: "sourceName" },
    Brand: { type: "field", field: "brandName" },
    "Original Post": { type: "field", field: "description", fallback: "title" },
    Status: { type: "literal", value: "New" },
    "Link to Post (If Applicable)": { type: "field", field: "url" },
  },
};

export const DEFAULT_PER_TYPE_MAPPING: PerTypeMapping = {
  rss: DEFAULT_RSS,
  twitter: DEFAULT_TWITTER,
  linkedin: DEFAULT_LINKEDIN,
};

// Master list of every token name we accept across types. Used by the
// sanitiser to validate `field` / `fallback` references on save.
const ALL_KNOWN_TOKENS = new Set<string>([
  ...ARTICLE_TOKENS,
  ...META_TWITTER.map((m) => m.token),
  ...META_LINKEDIN.map((m) => m.token),
]);

function readToken(article: FetchedArticle, token: ArticleToken): string {
  // Engagement-bag accessor: "engagement.<key>" → article.engagement[key].
  if (token.startsWith("engagement.")) {
    const key = token.slice("engagement.".length);
    const v = article.engagement?.[key];
    if (v == null) return "";
    return String(v);
  }
  switch (token as BaseArticleToken) {
    case "title":
      return article.title ?? "";
    case "description":
      return article.description ?? "";
    case "url":
      return article.url ?? "";
    case "author":
      return article.author ?? "";
    case "publishedAt":
      return article.publishedAt ?? "";
    case "fetchedAt":
      return article.fetchedAt ?? "";
    case "sourceName":
      return article.sourceName ?? "";
    case "brandName":
      return article.brandName ?? "";
    case "categories":
      return Array.isArray(article.categories) ? article.categories.join(", ") : "";
    case "imageUrl":
      return article.imageUrl ?? "";
    default:
      return "";
  }
}

// UUID shape check for brand-override keys. Trustworthy because the
// only producer of these keys is the access-control UI which already
// validates with the same regex.
const BRAND_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sanitise a single TypeMapping. Drops malformed columns silently — better
// to skip a bad row than refuse the entire save. Also preserves per-brand
// overrides if any are present and well-formed.
function sanitizeTypeMapping(raw: unknown): TypeMapping {
  const obj = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;
  const tableName =
    typeof obj.tableName === "string" && obj.tableName.trim().length > 0
      ? obj.tableName.trim().slice(0, 200)
      : DEFAULT_TABLE_NAME;
  const cols = obj.columns;
  const out: TypeMapping["columns"] = {};
  if (cols && typeof cols === "object") {
    for (const [colName, rawEntry] of Object.entries(cols)) {
      if (typeof colName !== "string" || !colName.trim()) continue;
      if (colName.length > 200) continue;
      if (!rawEntry || typeof rawEntry !== "object") continue;
      const entry = rawEntry as Record<string, unknown>;
      if (entry.type === "literal") {
        const v = typeof entry.value === "string" ? entry.value : "";
        out[colName.trim()] = { type: "literal", value: v.slice(0, 4000) };
      } else if (entry.type === "field") {
        const f = entry.field;
        if (typeof f !== "string" || !ALL_KNOWN_TOKENS.has(f)) continue;
        const fb = entry.fallback;
        const fbSafe =
          typeof fb === "string" && ALL_KNOWN_TOKENS.has(fb)
            ? (fb as ArticleToken)
            : undefined;
        out[colName.trim()] = { type: "field", field: f as ArticleToken, fallback: fbSafe };
      }
    }
  }
  const result: TypeMapping = { tableName, columns: out };
  // Per-brand overrides — each value is itself a sanitised TypeMapping.
  // Cap at 64 brands per type to keep the JSON blob bounded.
  const rawBrands = obj.byBrand;
  if (rawBrands && typeof rawBrands === "object" && !Array.isArray(rawBrands)) {
    const byBrand: NonNullable<TypeMapping["byBrand"]> = {};
    let kept = 0;
    for (const [brandId, brandRaw] of Object.entries(rawBrands as Record<string, unknown>)) {
      if (!BRAND_KEY_RE.test(brandId)) continue;
      if (kept >= 64) break;
      // Strip nested byBrand chains via Omit; recursion is intentionally
      // forbidden so the apply path can stay one level deep.
      const inner = sanitizeTypeMapping(brandRaw);
      byBrand[brandId] = {
        tableName: inner.tableName,
        columns: inner.columns,
      };
      kept += 1;
    }
    if (Object.keys(byBrand).length > 0) result.byBrand = byBrand;
  }
  return result;
}

// Accepts both legacy { columns: {...} } and new per-type
// { rss: {...}, twitter: {...}, linkedin: {...} } shapes.
export function sanitizePerTypeMapping(raw: unknown): PerTypeMapping {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  // Legacy shape detection: a top-level `columns` key.
  if ("columns" in obj && !("rss" in obj) && !("twitter" in obj) && !("linkedin" in obj)) {
    return { rss: sanitizeTypeMapping(raw) };
  }
  const out: PerTypeMapping = {};
  for (const t of MAPPABLE_SOURCE_TYPES) {
    if (obj[t]) out[t] = sanitizeTypeMapping(obj[t]);
  }
  return out;
}

// Resolve the effective mapping for a given (sourceType, brandId).
// Looks up a brand-specific override first; falls back to the type
// default; falls back to the built-in shipped default.
export function getMappingForTypeAndBrand(
  perType: PerTypeMapping,
  type: SourceType,
  brandId: string | null | undefined
): TypeMapping {
  const effectiveType: SourceType = MAPPABLE_SOURCE_TYPES.includes(type) ? type : "rss";
  const typeMapping = perType[effectiveType];
  if (typeMapping && brandId && typeMapping.byBrand?.[brandId]) {
    const override = typeMapping.byBrand[brandId];
    return { tableName: override.tableName, columns: override.columns };
  }
  if (typeMapping) {
    return { tableName: typeMapping.tableName, columns: typeMapping.columns };
  }
  return DEFAULT_PER_TYPE_MAPPING[effectiveType] ?? DEFAULT_RSS;
}

export function getMappingForType(
  perType: PerTypeMapping,
  type: SourceType
): TypeMapping {
  // apify/custom inherit rss
  const effectiveType: SourceType = MAPPABLE_SOURCE_TYPES.includes(type) ? type : "rss";
  const explicit = perType[effectiveType];
  if (explicit) return explicit;
  return DEFAULT_PER_TYPE_MAPPING[effectiveType] ?? DEFAULT_RSS;
}

// Render a mapping into a flat { airtableColumn: value } object. Optionally
// pass a list of known target columns; columns not in the list are dropped
// from the output and returned in `unknownColumns` so the caller can log.
export function applyMapping(
  mapping: TypeMapping,
  article: FetchedArticle,
  knownColumns?: Set<string>
): { fields: Record<string, string>; unknownColumns: string[] } {
  const fields: Record<string, string> = {};
  const unknownColumns: string[] = [];
  for (const [colName, entry] of Object.entries(mapping.columns)) {
    if (knownColumns && !knownColumns.has(colName)) {
      unknownColumns.push(colName);
      continue;
    }
    if (entry.type === "literal") {
      fields[colName] = entry.value;
      continue;
    }
    let v = readToken(article, entry.field);
    if (!v && entry.fallback) v = readToken(article, entry.fallback);
    fields[colName] = v;
  }
  return { fields, unknownColumns };
}

export async function getPerTypeMapping(): Promise<PerTypeMapping> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new Error(`getPerTypeMapping: ${error.message}`);
  const stored = sanitizePerTypeMapping(data?.value ?? {});
  // Fill defaults so the UI always has something to render for each type.
  return {
    rss: stored.rss ?? DEFAULT_RSS,
    twitter: stored.twitter ?? DEFAULT_TWITTER,
    linkedin: stored.linkedin ?? DEFAULT_LINKEDIN,
  };
}

export async function setPerTypeMapping(
  raw: unknown,
  updatedBy?: string | null
): Promise<PerTypeMapping> {
  const clean = sanitizePerTypeMapping(raw);
  const sb = getSupabaseAdmin();
  const updated_by =
    typeof updatedBy === "string" && /^[0-9a-f-]{36}$/i.test(updatedBy)
      ? updatedBy
      : null;
  type SettingsInsert = Database["public"]["Tables"]["scraper_settings"]["Insert"];
  const insert: SettingsInsert = {
    key: SETTINGS_KEY,
    value: clean as unknown as SettingsInsert["value"],
    updated_at: new Date().toISOString(),
    updated_by,
  };
  const { error } = await sb
    .from("scraper_settings")
    .upsert(insert, { onConflict: "key" });
  if (error) throw new Error(`setPerTypeMapping: ${error.message}`);
  return clean;
}
