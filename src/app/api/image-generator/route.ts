// Image generation route — wraps OpenRouter's chat-completions endpoint with
// `modalities: ["image", "text"]` against google/gemini-3-pro-image-preview.
// The browser sends data URLs for logo/reference; we forward them as
// image_url parts inside a single user turn. Edits go through `history` so
// the model sees the most recent generated image and the user's feedback.

import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { getLogo, getTemplate } from "@/lib/image-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_MODEL = "google/gemini-3-pro-image-preview";
// Hard ceilings to keep one bad request from torching memory.
const MAX_DATA_URL_BYTES = 8 * 1024 * 1024; // ~8MB per image
const MAX_TOTAL_INPUT_BYTES = 32 * 1024 * 1024; // total budget across attachments
const MAX_POST_TEXT = 8000;
const MAX_EDIT_TEXT = 4000;
const MAX_LOGO_NOTE = 1000;
const MAX_EXTRA_IMAGES = 2;
const MAX_EXTRA_NOTE = 800;
const MAX_HISTORY_TURNS = 8;
const REQUEST_TIMEOUT_MS = 120_000;

const DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,/i;

interface HistoryTurn {
  role: "user" | "assistant";
  text?: string;
  imageUrl?: string;
}

interface ExtraImage {
  dataUrl: string;
  note: string;
}

interface RequestBody {
  postText?: unknown;
  edits?: unknown;
  logoDataUrl?: unknown;
  // Optional per-generation note tied to the logo (e.g. "ضع الشعار صغيراً
  // في الزاوية اليمنى العليا"). Stacked on top of the saved logo's
  // permanent instructions.
  logoNote?: unknown;
  referenceDataUrl?: unknown;
  // Up to 2 accompanying images each with their own intent note. Sent to
  // the image model so admins can drop in a product photo / portrait /
  // additional asset and describe how it should be incorporated.
  extras?: unknown;
  // New: pick a saved logo / template instead of (or in addition to)
  // uploading. The endpoint resolves them to data URLs + instructions
  // server-side so the client doesn't need to fetch first.
  logoId?: unknown;
  templateId?: unknown;
  // Optional: the scraped-news article id this generation was kicked off
  // from. Stored in logs for attribution; we never re-fetch the article
  // server-side (the client already pasted its title+description into
  // postText and optionally added its image to extras).
  sourceArticleId?: unknown;
  aspectRatio?: unknown;
  imageSize?: unknown;
  history?: unknown;
}

const ALLOWED_ASPECT = new Set([
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
]);
const ALLOWED_SIZES = new Set(["1K", "2K", "4K"]);

function validateDataUrl(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new Error(`${label} غير صالح`);
  }
  if (!DATA_URL_RE.test(value)) {
    throw new Error(`${label} يجب أن يكون صورة بتنسيق data URL (png/jpg/webp/gif)`);
  }
  // base64 expands ~33% in transit, so length is a coarse but safe size proxy.
  if (value.length > MAX_DATA_URL_BYTES) {
    throw new Error(`${label} كبير جداً (الحد الأقصى ~6MB)`);
  }
  return value;
}

function validateExtras(value: unknown): ExtraImage[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error("الصور المرافقة غير صالحة");
  }
  if (value.length > MAX_EXTRA_IMAGES) {
    throw new Error(`الحد الأقصى ${MAX_EXTRA_IMAGES} صور مرافقة`);
  }
  const out: ExtraImage[] = [];
  for (let i = 0; i < value.length; i++) {
    const v = value[i];
    if (!v || typeof v !== "object") {
      throw new Error(`الصورة المرافقة ${i + 1} غير صالحة`);
    }
    const obj = v as Record<string, unknown>;
    const dataUrl = validateDataUrl(obj.dataUrl, `الصورة المرافقة ${i + 1}`);
    if (!dataUrl) continue; // empty entry — silently drop
    let note = "";
    if (typeof obj.note === "string") {
      note = obj.note.trim().slice(0, MAX_EXTRA_NOTE);
    }
    out.push({ dataUrl, note });
  }
  return out;
}

