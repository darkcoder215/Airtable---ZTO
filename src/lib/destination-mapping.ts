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

// Shared token list across types. Backed by FetchedArticle, which currently
// has the same shape for every source type — keep this aligned with
// readToken() below.
export const ARTICLE_TOKENS = [
  "title",
  "description",
  "url",
  "author",
  "publishedAt",
  "fetchedAt",
  "sourceName",
  "categories",
  "imageUrl",
] as const;
export type ArticleToken = (typeof ARTICLE_TOKENS)[number];

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
    "Original Post": { type: "field", field: "description", fallback: "title" },
    Status: { type: "literal", value: "New" },
    "Link to Post (If Applicable)": { type: "field", field: "url" },
  },
};

const DEFAULT_LINKEDIN: TypeMapping = {
  tableName: DEFAULT_TABLE_NAME,
  columns: {
    Source: { type: "field", field: "sourceName" },
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

function readToken(article: FetchedArticle, token: ArticleToken): string {
  switch (token) {
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
    case "categories":
      return Array.isArray(article.categories) ? article.categories.join(", ") : "";
    case "imageUrl":
      return article.imageUrl ?? "";
    default:
      return "";
  }
}

// Sanitise a single TypeMapping. Drops malformed columns silently — better
// to skip a bad row than refuse the entire save.
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
        if (typeof f !== "string" || !ARTICLE_TOKENS.includes(f as ArticleToken)) continue;
        const fb = entry.fallback;
        const fbSafe =
          typeof fb === "string" && ARTICLE_TOKENS.includes(fb as ArticleToken)
            ? (fb as ArticleToken)
            : undefined;
        out[colName.trim()] = { type: "field", field: f as ArticleToken, fallback: fbSafe };
      }
    }
  }
  return { tableName, columns: out };
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
