// CRUD for the image-generator's saved logos and tagged design templates.
// Both are stored as base64 data URLs in Supabase. Validation enforces
// MIME type, max size, max length on text fields, and tag count.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

const DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,/i;
const MAX_DATA_URL_BYTES = 6 * 1024 * 1024; // 6MB per asset
const MAX_NAME = 200;
const MAX_INSTRUCTIONS = 4000;
const MAX_DESCRIPTION = 1000;
const MAX_TAGS = 10;
const MAX_TAG = 50;

export class AssetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetValidationError";
  }
}

export interface ImageLogo {
  id: string;
  name: string;
  dataUrl: string;
  instructions: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImageTemplate {
  id: string;
  name: string;
  description: string;
  dataUrl: string;
  tags: string[];
  instructions: string;
  aspectRatio: string;
  imageSize: string;
  createdAt: string;
  updatedAt: string;
}

type LogoRow = Database["public"]["Tables"]["image_logos"]["Row"];
type TemplateRow = Database["public"]["Tables"]["image_templates"]["Row"];

function mapLogo(r: LogoRow): ImageLogo {
  return {
    id: r.id,
    name: r.name,
    dataUrl: r.data_url,
    instructions: r.instructions,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapTemplate(r: TemplateRow): ImageTemplate {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    dataUrl: r.data_url,
    tags: Array.isArray(r.tags) ? r.tags : [],
    instructions: r.instructions,
    aspectRatio: r.aspect_ratio,
    imageSize: r.image_size,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function validateDataUrl(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new AssetValidationError(`${label} مطلوب`);
  }
  if (!DATA_URL_RE.test(value)) {
    throw new AssetValidationError(
      `${label} يجب أن يكون صورة بتنسيق data URL (png/jpg/webp/gif)`
    );
  }
  if (value.length > MAX_DATA_URL_BYTES) {
    throw new AssetValidationError(`${label} كبير جداً (الحد ~6MB)`);
  }
  return value;
}

function validateText(value: unknown, label: string, max: number, required = true): string {
  if (value === undefined || value === null || value === "") {
    if (required) throw new AssetValidationError(`${label} مطلوب`);
    return "";
  }
  if (typeof value !== "string") {
    throw new AssetValidationError(`${label} غير صالح`);
  }
  const v = value.trim();
  if (required && !v) throw new AssetValidationError(`${label} مطلوب`);
  if (v.length > max) {
    throw new AssetValidationError(`${label} طويل جداً (الحد ${max} حرف)`);
  }
  return v;
}

function validateTags(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new AssetValidationError("الوسوم يجب أن تكون قائمة");
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of value) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!t) continue;
    if (t.length > MAX_TAG) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

const ALLOWED_ASPECT = new Set([
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
]);
const ALLOWED_SIZES = new Set(["1K", "2K", "4K"]);

// ---------------------------------------------------------------------------
// Logos
// ---------------------------------------------------------------------------

export async function listLogos(): Promise<ImageLogo[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("image_logos")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listLogos: ${error.message}`);
  return (data ?? []).map(mapLogo);
}

export async function createLogo(input: {
  name: unknown;
  dataUrl: unknown;
  instructions?: unknown;
  createdBy?: string | null;
}): Promise<ImageLogo> {
  const name = validateText(input.name, "اسم الشعار", MAX_NAME);
  const dataUrl = validateDataUrl(input.dataUrl, "ملف الشعار");
  const instructions = validateText(input.instructions, "تعليمات", MAX_INSTRUCTIONS, false);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("image_logos")
    .insert({
      name,
      data_url: dataUrl,
      instructions,
      created_by: input.createdBy ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`createLogo: ${error.message}`);
  return mapLogo(data);
}

export async function deleteLogo(id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const sb = getSupabaseAdmin();
  const { error, count } = await sb
    .from("image_logos")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw new Error(`deleteLogo: ${error.message}`);
  return (count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function listTemplates(tag?: string): Promise<ImageTemplate[]> {
  const sb = getSupabaseAdmin();
  let q = sb.from("image_templates").select("*").order("created_at", { ascending: false });
  if (tag && tag.trim()) {
    q = q.contains("tags", [tag.trim()]);
  }
  const { data, error } = await q;
  if (error) throw new Error(`listTemplates: ${error.message}`);
  return (data ?? []).map(mapTemplate);
}

export async function createTemplate(input: {
  name: unknown;
  description?: unknown;
  dataUrl: unknown;
  tags?: unknown;
  instructions?: unknown;
  aspectRatio?: unknown;
  imageSize?: unknown;
  createdBy?: string | null;
}): Promise<ImageTemplate> {
  const name = validateText(input.name, "اسم القالب", MAX_NAME);
  const description = validateText(input.description, "الوصف", MAX_DESCRIPTION, false);
  const dataUrl = validateDataUrl(input.dataUrl, "ملف القالب");
  const tags = validateTags(input.tags);
  const instructions = validateText(input.instructions, "تعليمات الاستخدام", MAX_INSTRUCTIONS, false);
  const aspectRatio =
    typeof input.aspectRatio === "string" && ALLOWED_ASPECT.has(input.aspectRatio)
      ? input.aspectRatio
      : "1:1";
  const imageSize =
    typeof input.imageSize === "string" && ALLOWED_SIZES.has(input.imageSize)
      ? input.imageSize
      : "2K";
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("image_templates")
    .insert({
      name,
      description,
      data_url: dataUrl,
      tags,
      instructions,
      aspect_ratio: aspectRatio,
      image_size: imageSize,
      created_by: input.createdBy ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`createTemplate: ${error.message}`);
  return mapTemplate(data);
}

export async function deleteTemplate(id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const sb = getSupabaseAdmin();
  const { error, count } = await sb
    .from("image_templates")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw new Error(`deleteTemplate: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function getLogo(id: string): Promise<ImageLogo | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("image_logos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getLogo: ${error.message}`);
  return data ? mapLogo(data) : null;
}

export async function getTemplate(id: string): Promise<ImageTemplate | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("image_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getTemplate: ${error.message}`);
  return data ? mapTemplate(data) : null;
}