function validateHistory(value: unknown): HistoryTurn[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("history غير صالح");
  if (value.length > MAX_HISTORY_TURNS) {
    return value.slice(-MAX_HISTORY_TURNS) as HistoryTurn[];
  }
  const out: HistoryTurn[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    if (t.role !== "user" && t.role !== "assistant") continue;
    const text = typeof t.text === "string" ? t.text.slice(0, 4000) : undefined;
    const imageUrl =
      typeof t.imageUrl === "string" && DATA_URL_RE.test(t.imageUrl)
        ? t.imageUrl
        : undefined;
    if (!text && !imageUrl) continue;
    out.push({ role: t.role, text, imageUrl });
  }
  return out;
}

interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

function buildInitialUser(args: {
  postText: string;
  edits: string;
  logoDataUrl?: string;
  referenceDataUrl?: string;
  logoInstructions?: string;
  logoNote?: string;
  templateInstructions?: string;
  templateName?: string;
  extras: ExtraImage[];
}): ContentPart[] {
  const hasLogo = !!args.logoDataUrl;
  const intro = [
    hasLogo
      ? "Generate a polished social-media post graphic that prominently features the supplied brand logo (kept legible and unaltered)."
      : "Generate a polished social-media post graphic that visually expresses the post copy below.",
    "The image should be readable, professional, on-brand.",
    "If a reference / template image is provided, mirror its overall composition, color palette, and visual style — do NOT copy literally.",
    "Avoid extra text on the graphic unless the post copy explicitly calls for a headline.",
    "",
    "POST COPY:",
    args.postText.trim(),
  ];
  if (args.templateName?.trim()) {
    intro.push("", `DESIGN TEMPLATE: ${args.templateName.trim()}`);
  }
  if (args.templateInstructions?.trim()) {
    intro.push("TEMPLATE GUIDANCE:", args.templateInstructions.trim());
  }
  if (hasLogo) {
    if (args.logoInstructions?.trim()) {
      intro.push("", "BRAND LOGO USAGE NOTES:", args.logoInstructions.trim());
    }
    if (args.logoNote?.trim()) {
      intro.push(
        args.logoInstructions?.trim() ? "" : "",
        "LOGO PLACEMENT NOTE FOR THIS GENERATION:",
        args.logoNote.trim()
      );
    }
  }
  if (args.extras.length > 0) {
    intro.push(
      "",
      `${args.extras.length} accompanying image(s) are attached below with admin notes — they MUST be incorporated into the final composition exactly as the notes describe (placement, scale, treatment, masking). Do not omit them.`
    );
  }
  if (args.edits.trim()) {
    intro.push("", "ADDITIONAL CUSTOMIZATIONS:", args.edits.trim());
  }
  const parts: ContentPart[] = [{ type: "text", text: intro.join("\n") }];
  if (args.logoDataUrl) {
    parts.push({ type: "text", text: "Brand logo (must appear in the image):" });
    parts.push({ type: "image_url", image_url: { url: args.logoDataUrl } });
  }
  if (args.referenceDataUrl) {
    parts.push({ type: "text", text: "Style reference (match the look & feel, not the literal subject):" });
    parts.push({ type: "image_url", image_url: { url: args.referenceDataUrl } });
  }
  args.extras.forEach((ex, i) => {
    parts.push({
      type: "text",
      text: `Accompanying image ${i + 1}${
        ex.note ? ` — placement/treatment: ${ex.note}` : ""
      }:`,
    });
    parts.push({ type: "image_url", image_url: { url: ex.dataUrl } });
  });
  return parts;
}

function turnsToMessages(turns: HistoryTurn[]) {
  return turns.map((t) => {
    const parts: ContentPart[] = [];
    if (t.text) parts.push({ type: "text", text: t.text });
    if (t.imageUrl) parts.push({ type: "image_url", image_url: { url: t.imageUrl } });
    return { role: t.role, content: parts };
  });
}

