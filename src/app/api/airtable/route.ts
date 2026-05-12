import { NextRequest, NextResponse } from "next/server";
import { listBases, listTables, listRecords, createRecord, updateRecord, deleteRecord, getRecord, resolveLinkedRecordNames, listComments, createComment, deleteComment } from "@/lib/airtable";
import { verifySessionToken, getUserById } from "@/lib/auth";
import { checkPermission, getFieldRestrictions } from "@/lib/access-control";
import { listBrands } from "@/lib/scraper/db";
import { logger } from "@/lib/logger";

// Default Airtable column that carries the brand name. Records are
// written here by the destination-mapping step ("Brand" by default).
// If a future deployment renames the column, expose this via env.
const BRAND_COLUMN = "Brand";

// Build an Airtable formula that limits results to records whose
// {Brand} column matches one of the writer's allowed brand names.
// Returns null when the writer has no restriction set (NULL allowlist
// or non-content_writer role), or when the brand IDs can't be
// resolved. Empty array → returns a formula that matches nothing so
// the writer sees no records (matching the "deny all" intent).
async function buildBrandFilterFormula(
  allowedBrandIds: string[] | null,
  role: string
): Promise<string | null> {
  if (role !== "content_writer") return null;
  if (allowedBrandIds == null) return null; // no restriction
  if (allowedBrandIds.length === 0) {
    // Explicit "no brand selected" → match nothing.
    return "FALSE()";
  }
  try {
    const allBrands = await listBrands();
    const wanted = new Set(allowedBrandIds);
    const names = allBrands
      .filter((b) => wanted.has(b.id))
      .map((b) => b.name)
      .filter((n): n is string => typeof n === "string" && n.length > 0);
    if (names.length === 0) return "FALSE()";
    const escaped = names.map((n) => `"${n.replace(/"/g, "\\\"")}"`);
    const ors = escaped.map((s) => `{${BRAND_COLUMN}}=${s}`).join(",");
    return `OR(${ors})`;
  } catch (err) {
    logger.warn("Brand filter resolution failed", "API", err);
    return null;
  }
}

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

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  try {
    switch (action) {
      case "bases": {
        const bases = await listBases();
        logger.info("Listed bases", "API", { count: bases.length }, user.id);
        return NextResponse.json({ bases });
      }

      case "tables": {
        const baseId = searchParams.get("baseId");
        if (!baseId) {
          return NextResponse.json({ error: "معرف القاعدة مطلوب" }, { status: 400 });
        }
        if (!(await checkPermission(user.id, user.role, baseId, "*", "canView"))) {
          return NextResponse.json({ error: "لا تملك صلاحية الوصول" }, { status: 403 });
        }
        let tables = await listTables(baseId);
        // Content-writer accounts only see the explicit allowlist. An
        // empty array means "no tables" — we still return [] so the UI
        // can render its "ask your admin" state instead of failing.
        if (user.role === "content_writer") {
          const allow = new Set(user.allowedTableIds ?? []);
          tables = tables.filter((t) => allow.has(t.id));
        }
        return NextResponse.json({ tables });
      }

      case "records": {
        const baseId = searchParams.get("baseId");
        const tableId = searchParams.get("tableId");
        if (!baseId || !tableId) {
          return NextResponse.json({ error: "معرف القاعدة والجدول مطلوبان" }, { status: 400 });
        }
        if (!(await checkPermission(user.id, user.role, baseId, tableId, "canView"))) {
          return NextResponse.json({ error: "لا تملك صلاحية الوصول" }, { status: 403 });
        }
        // Content-writer: hard-block tables outside the allowlist even
        // if they have a stale URL.
        if (user.role === "content_writer" && !(user.allowedTableIds ?? []).includes(tableId)) {
          return NextResponse.json({ error: "هذا الجدول خارج صلاحيتك" }, { status: 403 });
        }

        const offset = searchParams.get("offset") || undefined;
        const pageSize = searchParams.get("pageSize") ? parseInt(searchParams.get("pageSize")!) : 50;
        const userFilter = searchParams.get("filter") || undefined;
        const sortField = searchParams.get("sortField");
        const sortDir = searchParams.get("sortDir") as "asc" | "desc" | null;

        const sort = sortField ? [{ field: sortField, direction: sortDir || ("asc" as const) }] : undefined;

        // Server-side brand allowlist for content writers. The
        // formula joins (AND) with whatever the user typed in the
        // client filter so the writer can never escape the limit.
        const brandFormula = await buildBrandFilterFormula(
          user.allowedBrandIds,
          user.role
        );
        let filterByFormula: string | undefined = userFilter;
        if (brandFormula) {
          filterByFormula = userFilter
            ? `AND(${brandFormula},${userFilter})`
            : brandFormula;
        }

        const result = await listRecords(baseId, tableId, {
          pageSize,
          offset,
          filterByFormula,
          sort,
        });

        // Apply field restrictions
        const restrictedFields = await getFieldRestrictions(user.id, user.role, baseId, tableId);
        if (restrictedFields.length > 0) {
          result.records = result.records.map((r) => {
            const filtered = { ...r.fields };
            restrictedFields.forEach((f) => delete filtered[f]);
            return { ...r, fields: filtered };
          });
        }

        // Resolve linked record names
        let linkedRecordNames: Record<string, string> = {};
        try {
          const allTables = await listTables(baseId);
          const currentTable = allTables.find((t) => t.id === tableId);
          if (currentTable) {
            linkedRecordNames = await resolveLinkedRecordNames(
              baseId,
              result.records,
              currentTable.fields,
              allTables
            );
          }
        } catch (err) {
          logger.warn("Failed to resolve linked record names", "API", err);
        }

        return NextResponse.json({ ...result, linkedRecordNames });
      }

      case "record": {
        const baseId = searchParams.get("baseId");
        const tableId = searchParams.get("tableId");
        const recordId = searchParams.get("recordId");
        if (!baseId || !tableId || !recordId) {
          return NextResponse.json({ error: "معرف القاعدة والجدول والسجل مطلوبان" }, { status: 400 });
        }
        if (!(await checkPermission(user.id, user.role, baseId, tableId, "canView"))) {
          return NextResponse.json({ error: "لا تملك صلاحية الوصول" }, { status: 403 });
        }
        const record = await getRecord(baseId, tableId, recordId);
        return NextResponse.json({ record });
      }

      case "comments": {
        const baseId = searchParams.get("baseId");
        const tableId = searchParams.get("tableId");
        const recordId = searchParams.get("recordId");
        const offset = searchParams.get("offset") ?? undefined;
        if (!baseId || !tableId || !recordId) {
          return NextResponse.json({ error: "معرف القاعدة والجدول والسجل مطلوبان" }, { status: 400 });
        }
        if (!(await checkPermission(user.id, user.role, baseId, tableId, "canView"))) {
          return NextResponse.json({ error: "لا تملك صلاحية الوصول" }, { status: 403 });
        }
        try {
          const result = await listComments(baseId, tableId, recordId, { pageSize: 100, offset });
          return NextResponse.json(result);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "فشل جلب التعليقات";
          return NextResponse.json({ error: msg }, { status: 502 });
        }
      }

      default:
        return NextResponse.json({ error: "إجراء غير صالح" }, { status: 400 });
    }
  } catch (error) {
    logger.error(`API error: ${action}`, "API", error, user.id);
    const message = error instanceof Error ? error.message : "حدث خطأ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, baseId, tableId, recordId, fields } = body;

    if (!baseId || !tableId) {
      return NextResponse.json({ error: "معرف القاعدة والجدول مطلوبان" }, { status: 400 });
    }

    switch (action) {
      case "create": {
        if (!(await checkPermission(user.id, user.role, baseId, tableId, "canCreate"))) {
          return NextResponse.json({ error: "لا تملك صلاحية الإنشاء" }, { status: 403 });
        }
        const newRecord = await createRecord(baseId, tableId, fields);
        logger.info(`Record created by ${user.name}`, "API", { baseId, tableId }, user.id);
        return NextResponse.json({ record: newRecord });
      }

      case "update": {
        if (!recordId) {
          return NextResponse.json({ error: "معرف السجل مطلوب" }, { status: 400 });
        }
        if (!(await checkPermission(user.id, user.role, baseId, tableId, "canEdit"))) {
          return NextResponse.json({ error: "لا تملك صلاحية التعديل" }, { status: 403 });
        }
        const updated = await updateRecord(baseId, tableId, recordId, fields);
        logger.info(`Record ${recordId} updated by ${user.name}`, "API", { baseId, tableId, fields }, user.id);
        return NextResponse.json({ record: updated });
      }

      case "delete": {
        if (!recordId) {
          return NextResponse.json({ error: "معرف السجل مطلوب" }, { status: 400 });
        }
        if (!(await checkPermission(user.id, user.role, baseId, tableId, "canDelete"))) {
          return NextResponse.json({ error: "لا تملك صلاحية الحذف" }, { status: 403 });
        }
        await deleteRecord(baseId, tableId, recordId);
        logger.info(`Record ${recordId} deleted by ${user.name}`, "API", { baseId, tableId }, user.id);
        return NextResponse.json({ success: true });
      }

      case "add-comment": {
        if (!recordId) {
          return NextResponse.json({ error: "معرف السجل مطلوب" }, { status: 400 });
        }
        if (!(await checkPermission(user.id, user.role, baseId, tableId, "canView"))) {
          return NextResponse.json({ error: "لا تملك صلاحية الوصول" }, { status: 403 });
        }
        const text = typeof body.text === "string" ? body.text : "";
        const parentCommentId = typeof body.parentCommentId === "string" ? body.parentCommentId : undefined;
        try {
          const comment = await createComment(baseId, tableId, recordId, text, parentCommentId);
          logger.info(
            `Comment added on record ${recordId} by ${user.name}`,
            "API",
            { baseId, tableId, recordId, commentId: comment.id, length: text.length },
            user.id
          );
          return NextResponse.json({ comment });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "فشل إضافة التعليق";
          return NextResponse.json({ error: msg }, { status: 502 });
        }
      }

      case "delete-comment": {
        if (!recordId) {
          return NextResponse.json({ error: "معرف السجل مطلوب" }, { status: 400 });
        }
        const commentId = typeof body.commentId === "string" ? body.commentId : "";
        if (!commentId) {
          return NextResponse.json({ error: "معرف التعليق مطلوب" }, { status: 400 });
        }
        if (!(await checkPermission(user.id, user.role, baseId, tableId, "canEdit"))) {
          return NextResponse.json({ error: "لا تملك صلاحية الحذف" }, { status: 403 });
        }
        try {
          await deleteComment(baseId, tableId, recordId, commentId);
          logger.info(
            `Comment ${commentId} deleted from record ${recordId} by ${user.name}`,
            "API",
            { baseId, tableId, recordId, commentId },
            user.id
          );
          return NextResponse.json({ success: true });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "فشل حذف التعليق";
          return NextResponse.json({ error: msg }, { status: 502 });
        }
      }

      default:
        return NextResponse.json({ error: "إجراء غير صالح" }, { status: 400 });
    }
  } catch (error) {
    logger.error("API POST error", "API", error, user.id);
    const message = error instanceof Error ? error.message : "حدث خطأ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
