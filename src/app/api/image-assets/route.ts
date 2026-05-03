// CRUD for the image-generator's saved logos + design templates.
// Admin-gated for writes; reads are open to authenticated users so the
// generator UI can populate its pickers.

import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import {
  AssetValidationError,
  createLogo,
  createTemplate,
  deleteLogo,
  deleteTemplate,
  listLogos,
  listTemplates,
} from "@/lib/image-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = getRequestUser(request);
  if (!user) return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  try {
    if (action === "logos") {
      const logos = await listLogos();
      return NextResponse.json({ logos });
    }
    if (action === "templates") {
      const tag = searchParams.get("tag") ?? undefined;
      const templates = await listTemplates(tag);
      return NextResponse.json({ templates });
    }
    // Default: return both in one round-trip — that's the common case for
    // the generator page.
    const [logos, templates] = await Promise.all([listLogos(), listTemplates()]);
    return NextResponse.json({ logos, templates });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error(`image-assets GET failed: ${msg}`, "ImageGenerator", err, user.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = getRequestUser(request);
  if (!user) return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  const action = typeof body.action === "string" ? body.action : "";
  try {
    switch (action) {
      case "create-logo": {
        const created = await createLogo({
          name: body.name,
          dataUrl: body.dataUrl,
          instructions: body.instructions,
          createdBy: user.id,
        });
        logger.info(
          `Logo "${created.name}" created by ${user.name}`,
          "ImageGenerator",
          { logoId: created.id },
          user.id
        );
        return NextResponse.json({ logo: created });
      }
      case "delete-logo": {
        const id = typeof body.id === "string" ? body.id : "";
        const ok = await deleteLogo(id);
        if (!ok) return NextResponse.json({ error: "الشعار غير موجود" }, { status: 404 });
        logger.info(`Logo ${id} deleted by ${user.name}`, "ImageGenerator", null, user.id);
        return NextResponse.json({ success: true });
      }
      case "create-template": {
        const created = await createTemplate({
          name: body.name,
          description: body.description,
          dataUrl: body.dataUrl,
          tags: body.tags,
          instructions: body.instructions,
          aspectRatio: body.aspectRatio,
          imageSize: body.imageSize,
          createdBy: user.id,
        });
        logger.info(
          `Template "${created.name}" created by ${user.name}`,
          "ImageGenerator",
          { templateId: created.id, tags: created.tags },
          user.id
        );
        return NextResponse.json({ template: created });
      }
      case "delete-template": {
        const id = typeof body.id === "string" ? body.id : "";
        const ok = await deleteTemplate(id);
        if (!ok) return NextResponse.json({ error: "القالب غير موجود" }, { status: 404 });
        logger.info(`Template ${id} deleted by ${user.name}`, "ImageGenerator", null, user.id);
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json({ error: "إجراء غير صالح" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof AssetValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error(`image-assets POST failed: ${msg}`, "ImageGenerator", err, user.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
