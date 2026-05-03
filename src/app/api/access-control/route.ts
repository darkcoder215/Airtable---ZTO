import { NextRequest, NextResponse } from "next/server";
import { getAccessRules, addAccessRule, updateAccessRule, deleteAccessRule } from "@/lib/access-control";
import { verifySessionToken, getUserById } from "@/lib/auth";
import { logger } from "@/lib/logger";

async function getUser(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  if (!token) return null;
  const session = verifySessionToken(token);
  if (!session) return null;
  return await getUserById(session.userId);
}

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
  }

  const rules = await getAccessRules();
  return NextResponse.json({ rules });
}

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { action, ...data } = body;

    switch (action) {
      case "create": {
        const rule = await addAccessRule(data);
        logger.info(`Access rule created by ${user.name}`, "AccessControl", rule, user.id);
        return NextResponse.json({ rule });
      }

      case "update": {
        const { id, ...update } = data;
        const updated = await updateAccessRule(id, update);
        if (!updated) {
          return NextResponse.json({ error: "القاعدة غير موجودة" }, { status: 404 });
        }
        logger.info(`Access rule ${id} updated by ${user.name}`, "AccessControl", update, user.id);
        return NextResponse.json({ rule: updated });
      }

      case "delete": {
        const deleted = await deleteAccessRule(data.id);
        if (!deleted) {
          return NextResponse.json({ error: "القاعدة غير موجودة" }, { status: 404 });
        }
        logger.info(`Access rule ${data.id} deleted by ${user.name}`, "AccessControl", null, user.id);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: "إجراء غير صالح" }, { status: 400 });
    }
  } catch (error) {
    logger.error("Access control error", "AccessControl", error, user?.id);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}
