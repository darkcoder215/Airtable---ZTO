import { NextRequest, NextResponse } from "next/server";
import { listBases, listTables, listRecords, createRecord, updateRecord, deleteRecord, getRecord, resolveLinkedRecordNames } from "@/lib/airtable";
import { verifySessionToken, getUserById } from "@/lib/auth";
import { checkPermission, getFieldRestrictions } from "@/lib/access-control";
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
        const tables = await listTables(baseId);
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

        const offset = searchParams.get("offset") || undefined;
        const pageSize = searchParams.get("pageSize") ? parseInt(searchParams.get("pageSize")!) : 50;
        const filterByFormula = searchParams.get("filter") || undefined;
        const sortField = searchParams.get("sortField");
        const sortDir = searchParams.get("sortDir") as "asc" | "desc" | null;

        const sort = sortField ? [{ field: sortField, direction: sortDir || ("asc" as const) }] : undefined;

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
  const user = getUser(request);
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

      default:
        return NextResponse.json({ error: "إجراء غير صالح" }, { status: 400 });
    }
  } catch (error) {
    logger.error("API POST error", "API", error, user.id);
    const message = error instanceof Error ? error.message : "حدث خطأ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
