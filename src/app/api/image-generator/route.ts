import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, getUserById } from "@/lib/auth";
import { logger } from "@/lib/logger";

function getUser(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  if (!token) return null;
  const session = verifySessionToken(token);
  if (!session) return null;
  return getUserById(session.userId);
}

const MODEL = "google/gemini-3-pro-image-preview";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
  images?: Array<{ type: string; image_url: { url: string } }>;
}

interface RequestBody {
  messages: Message[];
  aspect_ratio?: string;
  image_size?: string;
}

export async function POST(request: NextRequest) {
  const user = getUser(request);
  if (!user) {
    return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === "your_openrouter_api_key_here") {
    return NextResponse.json(
      { error: "مفتاح OpenRouter غير مُعَد. أضف OPENROUTER_API_KEY في إعدادات البيئة." },
      { status: 500 }
    );
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "جسم الطلب غير صالح" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "الرسائل مطلوبة" }, { status: 400 });
  }

  // Build payload — flatten any prior assistant message images into the messages
  // so the model has the conversation context for retries/edits
  const cleanedMessages = body.messages.map((m) => {
    if (m.role === "assistant" && m.images && m.images.length > 0) {
      // attach prior generated images alongside any text so the model sees them
      const parts: ContentPart[] = [];
      if (typeof m.content === "string" && m.content) {
        parts.push({ type: "text", text: m.content });
      } else if (Array.isArray(m.content)) {
        parts.push(...m.content);
      }
      for (const img of m.images) {
        parts.push({ type: "image_url", image_url: { url: img.image_url.url } });
      }
      return { role: m.role, content: parts };
    }
    return { role: m.role, content: m.content };
  });

  const payload: Record<string, unknown> = {
    model: MODEL,
    messages: cleanedMessages,
    modalities: ["image", "text"],
  };

  const imageConfig: Record<string, string> = {};
  if (body.aspect_ratio) imageConfig.aspect_ratio = body.aspect_ratio;
  if (body.image_size) imageConfig.image_size = body.image_size;
  if (Object.keys(imageConfig).length > 0) payload.image_config = imageConfig;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "ZTO Image Generator",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg =
        data?.error?.message ||
        data?.error ||
        `فشل توليد الصورة (HTTP ${res.status})`;
      logger.error(`Image generation failed: ${errMsg}`, "ImageGen", data, user.id);
      return NextResponse.json(
        { error: typeof errMsg === "string" ? errMsg : "فشل توليد الصورة" },
        { status: res.status }
      );
    }

    const choice = data?.choices?.[0];
    const message = choice?.message;
    const text: string = message?.content || "";
    const images: Array<{ type: string; image_url: { url: string } }> =
      message?.images || [];

    if (images.length === 0) {
      return NextResponse.json(
        {
          error:
            "لم يتم إرجاع أي صورة. حاول إعادة الصياغة أو وصف العناصر المطلوبة بشكل أوضح.",
          text,
        },
        { status: 502 }
      );
    }

    logger.info(`Image generated successfully`, "ImageGen", { count: images.length }, user.id);

    return NextResponse.json({
      text,
      images: images.map((img) => ({
        url: img.image_url.url,
      })),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "خطأ في الاتصال";
    logger.error(`Image generation error: ${msg}`, "ImageGen", error, user.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
