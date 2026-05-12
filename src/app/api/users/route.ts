// User-management endpoint. Admin-only for every action.
//
// All input is server-validated (length caps, format checks, role enum) so a
// hostile client can't smuggle in unsupported values. The current admin
// can never demote/disable themselves through this endpoint — they have to
// hand the role to someone else first.

import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAdmin } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { hashPassword, type Role } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ROLES: Role[] = ["admin", "editor", "content_writer", "viewer"];
const TABLE_ID_RE = /^tbl[A-Za-z0-9]{8,32}$/;

// Tightened to ASCII-ish identifiers so URLs can stay clean and SQL never
// sees anything weird. citext on the column gives us case-insensitive
// uniqueness, but we still constrain client-side input shape.
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,64}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,24}$/;

interface SafePublicUser {
  id: string;
  username: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  // Per-user Airtable table allowlist (content_writer only). null
  // means "no restriction"; an array (even empty) means restricted.
  allowedTableIds: string[] | null;
}
type Row = Database["public"]["Tables"]["app_users"]["Row"];
function map(r: Row): SafePublicUser {
  return {
    id: r.id,
    username: r.username,
    email: r.email,
    name: r.name,
    role: r.role as Role,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastLoginAt: r.last_login_at,
    allowedTableIds: Array.isArray(r.allowed_table_ids) ? r.allowed_table_ids : null,
  };
}

// Validate an allowlist payload. Returns either an array of valid
// Airtable table IDs (possibly empty) or null when the caller wants
// to clear the restriction. Anything malformed throws.
function readAllowedTableIds(v: unknown): string[] | null {
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v)) {
    throw new Error("قائمة الجداول المسموحة يجب أن تكون مصفوفة");
  }
  const seen = new Set<string>();
  for (const x of v) {
    if (typeof x !== "string") throw new Error("معرّف جدول غير صالح");
    const t = x.trim();
    if (!TABLE_ID_RE.test(t)) {
      throw new Error(`معرّف جدول غير صالح: ${t.slice(0, 40)}`);
    }
    seen.add(t);
  }
  if (seen.size > 64) throw new Error("الحد الأقصى 64 جدولاً للمستخدم الواحد");
  return Array.from(seen);
}

// Keep payload validation in one place — reused by create + update.
function readNonEmptyString(v: unknown, label: string, max = 256): string {
  if (typeof v !== "string") throw new Error(`${label} غير صالح`);
  const t = v.trim();
  if (!t) throw new Error(`${label} مطلوب`);
  if (t.length > max) throw new Error(`${label} طويل جداً`);
  return t;
}

function readUsername(v: unknown): string {
  const t = readNonEmptyString(v, "اسم المستخدم", 64);
  if (!USERNAME_RE.test(t)) {
    throw new Error("اسم المستخدم يحتوي حروفاً غير مسموحة (a-z، 0-9، .، _ ، -)");
  }
  return t.toLowerCase();
}

function readEmail(v: unknown): string {
  const t = readNonEmptyString(v, "البريد الإلكتروني", 320).toLowerCase();
  if (!EMAIL_RE.test(t)) throw new Error("صيغة البريد الإلكتروني غير صحيحة");
  return t;
}

function readRole(v: unknown): Role {
  if (typeof v !== "string" || !VALID_ROLES.includes(v as Role)) {
    throw new Error("الدور غير صالح (admin/editor/content_writer/viewer فقط)");
  }
  return v as Role;
}

