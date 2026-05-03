// AI-assisted template builder. Three actions, one route:
//   - "analyze": admin uploads ≥2 example post images → Opus 4.7 produces a
//     reusable "وصف القالب" (template description) that locks down typography,
//     palette, layout, logo placement, etc. so the same look can be reproduced.
//   - "preview": render that وصف القالب into an actual image with NanoBanana
//     (google/gemini-3-pro-image-preview) using a sample piece of post text.
//   - "revise": take the previous preview + the original examples + the
//     previous وصف + the admin's edit prompt → Opus 4.7 returns an updated
//     وصف. Caller then re-runs "preview" to see the new result.
//
// All three actions go through the same OpenRouter chat-completions endpoint.
// Comprehensive logging (level=info on success, level=error on failure)
// captures the action, model, byte sizes, elapsed ms, and a short preview of
// any model error so admins can debug from the logs page.
//
// IMPORTANT: this endpoint is admin-only — both Opus and the image model are
// expensive enough that we don't want regular users hammering it.

import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEXT_MODEL = "anthropic/claude-opus-4.7";
const IMAGE_MODEL = "google/gemini-3-pro-image-preview";

// Per-image and aggregate ceilings — Opus accepts large data URLs but we
// keep our own cap so a single bad upload can't blow up Node's heap.
const MAX_DATA_URL_BYTES = 8 * 1024 * 1024; // ~8MB per image
const MAX_TOTAL_INPUT_BYTES = 32 * 1024 * 1024;
const MIN_EXAMPLES = 2;
const MAX_EXAMPLES = 6;

const MAX_WASF_CHARS = 12_000;
const MAX_SAMPLE_TEXT = 4_000;
const MAX_EDIT_PROMPT = 2_000;
const MAX_BRAND_NOTES = 2_000;

const REQUEST_TIMEOUT_MS = 180_000;

const DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,/i;

const ALLOWED_ASPECT = new Set([
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
]);
const ALLOWED_SIZES = new Set(["1K", "2K", "4K"]);

interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: ContentPart[] | string;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

class BadInput extends Error {}

function validateDataUrl(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new BadInput(`${label} مطلوب`);
  }
  if (!DATA_URL_RE.test(value)) {
    throw new BadInput(`${label} يجب أن يكون صورة بتنسيق data URL`);
  }
  if (value.length > MAX_DATA_URL_BYTES) {
    throw new BadInput(`${label} كبير جداً (الحد ~6MB)`);
  }
  return value;
}

function validateExamples(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new BadInput(`يجب رفع ${MIN_EXAMPLES} صور على الأقل`);
  }
  if (value.length < MIN_EXAMPLES) {
    throw new BadInput(`يجب رفع ${MIN_EXAMPLES} صور على الأقل`);
  }
  if (value.length > MAX_EXAMPLES) {
    throw new BadInput(`الحد الأقصى ${MAX_EXAMPLES} صور`);
  }
  return value.map((v, i) => validateDataUrl(v, `الصورة ${i + 1}`));
}

function validateText(
  value: unknown,
  label: string,
  max: number,
  required = true
): string {
  if (value === undefined || value === null || value === "") {
    if (required) throw new BadInput(`${label} مطلوب`);
    return "";
  }
  if (typeof value !== "string") {
    throw new BadInput(`${label} غير صالح`);
  }
  const v = value.trim();
  if (required && !v) throw new BadInput(`${label} مطلوب`);
  if (v.length > max) {
    throw new BadInput(`${label} طويل جداً (الحد ${max} حرف)`);
  }
  return v;
}

