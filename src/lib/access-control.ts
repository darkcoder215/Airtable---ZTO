// Access control rules persisted in Supabase (scraper_access_rules).
// All public functions are async.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type Row = Database["public"]["Tables"]["scraper_access_rules"]["Row"];

export interface AccessRule {
  id: string;
  userId: string;
  userName: string;
  baseId: string;
  baseName: string;
  tableId: string;
  tableName: string;
  permissions: {
    canView: boolean;
    canEdit: boolean;
    canCreate: boolean;
    canDelete: boolean;
  };
  fieldRestrictions: string[];
  filterFormula?: string;
  createdAt: string;
  updatedAt: string;
}

function mapRule(r: Row): AccessRule {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    baseId: r.base_id,
    baseName: r.base_name,
    tableId: r.table_id,
    tableName: r.table_name,
    permissions: {
      canView: r.can_view,
      canEdit: r.can_edit,
      canCreate: r.can_create,
      canDelete: r.can_delete,
    },
    fieldRestrictions: r.field_restrictions ?? [],
    filterFormula: r.filter_formula ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getAccessRules(): Promise<AccessRule[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_access_rules")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getAccessRules: ${error.message}`);
  return (data ?? []).map(mapRule);
}

export async function getAccessRulesForUser(userId: string): Promise<AccessRule[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_access_rules")
    .select("*")
    .eq("user_id", userId);
  if (error) throw new Error(`getAccessRulesForUser: ${error.message}`);
  return (data ?? []).map(mapRule);
}

async function loadMatching(
  userId: string,
  baseId: string,
  tableId: string
): Promise<Row[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_access_rules")
    .select("*")
    .eq("user_id", userId)
    .or(`base_id.eq.*,base_id.eq.${baseId}`)
    .or(`table_id.eq.*,table_id.eq.${tableId}`);
  if (error) throw new Error(`loadMatching: ${error.message}`);
  return data ?? [];
}

// Content-writer access is stored on `app_users.allowed_table_ids` — a
// separate, simpler model than the rules table editor/viewer use. We
// short-circuit here so the airtable route's pre-flight gate doesn't
// reject them before the allowlist filter runs.
async function getContentWriterAllowedTableIds(userId: string): Promise<string[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("app_users")
    .select("allowed_table_ids")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return [];
  return Array.isArray(data.allowed_table_ids) ? data.allowed_table_ids : [];
}

export async function checkPermission(
  userId: string,
  role: string,
  baseId: string,
  tableId: string,
  action: "canView" | "canEdit" | "canCreate" | "canDelete"
): Promise<boolean> {
  if (role === "admin") return true;

  if (role === "content_writer") {
    // Writers can view + edit (incl. create) on tables they've been
    // granted. They cannot delete records — that stays admin/editor.
    if (action === "canDelete") return false;
    // Base-level pre-check (tableId === "*") used by the tables listing
    // endpoint. Let it through; downstream code filters the table list
    // by the allowlist anyway.
    if (tableId === "*") return true;
    const allowed = await getContentWriterAllowedTableIds(userId);
    return allowed.includes(tableId);
  }

  const rules = await loadMatching(userId, baseId, tableId);
  if (rules.length === 0) return false;
  const col = action === "canView" ? "can_view"
    : action === "canEdit" ? "can_edit"
    : action === "canCreate" ? "can_create"
    : "can_delete";
  return rules.some((r) => r[col]);
}

export async function getFieldRestrictions(
  userId: string,
  role: string,
  baseId: string,
  tableId: string
): Promise<string[]> {
  if (role === "admin") return [];
  const rules = await loadMatching(userId, baseId, tableId);
  const restricted = new Set<string>();
  rules.forEach((r) => (r.field_restrictions ?? []).forEach((f) => restricted.add(f)));
  return [...restricted];
}

export async function addAccessRule(
  rule: Omit<AccessRule, "id" | "createdAt" | "updatedAt">
): Promise<AccessRule> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_access_rules")
    .insert({
      user_id: rule.userId,
      user_name: rule.userName,
      base_id: rule.baseId,
      base_name: rule.baseName,
      table_id: rule.tableId,
      table_name: rule.tableName,
      can_view: rule.permissions.canView,
      can_edit: rule.permissions.canEdit,
      can_create: rule.permissions.canCreate,
      can_delete: rule.permissions.canDelete,
      field_restrictions: rule.fieldRestrictions ?? [],
      filter_formula: rule.filterFormula ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`addAccessRule: ${error.message}`);
  return mapRule(data);
}

export async function updateAccessRule(
  id: string,
  update: Partial<AccessRule>
): Promise<AccessRule | null> {
  const sb = getSupabaseAdmin();
  const patch: Database["public"]["Tables"]["scraper_access_rules"]["Update"] = {
    updated_at: new Date().toISOString(),
  };
  if (update.userId !== undefined) patch.user_id = update.userId;
  if (update.userName !== undefined) patch.user_name = update.userName;
  if (update.baseId !== undefined) patch.base_id = update.baseId;
  if (update.baseName !== undefined) patch.base_name = update.baseName;
  if (update.tableId !== undefined) patch.table_id = update.tableId;
  if (update.tableName !== undefined) patch.table_name = update.tableName;
  if (update.permissions) {
    patch.can_view = update.permissions.canView;
    patch.can_edit = update.permissions.canEdit;
    patch.can_create = update.permissions.canCreate;
    patch.can_delete = update.permissions.canDelete;
  }
  if (update.fieldRestrictions !== undefined) patch.field_restrictions = update.fieldRestrictions;
  if (update.filterFormula !== undefined) patch.filter_formula = update.filterFormula ?? null;

  const { data, error } = await sb
    .from("scraper_access_rules")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`updateAccessRule: ${error.message}`);
  return data ? mapRule(data) : null;
}

export async function deleteAccessRule(id: string): Promise<boolean> {
  const sb = getSupabaseAdmin();
  const { error, count } = await sb
    .from("scraper_access_rules")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw new Error(`deleteAccessRule: ${error.message}`);
  return (count ?? 0) > 0;
}