function readPassword(v: unknown): string {
  if (typeof v !== "string") throw new Error("كلمة المرور غير صالحة");
  if (v.length < 8) throw new Error("كلمة المرور يجب أن تكون 8 حروف على الأقل");
  if (v.length > 256) throw new Error("كلمة المرور طويلة جداً");
  // Reject obviously weak passwords. Not a substitute for a passphrase
  // policy but kicks the most common ones (admin/admin, password123).
  const weak = ["password", "12345678", "11111111", "qwerty12", "letmein1"];
  if (weak.includes(v.toLowerCase())) throw new Error("كلمة المرور ضعيفة جداً");
  return v;
}

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
  }
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("app_users")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ users: (data ?? []).map(map) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error(`users GET failed: ${msg}`, "Users", err, user.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const me = await getRequestUser(request);
  if (!me) return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  if (!isAdmin(me)) {
    return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  const action = typeof body.action === "string" ? body.action : "";
  const sb = getSupabaseAdmin();

  try {
    switch (action) {
      case "create": {
        const username = readUsername(body.username);
        const email = readEmail(body.email);
        const name = readNonEmptyString(body.name, "الاسم الكامل", 128);
        const role = readRole(body.role);
        const password = readPassword(body.password);
        const password_hash = hashPassword(password);
        // Allowlist only meaningful for content_writer — for other roles
        // we explicitly null it so a stale value can't leak through.
        const allowed_table_ids =
          role === "content_writer" ? readAllowedTableIds(body.allowedTableIds) ?? [] : null;
        const { data, error } = await sb
          .from("app_users")
          .insert({
            username,
            email,
            name,
            role,
            is_active: body.isActive === false ? false : true,
            password_hash,
            created_by: me.id,
            allowed_table_ids,
          })
          .select()
          .single();
        if (error) {
          if (/duplicate key/i.test(error.message)) {
            return NextResponse.json(
              { error: "اسم المستخدم أو البريد الإلكتروني مستخدم سلفاً" },
              { status: 409 }
            );
          }
          throw error;
        }
        logger.info(
          `User "${data.username}" created (role=${data.role}) by ${me.name}`,
          "Users",
          { newUserId: data.id, role: data.role },
          me.id
        );
        return NextResponse.json({ user: map(data) });
      }

      case "update": {
        const id = typeof body.id === "string" ? body.id : "";
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
          return NextResponse.json({ error: "معرّف المستخدم مطلوب" }, { status: 400 });
        }
        // Refuse self-modifications that would lock the admin out.
        if (id === me.id) {
          if (body.role !== undefined && body.role !== "admin") {
            return NextResponse.json(
              { error: "لا يمكنك تنزيل دورك بنفسك. عيّن مديراً آخر أولاً." },
              { status: 400 }
            );
          }
          if (body.isActive === false) {
            return NextResponse.json(
              { error: "لا يمكنك تعطيل نفسك" },
              { status: 400 }
            );
          }
        }
        type Patch = Database["public"]["Tables"]["app_users"]["Update"];
        const patch: Patch = { updated_at: new Date().toISOString() };
        if (body.name !== undefined) patch.name = readNonEmptyString(body.name, "الاسم الكامل", 128);
        if (body.email !== undefined) patch.email = readEmail(body.email);
        if (body.username !== undefined) patch.username = readUsername(body.username);
        if (body.role !== undefined) patch.role = readRole(body.role);
        if (body.isActive !== undefined) {
          if (typeof body.isActive !== "boolean") {
            return NextResponse.json({ error: "isActive يجب أن يكون boolean" }, { status: 400 });
          }
          patch.is_active = body.isActive;
        }
        if (body.password !== undefined) {
          const p = readPassword(body.password);
          patch.password_hash = hashPassword(p);
        }
        // Allowed-tables can be patched on its own or alongside the
        // role change. When the resulting role isn't content_writer
        // we wipe the allowlist (the role itself already permits all
        // tables, so a leftover restriction would be confusing).
        const nextRole = patch.role as Role | undefined;
        if (body.allowedTableIds !== undefined) {
          const list = readAllowedTableIds(body.allowedTableIds);
          patch.allowed_table_ids = list;
        }
        if (nextRole && nextRole !== "content_writer" && body.allowedTableIds === undefined) {
          patch.allowed_table_ids = null;
        }
        const { data, error } = await sb
          .from("app_users")
          .update(patch)
          .eq("id", id)
          .select()
          .maybeSingle();
        if (error) {
          if (/duplicate key/i.test(error.message)) {
            return NextResponse.json(
              { error: "اسم المستخدم أو البريد الإلكتروني مستخدم سلفاً" },
              { status: 409 }
            );
          }
          throw error;
        }
        if (!data) {
          return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
        }
        logger.info(
          `User "${data.username}" updated by ${me.name}`,
          "Users",
          {
            userId: id,
            changedKeys: Object.keys(patch).filter((k) => k !== "updated_at" && k !== "password_hash"),
            passwordReset: "password_hash" in patch,
          },
          me.id
        );
        return NextResponse.json({ user: map(data) });
      }

      case "delete": {
        const id = typeof body.id === "string" ? body.id : "";
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
          return NextResponse.json({ error: "معرّف المستخدم مطلوب" }, { status: 400 });
        }
        if (id === me.id) {
          return NextResponse.json(
            { error: "لا يمكنك حذف نفسك" },
            { status: 400 }
          );
        }
        // Block deleting the last admin.
        const { count: adminCount } = await sb
          .from("app_users")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin")
          .eq("is_active", true);
        const { data: target } = await sb
          .from("app_users")
          .select("role, is_active")
          .eq("id", id)
          .maybeSingle();
        if (target?.role === "admin" && target?.is_active && (adminCount ?? 0) <= 1) {
          return NextResponse.json(
            { error: "لا يمكن حذف آخر مدير في النظام" },
            { status: 400 }
          );
        }
        const { error, count } = await sb
          .from("app_users")
          .delete({ count: "exact" })
          .eq("id", id);
        if (error) throw error;
        if ((count ?? 0) === 0) {
          return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
        }
        logger.info(`User ${id} deleted by ${me.name}`, "Users", null, me.id);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: "إجراء غير صالح" }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error(`users POST failed: ${msg}`, "Users", err, me.id);
    // Validation errors come back as plain Error throws above.
    const status = msg.includes("غير صالح") || msg.includes("مطلوب") || msg.includes("ضعيفة") || msg.includes("صيغة") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
