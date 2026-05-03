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
const MAX_TOTAL_INPUT_BYTES = 24 * 1024 * 1024; // total budget across attachments
const MAX_POST_TEXT = 8000;
const MAX_EDIT_TEXT = 4000;
const MAX_HISTORY_TURNS = 8;
const REQUEST_TIMEOUT_MS = 120_000;

const DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,/i;

interface HistoryTurn {
  role: "user" | "assistant";
  text?: string;
  imageUrl?: string;
}

interface RequestBody {
  postText?: unknown;
  edits?: unknown;
  logoDataUrl?: unknown;
  referenceDataUrl?: unknown;
  // New: pick a saved logo / template instead of (or in addition to)
  // uploading. The endpoint resolves them to data URLs + instructions
  // server-side so the client doesn't need to fetch first.
  logoId?: unknown;
  templateId?: unknown;
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
  templateInstructions?: string;
  templateName?: string;
}): ContentPart[] {
  const intro = [
    "Generate a polished social-media post graphic that prominently features the supplied brand logo (kept legible and unaltered).",
    "The image should visually express the post copy below — readable, professional, on-brand.",
    "If a reference image is provided, mirror its overall composition, color palette, and visual style — do NOT copy literally.",
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
  if (args.logoInstructions?.trim()) {
    intro.push("", "BRAND LOGO USAGE NOTES:", args.logoInstructions.trim());
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
  let referenceDataUrl: string | undefined;
  let history: HistoryTurn[] = [];
  let aspectRatio = "1:1";
  let imageSize = "2K";
  let logoInstructions: string | undefined;
  let templateInstructions: string | undefined;
  let templateName: string | undefined;
  let resolvedLogoId: string | null = null;
  let resolvedTemplateId: string | null = null;

  try {
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
    if (!logoDataUrl) {
      throw new Error("الشعار مطلوب — اختر شعاراً محفوظاً أو ارفع واحداً جديداً");
    }

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
      history.reduce((acc, t) => acc + (t.imageUrl?.length ?? 0), 0);
    if (totalInputBytes > MAX_TOTAL_INPUT_BYTES) {
      throw new Error("حجم المدخلات يتجاوز الحد المسموح");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "مدخلات غير صالحة";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const messages: { role: string; content: ContentPart[] }[] = [
    {
      role: "user",
      content: buildInitialUser({
        postText,
        edits,
        logoDataUrl,
        referenceDataUrl,
        logoInstructions,
        templateInstructions,
        templateName,
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
    logger.error(
      `Image generator request failed (network): ${msg}`,
      "ImageGenerator",
      { error: msg, model: IMAGE_MODEL },
      user.id
    );
    return NextResponse.json(
      { error: `فشل الاتصال بـ OpenRouter: ${msg}` },
      { status: 502 }
    );
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
    logger.error(
      `Image generator HTTP ${response.status}`,
      "ImageGenerator",
      { status: response.status, detail, model: IMAGE_MODEL },
      user.id
    );
    return NextResponse.json(
      { error: `OpenRouter ${response.status}: ${detail}` },
      { status: response.status === 429 ? 429 : 502 }
    );
  }

  let data: ORResponse;
  try {
    data = (await response.json()) as ORResponse;
  } catch {
    logger.error("Image generator: response wasn't JSON", "ImageGenerator", null, user.id);
    return NextResponse.json(
      { error: "استجابة غير صالحة من OpenRouter" },
      { status: 502 }
    );
  }

  const choice = data.choices?.[0];
  const generated = choice?.message?.images?.[0]?.image_url?.url;
  const assistantText = (choice?.message?.content ?? "").toString();

  if (!generated || !DATA_URL_RE.test(generated)) {
    logger.error(
      "Image generator: no image returned",
      "ImageGenerator",
      {
        model: IMAGE_MODEL,
        contentPreview: assistantText.slice(0, 200),
        upstreamError: data.error?.message,
      },
      user.id
    );
    return NextResponse.json(
      {
        error:
          data.error?.message ||
          "لم يُرجع النموذج صورة. جرب وصفاً أوضح أو نموذجاً آخر.",
      },
      { status: 502 }
    );
  }

  const elapsedMs = Date.now() - startedAt;
  logger.info(
    `Image generated (${elapsedMs}ms)`,
    "ImageGenerator",
    {
      model: IMAGE_MODEL,
      aspectRatio,
      imageSize,
      historyTurns: history.length,
      logoId: resolvedLogoId,
      templateId: resolvedTemplateId,
      assistantTextPreview: assistantText.slice(0, 120),
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
