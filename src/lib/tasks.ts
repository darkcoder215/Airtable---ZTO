// CRUD for app_tasks. Scoped helpers — every public function here gets
// an explicit caller user id so the route layer can enforce who can do
// what without having to thread the auth check through every body.
//
// Tasks visibility rules:
//  • admin can list / create / update / delete any task.
//  • assignee can list their own tasks, mark them in_progress / done,
//    acknowledge ("read") them, and add a comment via meta.notes — but
//    cannot reassign or delete.
//  • everyone else can't see the table (the route blocks them).

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type TaskRow = Database["public"]["Tables"]["app_tasks"]["Row"];
type TaskInsert = Database["public"]["Tables"]["app_tasks"]["Insert"];
type TaskUpdate = Database["public"]["Tables"]["app_tasks"]["Update"];

export type TaskStatus = "pending" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export interface AppTask {
  id: string;
  assignedTo: string;
  assignedBy: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  readAt: string | null;
  completedAt: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  // Server-side joins fold the assignee/assigner names into the
  // response so the UI doesn't need a second roundtrip per task.
  assignedToName?: string;
  assignedByName?: string | null;
}

export class TaskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskValidationError";
  }
}

const STATUSES: TaskStatus[] = ["pending", "in_progress", "done", "cancelled"];
const PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];
const UUID_RE = /^[0-9a-f-]{36}$/i;

function mapTask(r: TaskRow & { assigned_to_user?: { name?: string }; assigned_by_user?: { name?: string } | null }): AppTask {
  const meta =
    r.meta && typeof r.meta === "object" && !Array.isArray(r.meta)
      ? (r.meta as Record<string, unknown>)
      : {};
  return {
    id: r.id,
    assignedTo: r.assigned_to,
    assignedBy: r.assigned_by,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    dueAt: r.due_at,
    readAt: r.read_at,
    completedAt: r.completed_at,
    meta,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    assignedToName: r.assigned_to_user?.name,
    assignedByName: r.assigned_by_user?.name ?? null,
  };
}

function readNonEmptyString(v: unknown, label: string, max = 256): string {
  if (typeof v !== "string") throw new TaskValidationError(`${label} غير صالح`);
  const t = v.trim();
  if (!t) throw new TaskValidationError(`${label} مطلوب`);
  if (t.length > max) throw new TaskValidationError(`${label} طويل جداً (الحد ${max})`);
  return t;
}

function readOptionalString(v: unknown, label: string, max: number): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new TaskValidationError(`${label} غير صالح`);
  const t = v.trim();
  if (!t) return null;
  if (t.length > max) throw new TaskValidationError(`${label} طويل جداً (الحد ${max})`);
  return t;
}

function readUuid(v: unknown, label: string): string {
  if (typeof v !== "string" || !UUID_RE.test(v)) {
    throw new TaskValidationError(`${label} غير صالح`);
  }
  return v;
}

function readEnum<T extends string>(v: unknown, allowed: readonly T[], label: string): T {
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
    throw new TaskValidationError(`${label} غير صالح`);
  }
  return v as T;
}

function readOptionalIso(v: unknown, label: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new TaskValidationError(`${label} غير صالح`);
  const t = Date.parse(v);
  if (!Number.isFinite(t)) throw new TaskValidationError(`${label} ليس تاريخاً صالحاً`);
  return new Date(t).toISOString();
}

// --- Public surface --------------------------------------------------------