function checkTotalSize(parts: (string | undefined)[]): void {
  const total = parts.reduce((acc, s) => acc + (s?.length ?? 0), 0);
  if (total > MAX_TOTAL_INPUT_BYTES) {
    throw new BadInput("حجم المدخلات يتجاوز الحد المسموح");
  }
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const ANALYZE_SYSTEM_PROMPT = `You are an expert social-media art director. The admin will give you 2-6 example post images that they want to be able to reproduce consistently. Your job is to extract a precise, reusable "وصف القالب" (template description) — written in Arabic — that captures every reproducible design decision in those examples.

The وصف القالب must be specific enough that another generative model (NanoBanana) can recreate the exact look using nothing but your description plus a piece of post copy. It should NOT describe the literal subject matter of any one example; it should describe the design system that all examples share.

Cover at least these aspects (skip any that are clearly not relevant):
- Overall aspect ratio and recommended canvas dimensions.
- Color palette: primary background colour(s), accent colour(s), text colour(s) — give hex codes when you can read them.
- Typography: heading font family / weight / size, body font family / weight / size, language direction (RTL vs LTR), text alignment.
- Layout & composition: where text sits, where the logo sits, padding/margins, hierarchy of elements.
- Logo treatment: size, position, contrast, whether on a chip / badge / freestanding.
- Imagery / illustration style if any (photo, illustration, gradient, pattern, none).
- Decorative elements: shapes, dividers, badges, icons, frames.
- Mood: minimal vs busy, formal vs playful, etc.
- Anything else recurring across the examples.

Output ONLY the وصف itself, in Arabic, organised under clear bilingual section headings. Do NOT include any preamble like "هنا هو الوصف". Do NOT wrap in code fences. Do NOT exceed ~3000 words.`;

const REVISE_SYSTEM_PROMPT = `You are the same art director. The admin previously approved a وصف القالب, used it to generate a preview image, and is now asking you to revise the وصف based on feedback. You have access to:
- The original example images (the look the admin wants).
- The latest preview image generated from the current وصف.
- The current وصف القالب.
- The admin's revision prompt (in Arabic or English).

Update the وصف to incorporate the admin's feedback while staying faithful to the original examples. Keep the same Arabic writing style, the same section structure, and the same level of specificity. Output ONLY the updated وصف — no preamble, no code fences.`;

function buildAnalyzeUser(args: {
  examples: string[];
  brandNotes: string;
}): ContentPart[] {
  const intro = [
    `Examine the ${args.examples.length} example post images attached below and extract the reusable design system that they all share.`,
    "",
    "Write your output entirely in Arabic, organised under clear bilingual section headings. Be precise and specific. Skip irrelevant sections.",
  ];
  if (args.brandNotes) {
    intro.push(
      "",
      "Brand notes from the admin (treat as authoritative when they conflict with what you see):",
      args.brandNotes
    );
  }
  const parts: ContentPart[] = [{ type: "text", text: intro.join("\n") }];
  args.examples.forEach((url, i) => {
    parts.push({ type: "text", text: `Example ${i + 1}:` });
    parts.push({ type: "image_url", image_url: { url } });
  });
  return parts;
}

function buildReviseUser(args: {
  examples: string[];
  previousWasf: string;
  previewImage: string;
  editPrompt: string;
}): ContentPart[] {
  const intro = [
    "Revise the وصف القالب below based on the admin's feedback. Output the FULL updated وصف in Arabic — not just a diff.",
    "",
    "ADMIN'S REVISION REQUEST:",
    args.editPrompt,
    "",
    "CURRENT وصف القالب:",
    args.previousWasf,
  ];
  const parts: ContentPart[] = [{ type: "text", text: intro.join("\n") }];
  parts.push({
    type: "text",
    text: "Latest preview generated from the current وصف (this is what the admin wants to improve):",
  });
  parts.push({ type: "image_url", image_url: { url: args.previewImage } });
  args.examples.forEach((url, i) => {
    parts.push({ type: "text", text: `Original example ${i + 1} (the target look):` });
    parts.push({ type: "image_url", image_url: { url } });
  });
  return parts;
}

function buildPreviewUser(args: {
  wasf: string;
  sampleText: string;
  exampleAnchor?: string;
}): ContentPart[] {
  const intro = [
    "Generate a polished social-media post graphic that strictly follows the وصف القالب below.",
    "Treat the وصف as authoritative for typography, colours, layout, logo placement, and overall mood.",
    "Use the post copy below as the actual content of the graphic. The Arabic text must render legibly with correct shaping.",
    "Do NOT add filler text that isn't in the post copy.",
    "",
    "وصف القالب (template description):",
    args.wasf,
    "",
    "POST COPY:",
    args.sampleText,
  ];
  const parts: ContentPart[] = [{ type: "text", text: intro.join("\n") }];
  if (args.exampleAnchor) {
    parts.push({
      type: "text",
      text: "Reference image — match this overall look & feel (do NOT copy literally):",
    });
    parts.push({ type: "image_url", image_url: { url: args.exampleAnchor } });
  }
  return parts;
}

// ---------------------------------------------------------------------------
// OpenRouter call helpers
// ---------------------------------------------------------------------------

interface ORTextResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
}

interface ORImageResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      images?: Array<{ image_url?: { url?: string } }>;
    };
  }>;
  error?: { message?: string };
}

interface CallResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  errorMessage?: string;
}

async function callOpenRouter<T>(args: {
  apiKey: string;
  body: Record<string, unknown>;
  context: string;
}): Promise<CallResult<T>> {
  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "ZTO Image Template Builder",
      },
      body: JSON.stringify(args.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown network error";
    return { ok: false, status: 0, errorMessage: `network: ${msg}` };
  }

  if (!res.ok) {
    const txt = await res.text();
    let detail = txt.slice(0, 500);
    try {
      const j = JSON.parse(txt) as { error?: { message?: string } };
      if (j.error?.message) detail = j.error.message.slice(0, 500);
    } catch {
      // not JSON, keep raw
    }
    return {
      ok: false,
      status: res.status,
      errorMessage: `OpenRouter ${res.status}: ${detail}`,
    };
  }

  let json: T;
  try {
    json = (await res.json()) as T;
  } catch {
    return {
      ok: false,
      status: res.status,
      errorMessage: "OpenRouter response was not JSON",
    };
  }
  return { ok: true, status: res.status, data: json };
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