interface ORImage {
  type?: string;
  image_url?: { url?: string };
}
interface ORChoice {
  message?: { content?: string | null; images?: ORImage[] };
}
interface ORResponse {
  choices?: ORChoice[];
  error?: { message?: string };
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY غير مُعد في إعدادات البيئة." },
      { status: 503 }
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }

  let postText: string;
  let edits = "";
  let logoDataUrl: string | undefined;
  let logoNote = "";
  let referenceDataUrl: string | undefined;
  let extras: ExtraImage[] = [];
  let history: HistoryTurn[] = [];
  let aspectRatio = "1:1";
  let imageSize = "2K";
  let logoInstructions: string | undefined;
  let templateInstructions: string | undefined;
  let templateName: string | undefined;
  let resolvedLogoId: string | null = null;
  let resolvedTemplateId: string | null = null;
  let sourceArticleId: string | null = null;

  try {
    if (typeof body.sourceArticleId === "string" && body.sourceArticleId) {
      // Just an attribution string — we don't dereference it, but we do
      // sanity-check that it looks like a UUID so logs aren't polluted
      // with arbitrary user input.
      if (/^[0-9a-f-]{36}$/i.test(body.sourceArticleId)) {
        sourceArticleId = body.sourceArticleId;
      }
    }
    if (typeof body.postText !== "string" || !body.postText.trim()) {
      throw new Error("نص المنشور مطلوب");
    }
    if (body.postText.length > MAX_POST_TEXT) {
      throw new Error(`نص المنشور طويل جداً (الحد ${MAX_POST_TEXT} حرف)`);
    }
    postText = body.postText.trim();

    if (typeof body.edits === "string") {
      if (body.edits.length > MAX_EDIT_TEXT) {
        throw new Error(`التعديلات طويلة جداً (الحد ${MAX_EDIT_TEXT} حرف)`);
      }
      edits = body.edits;
    }

    // Resolve saved logo first; if a literal upload is also supplied it
    // wins (admin previewing a one-off without saving).
    if (typeof body.logoId === "string" && body.logoId) {
      const saved = await getLogo(body.logoId);
      if (!saved) throw new Error("الشعار المحفوظ غير موجود");
      resolvedLogoId = saved.id;
      logoDataUrl = saved.dataUrl;
      logoInstructions = saved.instructions;
    }
    if (body.logoDataUrl !== undefined && body.logoDataUrl !== null && body.logoDataUrl !== "") {
      const uploaded = validateDataUrl(body.logoDataUrl, "الشعار");
      if (uploaded) logoDataUrl = uploaded;
    }

    if (typeof body.logoNote === "string") {
      if (body.logoNote.length > MAX_LOGO_NOTE) {
        throw new Error(`ملاحظة الشعار طويلة جداً (الحد ${MAX_LOGO_NOTE} حرف)`);
      }
      logoNote = body.logoNote.trim();
    }

    extras = validateExtras(body.extras);

    if (typeof body.templateId === "string" && body.templateId) {
      const tpl = await getTemplate(body.templateId);
      if (!tpl) throw new Error("القالب المحفوظ غير موجود");
      resolvedTemplateId = tpl.id;
      referenceDataUrl = tpl.dataUrl;
      templateInstructions = tpl.instructions;
      templateName = tpl.name;
      // Template can suggest its own aspect / size. Body still overrides.
      if (!body.aspectRatio) aspectRatio = tpl.aspectRatio;
      if (!body.imageSize) imageSize = tpl.imageSize;
    }
    if (body.referenceDataUrl !== undefined && body.referenceDataUrl !== null && body.referenceDataUrl !== "") {
      const uploaded = validateDataUrl(body.referenceDataUrl, "الصورة المرجعية");
      if (uploaded) referenceDataUrl = uploaded;
    }

    // Either a logo or a template/reference is required — both being
    // missing leaves the model with nothing to anchor the design.
    if (!logoDataUrl && !referenceDataUrl) {
      throw new Error("اختر شعاراً أو قالباً (أو كليهما) قبل التوليد");
    }

    history = validateHistory(body.history);

    if (typeof body.aspectRatio === "string" && ALLOWED_ASPECT.has(body.aspectRatio)) {
      aspectRatio = body.aspectRatio;
    }
    if (typeof body.imageSize === "string" && ALLOWED_SIZES.has(body.imageSize)) {
      imageSize = body.imageSize;
    }

    const totalInputBytes =
      (logoDataUrl?.length ?? 0) +
      (referenceDataUrl?.length ?? 0) +
      extras.reduce((acc, e) => acc + e.dataUrl.length, 0) +
      history.reduce((acc, t) => acc + (t.imageUrl?.length ?? 0), 0);
    if (totalInputBytes > MAX_TOTAL_INPUT_BYTES) {
      throw new Error("حجم المدخلات يتجاوز الحد المسموح");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "مدخلات غير صالحة";
    logger.warn(
      `[GENERATE:input] ${msg}`,
      "ImageGenerator",
      { stage: "generate:input", error: msg, sourceArticleId },
      user.id
    );
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const messages: { role: string; content: ContentPart[] }[] = [
    {
      role: "user",
      content: buildInitialUser({
        postText,
        edits,
        logoDataUrl,
        logoNote,
        referenceDataUrl,
        logoInstructions,
        templateInstructions,
        templateName,
        extras,
      }),
    },
    ...turnsToMessages(history),
  ];

  // Edits round: append a fresh user turn telling the model what to change.
  if (history.length > 0 && edits.trim()) {
    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: `Apply this revision to the previous image. Keep the brand logo identical and on-brand.\n\nREVISION:\n${edits.trim()}`,
        },
      ],
    });
  }

  const startedAt = Date.now();

  // Stage 1 — log the kick-off so we can correlate every downstream
  // event by user + article (when set). Useful when chasing "why didn't
  // my generation produce X?" reports.
  logger.info(
    `[GENERATE:start] user=${user.id} article=${sourceArticleId ?? "—"} aspect=${aspectRatio} size=${imageSize}`,
    "ImageGenerator",
    {
      stage: "generate:start",
      model: IMAGE_MODEL,
      sourceArticleId,
      logoId: resolvedLogoId,
      templateId: resolvedTemplateId,
      hasLogo: !!logoDataUrl,
      hasLogoNote: !!logoNote,
      hasReference: !!referenceDataUrl,
      extras: extras.length,
      historyTurns: history.length,
      postTextLen: postText.length,
      editsLen: edits.length,
      payloadBytes:
        (logoDataUrl?.length ?? 0) +
        (referenceDataUrl?.length ?? 0) +
        extras.reduce((acc, e) => acc + e.dataUrl.length, 0) +
        history.reduce((acc, t) => acc + (t.imageUrl?.length ?? 0), 0),
    },
    user.id
  );

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "ZTO Image Generator",
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        modalities: ["image", "text"],
        messages,
        image_config: { aspect_ratio: aspectRatio, image_size: imageSize },
        stream: false,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown network error";
    const friendly =
      err instanceof DOMException && err.name === "TimeoutError"
        ? `انتهت مهلة الاتصال بنموذج التوليد (${REQUEST_TIMEOUT_MS / 1000}s). جرّب نسبة أبعاد أصغر أو نصاً أقصر.`
        : `فشل الاتصال بنموذج التوليد: ${msg}`;
    logger.error(
      `[GENERATE:network] ${msg}`,
      "ImageGenerator",
      {
        stage: "generate:network",
        error: msg,
        model: IMAGE_MODEL,
        sourceArticleId,
        elapsedMs: Date.now() - startedAt,
      },
      user.id
    );
    return NextResponse.json({ error: friendly }, { status: 502 });
  }

  if (!response.ok) {
    const errText = await response.text();
    let detail = errText.slice(0, 400);
    try {
      const j = JSON.parse(errText) as { error?: { message?: string } };
      if (j.error?.message) detail = j.error.message.slice(0, 400);
    } catch {
      // not JSON, keep raw
    }
    // Map the most common upstream failures to clearer Arabic messages.
    let friendly = `خطأ من نموذج التوليد (${response.status}): ${detail}`;
    if (response.status === 429) {
      friendly = "تجاوزت حد الطلبات على النموذج. انتظر دقيقة وأعد المحاولة.";
    } else if (response.status === 401 || response.status === 403) {
      friendly = "صلاحية المفتاح ناقصة — تواصل مع المسؤول لتحديث OPENROUTER_API_KEY.";
    } else if (response.status >= 500) {
      friendly = "خدمة التوليد غير متاحة مؤقتاً. حاول مرّة أخرى بعد دقائق.";
    } else if (/safety|content_policy|moderation/i.test(detail)) {
      friendly = "رفض النموذج توليد هذا المحتوى لأسباب تتعلق بسياسة الأمان. عدّل النص.";
    }
    logger.error(
      `[GENERATE:http ${response.status}] ${detail.slice(0, 120)}`,
      "ImageGenerator",
      {
        stage: "generate:http",
        status: response.status,
        detail,
        model: IMAGE_MODEL,
        sourceArticleId,
        elapsedMs: Date.now() - startedAt,
      },
      user.id
    );
    return NextResponse.json(
      { error: friendly },
      { status: response.status === 429 ? 429 : 502 }
    );
  }

  let data: ORResponse;
  try {
    data = (await response.json()) as ORResponse;
  } catch {
    logger.error(
      "[GENERATE:bad-json] upstream response wasn't JSON",
      "ImageGenerator",
      { stage: "generate:bad-json", model: IMAGE_MODEL, sourceArticleId },
      user.id
    );
    return NextResponse.json(
      { error: "استجابة غير صالحة من خدمة التوليد. أعد المحاولة." },
      { status: 502 }
    );
  }

  const choice = data.choices?.[0];
  const generated = choice?.message?.images?.[0]?.image_url?.url;
  const assistantText = (choice?.message?.content ?? "").toString();

  if (!generated || !DATA_URL_RE.test(generated)) {
    logger.error(
      "[GENERATE:no-image] model returned text instead of an image",
      "ImageGenerator",
      {
        stage: "generate:no-image",
        model: IMAGE_MODEL,
        sourceArticleId,
        contentPreview: assistantText.slice(0, 200),
        upstreamError: data.error?.message,
        elapsedMs: Date.now() - startedAt,
      },
      user.id
    );
    return NextResponse.json(
      {
        error:
          data.error?.message ||
          "لم يُرجع النموذج صورة — قد يكون المحتوى محظوراً، أو الوصف يحتاج إلى مزيد من الوضوح. جرّب صياغة مختلفة.",
      },
      { status: 502 }
    );
  }

  const elapsedMs = Date.now() - startedAt;
  logger.info(
    `[GENERATE:ok] image generated in ${elapsedMs}ms`,
    "ImageGenerator",
    {
      stage: "generate:ok",
      model: IMAGE_MODEL,
      aspectRatio,
      imageSize,
      historyTurns: history.length,
      logoId: resolvedLogoId,
      templateId: resolvedTemplateId,
      sourceArticleId,
      hasLogo: !!logoDataUrl,
      hasLogoNote: !!logoNote,
      extras: extras.length,
      postTextLen: postText.length,
      editsLen: edits.length,
      assistantTextPreview: assistantText.slice(0, 120),
      elapsedMs,
    },
    user.id
  );

  return NextResponse.json({
    imageUrl: generated,
    text: assistantText,
    model: IMAGE_MODEL,
    elapsedMs,
  });
}