export async function listTasksForUser(userId: string): Promise<AppTask[]> {
  if (!UUID_RE.test(userId)) return [];
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("app_tasks")
    .select(`
      *,
      assigned_to_user:app_users!app_tasks_assigned_to_fkey ( name ),
      assigned_by_user:app_users!app_tasks_assigned_by_fkey ( name )
    `)
    .eq("assigned_to", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listTasksForUser: ${error.message}`);
  // The relationship aliases above narrow to a single object per row
  // since each FK is a single-link, but the typed builder still hands
  // back `unknown`-ish shapes; cast is safe.
  return (data ?? []).map((r) => mapTask(r as Parameters<typeof mapTask>[0]));
}

export async function listAllTasks(): Promise<AppTask[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("app_tasks")
    .select(`
      *,
      assigned_to_user:app_users!app_tasks_assigned_to_fkey ( name ),
      assigned_by_user:app_users!app_tasks_assigned_by_fkey ( name )
    `)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`listAllTasks: ${error.message}`);
  return (data ?? []).map((r) => mapTask(r as Parameters<typeof mapTask>[0]));
}

export async function getUnreadCount(userId: string): Promise<number> {
  if (!UUID_RE.test(userId)) return 0;
  const sb = getSupabaseAdmin();
  const { count, error } = await sb
    .from("app_tasks")
    .select("id", { count: "exact", head: true })
    .eq("assigned_to", userId)
    .is("read_at", null)
    .neq("status", "cancelled");
  if (error) throw new Error(`getUnreadCount: ${error.message}`);
  return count ?? 0;
}

export async function createTask(
  byUserId: string,
  input: {
    assignedTo: unknown;
    title: unknown;
    description?: unknown;
    priority?: unknown;
    dueAt?: unknown;
    meta?: unknown;
  }
): Promise<AppTask> {
  const assigned_to = readUuid(input.assignedTo, "المسؤول");
  const title = readNonEmptyString(input.title, "العنوان", 240);
  const description = readOptionalString(input.description, "الوصف", 6000);
  const priority = input.priority === undefined
    ? "normal"
    : readEnum(input.priority, PRIORITIES, "الأولوية");
  const due_at = readOptionalIso(input.dueAt, "تاريخ الاستحقاق");
  const meta =
    input.meta && typeof input.meta === "object" && !Array.isArray(input.meta)
      ? (input.meta as Record<string, unknown>)
      : {};

  const sb = getSupabaseAdmin();
  const insert: TaskInsert = {
    assigned_to,
    assigned_by: byUserId,
    title,
    description,
    priority,
    due_at,
    meta: meta as TaskInsert["meta"],
  };
  const { data, error } = await sb
    .from("app_tasks")
    .insert(insert)
    .select(`
      *,
      assigned_to_user:app_users!app_tasks_assigned_to_fkey ( name ),
      assigned_by_user:app_users!app_tasks_assigned_by_fkey ( name )
    `)
    .single();
  if (error) throw new Error(`createTask: ${error.message}`);
  return mapTask(data as Parameters<typeof mapTask>[0]);
}

// updateTask is shared between admin (full edit) and assignee (status +
// read_at only). The route layer passes `byAssignee=true` to lock the
// patch surface to safe fields.
export async function updateTask(
  id: string,
  patch: {
    title?: unknown;
    description?: unknown;
    status?: unknown;
    priority?: unknown;
    dueAt?: unknown;
    assignedTo?: unknown;
    markRead?: unknown;
  },
  opts: { byAssignee: boolean }
): Promise<AppTask | null> {
  if (!UUID_RE.test(id)) return null;
  const sb = getSupabaseAdmin();
  const u: TaskUpdate = {};

  if (opts.byAssignee) {
    // Assignee: status (only the safe transitions) + read acknowledge.
    if (patch.status !== undefined) {
      const next = readEnum(patch.status, STATUSES, "الحالة");
      // Assignees can't cancel a task — that's an admin-only escalator.
      if (next === "cancelled") {
        throw new TaskValidationError("الإلغاء يحتاج صلاحية إدارية");
      }
      u.status = next;
      if (next === "done") u.completed_at = new Date().toISOString();
      else u.completed_at = null;
    }
    if (patch.markRead === true) {
      u.read_at = new Date().toISOString();
    }
  } else {
    // Admin: full edit surface.
    if (patch.title !== undefined) u.title = readNonEmptyString(patch.title, "العنوان", 240);
    if (patch.description !== undefined) u.description = readOptionalString(patch.description, "الوصف", 6000);
    if (patch.status !== undefined) {
      const next = readEnum(patch.status, STATUSES, "الحالة");
      u.status = next;
      u.completed_at = next === "done" ? new Date().toISOString() : null;
    }
    if (patch.priority !== undefined) u.priority = readEnum(patch.priority, PRIORITIES, "الأولوية");
    if (patch.dueAt !== undefined) u.due_at = readOptionalIso(patch.dueAt, "تاريخ الاستحقاق");
    if (patch.assignedTo !== undefined) u.assigned_to = readUuid(patch.assignedTo, "المسؤول");
    if (patch.markRead === true) u.read_at = new Date().toISOString();
  }

  if (Object.keys(u).length === 0) {
    // Nothing to change — surface the row unchanged so the UI can refresh.
    const { data } = await sb
      .from("app_tasks")
      .select(`
        *,
        assigned_to_user:app_users!app_tasks_assigned_to_fkey ( name ),
        assigned_by_user:app_users!app_tasks_assigned_by_fkey ( name )
      `)
      .eq("id", id)
      .maybeSingle();
    return data ? mapTask(data as Parameters<typeof mapTask>[0]) : null;
  }

  const { data, error } = await sb
    .from("app_tasks")
    .update(u)
    .eq("id", id)
    .select(`
      *,
      assigned_to_user:app_users!app_tasks_assigned_to_fkey ( name ),
      assigned_by_user:app_users!app_tasks_assigned_by_fkey ( name )
    `)
    .maybeSingle();
  if (error) throw new Error(`updateTask: ${error.message}`);
  return data ? mapTask(data as Parameters<typeof mapTask>[0]) : null;
}

export async function deleteTask(id: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const sb = getSupabaseAdmin();
  const { error, count } = await sb
    .from("app_tasks")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw new Error(`deleteTask: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function getTaskById(id: string): Promise<AppTask | null> {
  if (!UUID_RE.test(id)) return null;
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("app_tasks")
    .select(`
      *,
      assigned_to_user:app_users!app_tasks_assigned_to_fkey ( name ),
      assigned_by_user:app_users!app_tasks_assigned_by_fkey ( name )
    `)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getTaskById: ${error.message}`);
  return data ? mapTask(data as Parameters<typeof mapTask>[0]) : null;
}