interface RouteBody {
  action?: unknown;
  // analyze
  examples?: unknown;
  brandNotes?: unknown;
  // preview
  wasf?: unknown;
  sampleText?: unknown;
  aspectRatio?: unknown;
  imageSize?: unknown;
  // revise
  previousWasf?: unknown;
  previewImage?: unknown;
  editPrompt?: unknown;
}

async function handleAnalyze(
  body: RouteBody,
  apiKey: string,
  userId: string
) {
  const examples = validateExamples(body.examples);
  const brandNotes = validateText(body.brandNotes, "ملاحظات العلامة", MAX_BRAND_NOTES, false);
  checkTotalSize(examples);

  const messages: ChatMessage[] = [
    { role: "system", content: ANALYZE_SYSTEM_PROMPT },
    { role: "user", content: buildAnalyzeUser({ examples, brandNotes }) },
  ];

  const startedAt = Date.now();
  const result = await callOpenRouter<ORTextResponse>({
    apiKey,
    context: "analyze",
    body: { model: TEXT_MODEL, messages, stream: false, max_tokens: 4000 },
  });
  const elapsedMs = Date.now() - startedAt;

  if (!result.ok) {
    logger.error(
      `Template analyze failed: ${result.errorMessage}`,
      "ImageTemplateBuilder",
      {
        action: "analyze",
        model: TEXT_MODEL,
        status: result.status,
        examples: examples.length,
        elapsedMs,
      },
      userId
    );
    return NextResponse.json(
      { error: result.errorMessage || "فشل تحليل القوالب" },
      { status: result.status === 429 ? 429 : 502 }
    );
  }

  const wasf = (result.data?.choices?.[0]?.message?.content ?? "").toString().trim();
  if (!wasf) {
    logger.error(
      "Template analyze: empty response",
      "ImageTemplateBuilder",
      { action: "analyze", upstreamError: result.data?.error?.message, elapsedMs },
      userId
    );
    return NextResponse.json(
      { error: result.data?.error?.message || "لم يُرجع النموذج وصفاً" },
      { status: 502 }
    );
  }

  const trimmed = wasf.slice(0, MAX_WASF_CHARS);
  logger.info(
    `Template analyzed (${elapsedMs}ms)`,
    "ImageTemplateBuilder",
    {
      action: "analyze",
      model: TEXT_MODEL,
      examples: examples.length,
      brandNotesLen: brandNotes.length,
      wasfLen: trimmed.length,
      elapsedMs,
    },
    userId
  );
  return NextResponse.json({ wasf: trimmed, model: TEXT_MODEL, elapsedMs });
}

async function handlePreview(
  body: RouteBody,
  apiKey: string,
  userId: string
) {
  const wasf = validateText(body.wasf, "وصف القالب", MAX_WASF_CHARS);
  const sampleText = validateText(body.sampleText, "نص العيّنة", MAX_SAMPLE_TEXT);
  // examples are optional here — we pass the first one as a style anchor when
  // available so the image model has a concrete look to mirror.
  let exampleAnchor: string | undefined;
  if (Array.isArray(body.examples) && body.examples.length > 0) {
    exampleAnchor = validateDataUrl(body.examples[0], "الصورة المرجعية");
  }
  const aspectRatio =
    typeof body.aspectRatio === "string" && ALLOWED_ASPECT.has(body.aspectRatio)
      ? body.aspectRatio
      : "1:1";
  const imageSize =
    typeof body.imageSize === "string" && ALLOWED_SIZES.has(body.imageSize)
      ? body.imageSize
      : "2K";
  checkTotalSize([exampleAnchor]);

  const messages: ChatMessage[] = [
    {
      role: "user",
      content: buildPreviewUser({ wasf, sampleText, exampleAnchor }),
    },
  ];

  const startedAt = Date.now();
  const result = await callOpenRouter<ORImageResponse>({
    apiKey,
    context: "preview",
    body: {
      model: IMAGE_MODEL,
      modalities: ["image", "text"],
      messages,
      image_config: { aspect_ratio: aspectRatio, image_size: imageSize },
      stream: false,
    },
  });
  const elapsedMs = Date.now() - startedAt;

  if (!result.ok) {
    logger.error(
      `Template preview failed: ${result.errorMessage}`,
      "ImageTemplateBuilder",
      {
        action: "preview",
        model: IMAGE_MODEL,
        status: result.status,
        aspectRatio,
        imageSize,
        elapsedMs,
      },
      userId
    );
    return NextResponse.json(
      { error: result.errorMessage || "فشل توليد المعاينة" },
      { status: result.status === 429 ? 429 : 502 }
    );
  }

  const choice = result.data?.choices?.[0];
  const generated = choice?.message?.images?.[0]?.image_url?.url;
  const assistantText = (choice?.message?.content ?? "").toString();

  if (!generated || !DATA_URL_RE.test(generated)) {
    logger.error(
      "Template preview: no image returned",
      "ImageTemplateBuilder",
      {
        action: "preview",
        model: IMAGE_MODEL,
        upstreamError: result.data?.error?.message,
        contentPreview: assistantText.slice(0, 200),
        elapsedMs,
      },
      userId
    );
    return NextResponse.json(
      {
        error:
          result.data?.error?.message ||
          "لم يُرجع النموذج صورة. جرّب وصفاً أوضح.",
      },
      { status: 502 }
    );
  }

  logger.info(
    `Template preview generated (${elapsedMs}ms)`,
    "ImageTemplateBuilder",
    {
      action: "preview",
      model: IMAGE_MODEL,
      aspectRatio,
      imageSize,
      sampleTextLen: sampleText.length,
      elapsedMs,
    },
    userId
  );
  return NextResponse.json({
    imageUrl: generated,
    text: assistantText,
    aspectRatio,
    imageSize,
    model: IMAGE_MODEL,
    elapsedMs,
  });
}

