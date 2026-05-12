// Tasks API.
//
//   GET  /api/tasks                 → mine (assignee view)
//   GET  /api/tasks?action=all      → admin only — every task in the system
//   GET  /api/tasks?action=unread   → unread count for the bell badge
//   POST { action: "create", ... }       → admin only
//   POST { action: "update", id, ... }   → admin (any task) OR assignee (status + mark-read on their own task)
//   POST { action: "mark-read", id|all } → assignee acks
//   POST { action: "delete", id }        → admin only
//
// Every body is server-validated via lib/tasks helpers; permissions are
// enforced here before any helper runs.

import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAdmin } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import {
  listTasksForUser,
  listAllTasks,
  getUnreadCount,
  createTask,
  updateTask,
  deleteTask,
  getTaskById,
  TaskValidationError,
} from "@/lib/tasks";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "غير مصادق" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") ?? "mine";

  // Tasks must be enabled for the user (admins always have access).
  if (!isAdmin(user) && !user.tasksEnabled) {
    return NextResponse.json({ error: "تبويب المهام غير مفعّل لحسابك" }, { status: 403 });
  }

  try {
    if (action === "unread") {
      const count = await getUnreadCount(user.id);
      return NextResponse.json({ count });
    }
    if (action === "all") {
      if (!isAdmin(user)) {
        return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
      }
      const tasks = await listAllTasks();
      return NextResponse.json({ tasks });
    }
    // Default: mine.
    const tasks = await listTasksForUser(user.id);
    return NextResponse.json({ tasks });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error(`tasks GET failed: ${msg}`, "Tasks", err, user.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  if (!isAdmin(user) && !user.tasksEnabled) {
    return NextResponse.json({ error: "تبويب المهام غير مفعّل لحسابك" }, { status: 403 });
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
      case "create": {
        if (!isAdmin(user)) {
          return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
        }
        const task = await createTask(user.id, {
          assignedTo: body.assignedTo,
          title: body.title,
          description: body.description,
          priority: body.priority,
          dueAt: body.dueAt,
          meta: body.meta,
        });
        logger.info(
          `Task "${task.title.slice(0, 60)}" assigned to ${task.assignedToName ?? task.assignedTo} by ${user.name}`,
          "Tasks",
          { taskId: task.id, assignedTo: task.assignedTo, priority: task.priority },
          user.id
        );
        return NextResponse.json({ task });
      }

      case "update": {
        const id = typeof body.id === "string" ? body.id : "";
        if (!id) return NextResponse.json({ error: "معرّف المهمّة مطلوب" }, { status: 400 });
        const existing = await getTaskById(id);
        if (!existing) return NextResponse.json({ error: "المهمّة غير موجودة" }, { status: 404 });
        const admin = isAdmin(user);
        const isAssignee = existing.assignedTo === user.id;
        if (!admin && !isAssignee) {
          return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
        }
        const task = await updateTask(
          id,
          {
            title: body.title,
            description: body.description,
            status: body.status,
            priority: body.priority,
            dueAt: body.dueAt,
            assignedTo: body.assignedTo,
            markRead: body.markRead,
          },
          { byAssignee: !admin }
        );
        if (!task) return NextResponse.json({ error: "تعذّر التحديث" }, { status: 500 });
        logger.info(
          `Task ${id} updated (status=${task.status}) by ${user.name}`,
          "Tasks",
          { taskId: id, byAssignee: !admin, status: task.status },
          user.id
        );
        return NextResponse.json({ task });
      }

      case "mark-read": {
        // The bell click hits this with `all=true` to clear every
        // pending notification at once; individual cards send `id`.
        if (body.all === true) {
          const sb = getSupabaseAdmin();
          const now = new Date().toISOString();
          const { error, count } = await sb
            .from("app_tasks")
            .update({ read_at: now }, { count: "exact" })
            .eq("assigned_to", user.id)
            .is("read_at", null);
          if (error) throw error;
          return NextResponse.json({ marked: count ?? 0 });
        }
        const id = typeof body.id === "string" ? body.id : "";
        if (!id) return NextResponse.json({ error: "معرّف المهمّة مطلوب" }, { status: 400 });
        const existing = await getTaskById(id);
        if (!existing) return NextResponse.json({ error: "المهمّة غير موجودة" }, { status: 404 });
        if (!isAdmin(user) && existing.assignedTo !== user.id) {
          return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
        }
        const task = await updateTask(id, { markRead: true }, { byAssignee: !isAdmin(user) });
        return NextResponse.json({ task });
      }

      case "delete": {
        if (!isAdmin(user)) {
          return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
        }
        const id = typeof body.id === "string" ? body.id : "";
        if (!id) return NextResponse.json({ error: "معرّف المهمّة مطلوب" }, { status: 400 });
        const ok = await deleteTask(id);
        if (!ok) return NextResponse.json({ error: "المهمّة غير موجودة" }, { status: 404 });
        logger.info(`Task ${id} deleted by ${user.name}`, "Tasks", { taskId: id }, user.id);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: "إجراء غير صالح" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof TaskValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error(`tasks POST failed: ${msg}`, "Tasks", err, user.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
