// Destination-mapping store. Lets admins customise which article fields land
// in which Airtable columns without redeploying. Falls back to the historical
// hard-coded shape when no override has been saved.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { FetchedArticle } from "@/lib/data-sources";

const SETTINGS_KEY = "destination_mapping";

export const DESTINATION_BASE_ID = "appIpXIFs2yxyxaUm";
export const DESTINATION_TABLE_NAME = "Apify - Websites";

// Article-side tokens an admin can pull from when wiring up a column.
// Keep this list small + obvious — exotic tokens make the mapping UI brittle.
export const ARTICLE_TOKENS = [
  "title",
  "description",
  "url",
  "author",
  "publishedAt",
  "fetchedAt",
  "sourceName",
  "categories",
] as const;
export type ArticleToken = (typeof ARTICLE_TOKENS)[number];

export type MappingEntry =
  | {
      type: "field";
      // Primary article field to read.
      field: ArticleToken;
      // Fallback field when primary is empty.
      fallback?: ArticleToken;
    }
  | {
      type: "literal";
      value: string;
    };

export interface DestinationMapping {
  // Map: airtable column name → mapping entry
  columns: Record<string, MappingEntry>;
}

// Default shape mirrors the previous hard-coded behaviour so existing
// installations don't change behaviour the moment this lands.
export const DEFAULT_MAPPING: DestinationMapping = {
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
    default:
      return "";
  }
}

// Validate raw JSON coming in from the API and return a typed mapping. Any
// entry that doesn't pass validation is dropped silently — better to skip a
// malformed row than refuse to save the whole config.
export function sanitizeMapping(raw: unknown): DestinationMapping {
  if (!raw || typeof raw !== "object") return { columns: {} };
  const cols = (raw as { columns?: unknown }).columns;
  if (!cols || typeof cols !== "object") return { columns: {} };
  const out: DestinationMapping["columns"] = {};
  for (const [colName, rawEntry] of Object.entries(cols)) {
    if (typeof colName !== "string" || !colName.trim()) continue;
    if (colName.length > 200) continue;
    if (!rawEntry || typeof rawEntry !== "object") continue;
    const entry = rawEntry as Record<string, unknown>;
    if (entry.type === "literal") {
      const v = typeof entry.value === "string" ? entry.value : "";
      out[colName] = { type: "literal", value: v.slice(0, 4000) };
    } else if (entry.type === "field") {
      const f = entry.field;
      if (typeof f !== "string" || !ARTICLE_TOKENS.includes(f as ArticleToken)) continue;
      const fb = entry.fallback;
      const fbSafe =
        typeof fb === "string" && ARTICLE_TOKENS.includes(fb as ArticleToken)
          ? (fb as ArticleToken)
          : undefined;
      out[colName] = { type: "field", field: f as ArticleToken, fallback: fbSafe };
    }
  }
  return { columns: out };
}

// Render a mapping into a flat { airtableColumn: value } object for an article.
export function applyMapping(
  mapping: DestinationMapping,
  article: FetchedArticle
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [colName, entry] of Object.entries(mapping.columns)) {
    if (entry.type === "literal") {
      out[colName] = entry.value;
      continue;
    }
    let v = readToken(article, entry.field);
    if (!v && entry.fallback) v = readToken(article, entry.fallback);
    out[colName] = v;
  }
  return out;
}

export async function getDestinationMapping(): Promise<DestinationMapping> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new Error(`getDestinationMapping: ${error.message}`);
  if (!data?.value) return DEFAULT_MAPPING;
  return sanitizeMapping(data.value);
}

export async function setDestinationMapping(
  mapping: DestinationMapping,
  updatedBy?: string | null
): Promise<DestinationMapping> {
  const clean = sanitizeMapping(mapping);
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
  const { error } = await sb.from("scraper_settings").upsert(insert, { onConflict: "key" });
  if (error) throw new Error(`setDestinationMapping: ${error.message}`);
  return clean;
}