async function handleRevise(
  body: RouteBody,
  apiKey: string,
  userId: string
) {
  const examples = validateExamples(body.examples);
  const previousWasf = validateText(body.previousWasf, "الوصف السابق", MAX_WASF_CHARS);
  const previewImage = validateDataUrl(body.previewImage, "صورة المعاينة");
  const editPrompt = validateText(body.editPrompt, "تعديلاتك", MAX_EDIT_PROMPT);
  checkTotalSize([...examples, previewImage]);

  const messages: ChatMessage[] = [
    { role: "system", content: REVISE_SYSTEM_PROMPT },
    {
      role: "user",
      content: buildReviseUser({
        examples,
        previousWasf,
        previewImage,
        editPrompt,
      }),
    },
  ];

  const startedAt = Date.now();
  const result = await callOpenRouter<ORTextResponse>({
    apiKey,
    context: "revise",
    body: { model: TEXT_MODEL, messages, stream: false, max_tokens: 4000 },
  });
  const elapsedMs = Date.now() - startedAt;

  if (!result.ok) {
    logger.error(
      `Template revise failed: ${result.errorMessage}`,
      "ImageTemplateBuilder",
      {
        action: "revise",
        model: TEXT_MODEL,
        status: result.status,
        examples: examples.length,
        previousWasfLen: previousWasf.length,
        editPromptLen: editPrompt.length,
        elapsedMs,
      },
      userId
    );
    return NextResponse.json(
      { error: result.errorMessage || "فشل تحديث الوصف" },
      { status: result.status === 429 ? 429 : 502 }
    );
  }

  const wasf = (result.data?.choices?.[0]?.message?.content ?? "").toString().trim();
  if (!wasf) {
    logger.error(
      "Template revise: empty response",
      "ImageTemplateBuilder",
      { action: "revise", upstreamError: result.data?.error?.message, elapsedMs },
      userId
    );
    return NextResponse.json(
      { error: result.data?.error?.message || "لم يُرجع النموذج وصفاً جديداً" },
      { status: 502 }
    );
  }

  const trimmed = wasf.slice(0, MAX_WASF_CHARS);
  logger.info(
    `Template revised (${elapsedMs}ms)`,
    "ImageTemplateBuilder",
    {
      action: "revise",
      model: TEXT_MODEL,
      examples: examples.length,
      editPromptLen: editPrompt.length,
      wasfLen: trimmed.length,
      elapsedMs,
    },
    userId
  );
  return NextResponse.json({ wasf: trimmed, model: TEXT_MODEL, elapsedMs });
}

// ---------------------------------------------------------------------------
// Route entry
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "صلاحيات المدير مطلوبة" },
      { status: 403 }
    );
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY غير مُعد في إعدادات البيئة." },
      { status: 503 }
    );
  }

  let body: RouteBody;
  try {
    body = (await request.json()) as RouteBody;
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";

  try {
    switch (action) {
      case "analyze":
        return await handleAnalyze(body, apiKey, user.id);
      case "preview":
        return await handlePreview(body, apiKey, user.id);
      case "revise":
        return await handleRevise(body, apiKey, user.id);
      default:
        return NextResponse.json({ error: "إجراء غير صالح" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof BadInput) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error(
      `Template builder unexpected error: ${msg}`,
      "ImageTemplateBuilder",
      { action },
      user.id
    );
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
