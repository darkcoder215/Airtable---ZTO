import { NextRequest, NextResponse } from "next/server";
import {
  listBrands,
  createBrand,
  updateBrand,
  deleteBrandById,
} from "@/lib/brands";
import { verifySessionToken, getUserById } from "@/lib/auth";
import { logger } from "@/lib/logger";

function getUser(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  if (!token) return null;
  const session = verifySessionToken(token);
  if (!session) return null;
  return getUserById(session.userId);
}

export async function GET(request: NextRequest) {
  const user = getUser(request);
  if (!user) {
    return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  }
  try {
    const brands = await listBrands(true);
    return NextResponse.json({ brands });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error("Failed to list brands", "Brands", err, user.id);
    return NextResponse.json({ error: msg, brands: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = getUser(request);
  if (!user) {
    return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case "create": {
        const brand = await createBrand(
          String(body.name || ""),
          Number(body.scrapeIntervalMinutes)
        );
        logger.info(
          `Brand "${brand.name}" created by ${user.name}`,
          "Brands",
          null,
          user.id
        );
        return NextResponse.json({ brand });
      }
      case "update": {
        if (!body.id) {
          return NextResponse.json(
            { error: "معرّف البراند مطلوب" },
            { status: 400 }
          );
        }
        const brand = await updateBrand(String(body.id), {
          name: body.name,
          scrapeIntervalMinutes:
            body.scrapeIntervalMinutes !== undefined
              ? Number(body.scrapeIntervalMinutes)
              : undefined,
        });
        logger.info(
          `Brand ${body.id} updated by ${user.name}`,
          "Brands",
          null,
          user.id
        );
        return NextResponse.json({ brand });
      }
      case "delete": {
        if (!body.id) {
          return NextResponse.json(
            { error: "معرّف البراند مطلوب" },
            { status: 400 }
          );
        }
        await deleteBrandById(String(body.id));
        logger.info(
          `Brand ${body.id} deleted by ${user.name}`,
          "Brands",
          null,
          user.id
        );
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json({ error: "إجراء غير صالح" }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error("Brands API error", "Brands", err, user.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
