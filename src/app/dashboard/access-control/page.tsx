"use client";

// Admin-only user management page. All security checks happen server-side
// in /api/users — this UI just talks to that API and renders the result.

import { useEffect, useMemo, useState } from "react";
import {
  Users,
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  Loader2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Eye,
  EyeOff,
  Lock,
  Search,
  KeyRound,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Info,
  ListChecks,
  Sparkles,
} from "lucide-react";
import { useAppStore } from "@/store/app-store";
import PageGuide from "@/components/PageGuide";

type Role = "admin" | "editor" | "content_writer" | "viewer";

interface AppUser {
  id: string;
  username: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  // Per-user Airtable table allowlist — only meaningful when role
  // is content_writer. NULL = inherit-from-role (full access).
  allowedTableIds: string[] | null;
  // Brand allowlist (content_writer only). null = no restriction.
  allowedBrandIds: string[] | null;
  // True when the Tasks tab + bell are visible for this user.
  tasksEnabled: boolean;
}

const ROLE_META: Record<Role, { label: string; description: string; color: string; bg: string; icon: typeof Shield }> = {
  admin: {
    label: "مدير",
    description: "صلاحيات كاملة: المستخدمون، المصادر، الوكلاء، الوجهة، السجلات.",
    color: "text-amber-400",
    bg: "bg-amber-400/10 border-amber-400/30",
    icon: ShieldCheck,
  },
  editor: {
    label: "محرّر",
    description: "إنشاء وتحرير المحتوى والمصادر، لكن دون إدارة المستخدمين أو إعدادات الوجهة.",
    color: "text-blue-400",
    bg: "bg-blue-400/10 border-blue-400/30",
    icon: Shield,
  },
  content_writer: {
    label: "كاتب محتوى",
    description: "يرى فقط الجداول المخصّصة له في Airtable + مولّد الصور + الوكلاء. لا يصل لباقي الأقسام.",
    color: "text-purple-400",
    bg: "bg-purple-400/10 border-purple-400/30",
    icon: Shield,
  },
  viewer: {
    label: "مراجع",
    description: "قراءة فقط — لا يستطيع التعديل أو الحذف.",
    color: "text-neutral-300",
    bg: "bg-neutral-700/10 border-neutral-700/30",
    icon: ShieldAlert,
  },
};

const PERMISSIONS = [
  { feat: "قاعدة البيانات (Airtable)", admin: true, editor: true, content_writer: "scoped" as const, viewer: true,  detail: "كاتب المحتوى يرى فقط الجداول المسموحة له." },
  { feat: "تعديل الخلايا",              admin: true, editor: true, content_writer: true,             viewer: false, detail: "المراجع يقرأ فقط." },
  { feat: "إدارة المصادر",              admin: true, editor: false, content_writer: false,            viewer: false, detail: "للمدير فقط." },
  { feat: "تشغيل عملية الجلب",          admin: true, editor: true, content_writer: false,            viewer: true,  detail: "كاتب المحتوى لا يحتاج صفحة المصادر." },
  { feat: "إعدادات الوجهة + الوكلاء",   admin: true, editor: false, content_writer: false,            viewer: false, detail: "تغييرات حساسة." },
  { feat: "إدارة المستخدمين",           admin: true, editor: false, content_writer: false,            viewer: false, detail: "هذه الصفحة." },
  { feat: "السجلات",                    admin: true, editor: false, content_writer: false,            viewer: false, detail: "للمدير فقط." },
  { feat: "مولّد الصور + الوكلاء",     admin: true, editor: true, content_writer: true,             viewer: false, detail: "أدوات الكتابة والتوليد متاحة لكاتب المحتوى." },
];

interface FormState {
  id?: string;
  username: string;
  email: string;
  name: string;
  role: Role;
  password: string;
  isActive: boolean;
  // List of Airtable table IDs the user is allowed to see.
  // Only meaningful when role === "content_writer".
  allowedTableIds: string[];
  // List of brand IDs the writer is allowed to see records for.
  // Records outside these brands are hidden server-side. `null`
  // means "no brand restriction" — the writer sees every record
  // their table allowlist permits, regardless of Brand column.
  allowedBrandIds: string[] | null;
  // Enables the Tasks tab + the topbar bell.
  tasksEnabled: boolean;
}

const blankForm = (): FormState => ({
  username: "",
  email: "",
  name: "",
  role: "viewer",
  password: "",
  isActive: true,
  allowedTableIds: [],
  // Default: no brand restriction. Admin can flip to a subset.
  allowedBrandIds: null,
  tasksEnabled: false,
});

function formatDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

export default function AccessControlPage() {
  const { user, addToast } = useAppStore();

  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "فشل التحميل");
      setUsers(d.users ?? []);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "فشل التحميل", "error");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (user?.role === "admin") void load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  const startCreate = () => {
    setForm(blankForm());
    setError(null);
    setShowForm(true);
  };
  const startEdit = (u: AppUser) => {
    setForm({
      id: u.id,
      username: u.username,
      email: u.email,
      name: u.name,
      role: u.role,
      password: "",
      isActive: u.isActive,
      allowedTableIds: Array.isArray(u.allowedTableIds) ? u.allowedTableIds : [],
      // Preserve null (no restriction) vs. array (restricted) coming
      // from the API; the picker offers a toggle for both states.
      allowedBrandIds: Array.isArray(u.allowedBrandIds) ? u.allowedBrandIds : null,
      tasksEnabled: u.tasksEnabled === true,
    });
    setError(null);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setForm(blankForm());
    setError(null);
    setShowPassword(false);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        action: form.id ? "update" : "create",
        username: form.username,
        email: form.email,
        name: form.name,
        role: form.role,
        isActive: form.isActive,
      };
      if (form.id) payload.id = form.id;
      if (form.password || !form.id) payload.password = form.password;
      // Allowed-tables only ride along when the role is content_writer.
      // For every other role we explicitly send null to clear any
      // stale restriction left over from a role swap.
      if (form.role === "content_writer") {
        payload.allowedTableIds = form.allowedTableIds;
        payload.allowedBrandIds = form.allowedBrandIds;
      } else if (form.id) {
        payload.allowedTableIds = null;
        payload.allowedBrandIds = null;
      }
      payload.tasksEnabled = form.tasksEnabled;
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "فشلت العملية");
        return;
      }
      addToast(form.id ? "تم تحديث المستخدم" : "تم إنشاء المستخدم", "success");
      closeForm();
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (u: AppUser) => {
    if (!confirm(`حذف المستخدم "${u.name}" نهائياً؟`)) return;
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: u.id }),
      });
      const d = await res.json();
      if (!res.ok) { addToast(d.error || "فشل الحذف", "error"); return; }
      addToast("تم الحذف", "success");
      void load();
    } catch {
      addToast("خطأ في الشبكة", "error");
    }
  };

  const toggleActive = async (u: AppUser) => {
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: u.id, isActive: !u.isActive }),
      });
      const d = await res.json();
      if (!res.ok) { addToast(d.error || "فشل التعديل", "error"); return; }
      addToast(u.isActive ? "تم التعطيل" : "تم التفعيل", "success");
      void load();
    } catch { addToast("خطأ في الشبكة", "error"); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.role.includes(q)
    );
  }, [users, search]);

  if (user && user.role !== "admin") {
    return (
      <div className="zto-card p-12 text-center max-w-md mx-auto" dir="rtl">
        <Lock className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
        <p className="text-sm font-bold text-white">هذه الصفحة متاحة للمديرين فقط</p>
        <p className="text-xs text-neutral-500 mt-1">تواصل مع مدير النظام إن احتجت صلاحيات إضافية.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 zto-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2 tracking-tight">
            <Users className="w-5 h-5 text-amber-400" />
            الصلاحيات والمستخدمون
          </h2>
          <p className="text-neutral-400 text-[13px] font-bold mt-1">
            أضف المستخدمين، حدّد دور كل واحد، وفعّل/عطّل الحساب وقتما تشاء. جميع التحقّقات تتم على الخادم.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="zto-btn zto-btn-ghost zto-btn-sm">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            تحديث
          </button>
          <button onClick={startCreate} className="zto-btn zto-btn-gold zto-btn-sm">
            <Plus className="w-3.5 h-3.5" />
            مستخدم جديد
          </button>
        </div>
      </div>

      <PageGuide
        pageName="الصلاحيات والمستخدمون"
        accent="indigo"
        storageKey="access-control"
        intro={
          <>
            من هنا تتحكّم في من يدخل النظام وما الذي يستطيع فعله. ثلاثة أدوار:
            <span className="text-amber-300 mx-1 font-bold">مدير</span>
            (كل شيء)،
            <span className="text-blue-300 mx-1 font-bold">محرّر</span>
            (يضيف/يعدّل لكن لا يحذف ولا يدير الحسابات)،
            <span className="text-emerald-300 mx-1 font-bold">مشاهد</span>
            (قراءة فقط).
          </>
        }
        tips={[
          { title: "مستخدم جديد", body: <>اضغط <span className="text-amber-300 font-bold">«مستخدم جديد»</span>، أدخل البيانات والدور. كلمة المرور تُهَش (scrypt) قبل الحفظ — لا نستطيع نحن قراءتها لاحقاً. زوّد المستخدم بكلمة المرور المؤقّتة بقناة آمنة.</> },
          { title: "تعطيل بدل الحذف", body: <>إذا غادر شخصٌ ما، اضغط زرّ التعطيل بدل الحذف — سجلّاته (من فلتر، ومن صنع، ومن نشر) تبقى مرتبطة باسمه.</> },
          { title: "إعادة تعيين كلمة مرور", body: <>اضغط أيقونة المفتاح بجوار المستخدم. سيُطلب منك إدخال كلمة جديدة فوراً، وتُلغى الجلسات السابقة تلقائياً.</> },
          { title: "تفصيل الصلاحيات", body: <>افتح بطاقة «الأدوار والصلاحيات» أسفل لمعرفة بالضبط أيّ زرّ يخدم أيّ دور — مفيد عند توضيح ذلك للعميل.</> },
        ]}
      />

      {/* Roles + permissions reference */}
      <details className="zto-card p-4 group">
        <summary className="cursor-pointer flex items-center gap-2 list-none">
          <Shield className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-sm font-bold text-white">الأدوار والصلاحيات</span>
          <span className="mr-auto text-[0.65rem] text-neutral-500">اضغط لعرض التفاصيل</span>
        </summary>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          {(Object.keys(ROLE_META) as Role[]).map((r) => {
            const meta = ROLE_META[r];
            const Icon = meta.icon;
            return (
              <div key={r} className={`rounded-lg border p-3 ${meta.bg}`}>
                <p className={`text-sm font-bold flex items-center gap-1.5 ${meta.color}`}>
                  <Icon className="w-4 h-4" />
                  {meta.label}
                </p>
                <p className="text-[0.7rem] text-neutral-300 mt-1.5 leading-relaxed">{meta.description}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-4 zto-card overflow-hidden">
          <table className="w-full text-[0.7rem]">
            <thead>
              <tr className="border-b border-neutral-800 text-[0.6rem] text-neutral-500 font-bold uppercase tracking-wider">
                <th className="text-right px-3 py-2">الميزة</th>
                <th className="text-center px-3 py-2 text-amber-400">مدير</th>
                <th className="text-center px-3 py-2 text-blue-400">محرّر</th>
                <th className="text-center px-3 py-2 text-neutral-300">مراجع</th>
                <th className="text-right px-3 py-2 hidden md:table-cell">ملاحظة</th>
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p.feat} className="border-b border-neutral-800/50 last:border-0">
                  <td className="px-3 py-2 text-white">{p.feat}</td>
                  <PermCell on={p.admin} />
                  <PermCell on={p.editor} />
                  <PermCell on={p.viewer} />
                  <td className="px-3 py-2 text-neutral-500 hidden md:table-cell">{p.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* Search */}
      <div className="zto-card p-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو البريد أو الدور..."
            className="zto-input text-xs"
            style={{ paddingInlineStart: "2.5rem" }}
          />
        </div>
      </div>

      {/* Users list */}
      {loading ? (
        <div className="zto-card p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="zto-card p-12 text-center text-sm text-neutral-500">
          {users.length === 0 ? "لا مستخدمون بعد" : "لا نتائج للفلتر"}
        </div>
      ) : (
        <div className="zto-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800 text-[0.65rem] text-neutral-500 font-bold uppercase tracking-wider">
                <th className="text-right px-4 py-3">المستخدم</th>
                <th className="text-right px-4 py-3 hidden md:table-cell">البريد</th>
                <th className="text-right px-4 py-3">الدور</th>
                <th className="text-right px-4 py-3 hidden lg:table-cell">آخر تسجيل دخول</th>
                <th className="text-center px-4 py-3">الحالة</th>
                <th className="text-left px-4 py-3">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const meta = ROLE_META[u.role];
                const Icon = meta.icon;
                const isMe = u.id === user?.id;
                return (
                  <tr key={u.id} className="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400/30 to-purple-500/30 border border-neutral-700 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-black text-white">
                            {(u.name?.trim()[0] ?? "?").toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{u.name}</p>
                          <p className="text-[0.6rem] text-neutral-500 font-mono">@{u.username}</p>
                        </div>
                        {isMe && (
                          <span className="zto-badge text-[0.55rem] border border-amber-400/30 text-amber-400">
                            أنت
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-[0.7rem] text-neutral-400" dir="ltr">
                      {u.email}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`zto-badge text-[0.6rem] border ${meta.bg} ${meta.color} flex items-center gap-1 w-fit`}>
                        <Icon className="w-3 h-3" />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-[0.65rem] text-neutral-500">
                      {formatDate(u.lastLoginAt)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleActive(u)}
                        title={u.isActive ? "اضغط للتعطيل" : "اضغط للتفعيل"}
                        disabled={isMe}
                        className={`text-[0.6rem] font-bold rounded-full px-2 py-0.5 border transition-colors ${
                          u.isActive
                            ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
                            : "border-neutral-700 text-neutral-500 bg-neutral-800/30"
                        } ${isMe ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        {u.isActive ? "مفعّل" : "معطّل"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => startEdit(u)} className="zto-btn zto-btn-ghost zto-btn-sm" title="تعديل">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteUser(u)}
                          disabled={isMe}
                          className="zto-btn zto-btn-ghost zto-btn-sm text-red-400 hover:text-red-300 disabled:opacity-30"
                          title={isMe ? "لا يمكنك حذف نفسك" : "حذف"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="zto-overlay" onClick={closeForm}>
          <div className="zto-modal w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                {form.id ? <Edit3 className="w-4 h-4 text-amber-400" /> : <Plus className="w-4 h-4 text-amber-400" />}
                {form.id ? "تعديل مستخدم" : "مستخدم جديد"}
              </h3>
              <button onClick={closeForm} className="text-neutral-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Intro banner — what this dialog actually does. Shown
                  on create + edit so admins always have the context. */}
              <div className="bg-amber-400/5 border border-amber-400/30 rounded-lg p-3 flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-[0.7rem] text-neutral-300 leading-relaxed">
                  {form.id ? (
                    <>
                      <span className="font-bold text-amber-300">تعديل مستخدم.</span>{" "}
                      أيّ تغيير هنا يدخل حيّز التنفيذ فور الحفظ.
                      اترك حقل كلمة المرور فارغاً للإبقاء على القديمة.
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-amber-300">إنشاء مستخدم جديد.</span>{" "}
                      اضبط الحقول بالترتيب: <span className="text-neutral-200 font-bold">الهوية</span> ←
                      <span className="text-neutral-200 font-bold"> كلمة المرور</span> ←
                      <span className="text-neutral-200 font-bold"> الدور</span> ←
                      <span className="text-neutral-200 font-bold"> الجداول المسموحة</span> (لكاتب المحتوى فقط) ←
                      <span className="text-neutral-200 font-bold"> المهام</span>.
                      جميع الحقول المُعلَّمة بـ <span className="text-red-400 font-black">*</span> إلزامية.
                    </>
                  )}
                </div>
              </div>

              {/* Identity section */}
              <section className="space-y-3">
                <h4 className="text-[0.65rem] font-black text-neutral-500 uppercase tracking-wider border-b border-neutral-800 pb-1">
                  ١. هوية المستخدم
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="zto-label">الاسم الكامل *</label>
                    <input
                      type="text"
                      className="zto-input"
                      value={form.name}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="مثال: أحمد المحرّر"
                    />
                    <p className="text-[0.6rem] text-neutral-500 mt-1">
                      الاسم الذي يظهر في أعلى الصفحة، في المهام، وفي السجلات.
                    </p>
                  </div>
                  <div>
                    <label className="zto-label">اسم المستخدم *</label>
                    <input
                      type="text"
                      className="zto-input font-mono text-xs"
                      value={form.username}
                      onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                      placeholder="ahmed.editor"
                      dir="ltr"
                    />
                    <p className="text-[0.6rem] text-neutral-500 mt-1">
                      يُستخدم لتسجيل الدخول. حروف لاتينية، أرقام، نقطة، شرطة (٣ – ٦٤ حرف). غير قابل للتغيير لاحقاً.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="zto-label">البريد الإلكتروني *</label>
                  <input
                    type="email"
                    className="zto-input"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="ahmed@example.com"
                    dir="ltr"
                  />
                  <p className="text-[0.6rem] text-neutral-500 mt-1">
                    للأرشفة والتعريف فقط — حالياً لا تُرسَل إليه إشعارات تلقائية.
                  </p>
                </div>
              </section>

              {/* Password section */}
              <section className="space-y-2">
                <h4 className="text-[0.65rem] font-black text-neutral-500 uppercase tracking-wider border-b border-neutral-800 pb-1">
                  ٢. كلمة المرور
                </h4>
                <div>
                  <label className="zto-label flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5" />
                    كلمة المرور {form.id ? "(اتركها فارغة للإبقاء على القديمة)" : "*"}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      className="zto-input"
                      style={{ paddingInlineEnd: "2.5rem" }}
                      value={form.password}
                      onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                      placeholder={form.id ? "••••••••" : "8 حروف على الأقل"}
                      autoComplete="new-password"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
                      title={showPassword ? "إخفاء" : "إظهار"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[0.6rem] text-neutral-500 mt-1 leading-relaxed">
                    تُحفظ مُجزّأة بخوارزمية scrypt — <span className="text-neutral-300 font-bold">لن تستطيع رؤيتها مجدداً</span>،
                    حتى أنت كمدير. انسخها واحفظها في مكان آمن قبل الإغلاق وأرسلها للمستخدم بقناة موثوقة.
                    عند نسيانها، الحلّ الوحيد هو تعيين كلمة جديدة من هذه الصفحة.
                  </p>
                </div>
              </section>

              {/* Role section */}
              <section className="space-y-2">
                <h4 className="text-[0.65rem] font-black text-neutral-500 uppercase tracking-wider border-b border-neutral-800 pb-1">
                  ٣. الدور
                </h4>
                <p className="text-[0.65rem] text-neutral-500">
                  يحدّد الدور الأقسام التي يستطيع المستخدم رؤيتها. اختر بأقل صلاحية ممكنة لإنجاز عمله.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(Object.keys(ROLE_META) as Role[]).map((r) => {
                    const meta = ROLE_META[r];
                    const Icon = meta.icon;
                    const active = form.role === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, role: r }))}
                        className={`text-right rounded-lg border-2 p-3 transition-all ${
                          active
                            ? `${meta.bg} ${meta.color} border-current`
                            : "border-neutral-800 hover:border-neutral-700 text-neutral-400"
                        }`}
                      >
                        <p className="text-sm font-bold flex items-center gap-1.5">
                          <Icon className="w-4 h-4" />
                          {meta.label}
                          {active && <CheckCircle2 className="w-3.5 h-3.5 mr-auto" />}
                        </p>
                        <p className="text-[0.65rem] mt-1 leading-snug">{meta.description}</p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {form.role === "content_writer" && (
                <section className="space-y-2">
                  <h4 className="text-[0.65rem] font-black text-neutral-500 uppercase tracking-wider border-b border-neutral-800 pb-1">
                    ٤. الجداول المسموحة (لكاتب المحتوى)
                  </h4>
                  <p className="text-[0.65rem] text-neutral-500 leading-relaxed">
                    اختر الجداول التي سيستطيع هذا المستخدم رؤيتها وتحريرها. أيّ جدول خارج القائمة محجوب تماماً —
                    حتى لو حاول الوصول إليه بالرابط المباشر. اختيار صفر جداول يعني أنه لن يرى أيّ شيء بعد تسجيل الدخول.
                  </p>
                  <AllowedTablesPicker
                    selected={form.allowedTableIds}
                    onChange={(next) => setForm((p) => ({ ...p, allowedTableIds: next }))}
                  />
                </section>
              )}

              {form.role === "content_writer" && (
                <section className="space-y-2">
                  <h4 className="text-[0.65rem] font-black text-neutral-500 uppercase tracking-wider border-b border-neutral-800 pb-1">
                    ٤.١ العلامات المسموحة (تصفية حسب العلامة)
                  </h4>
                  <p className="text-[0.65rem] text-neutral-500 leading-relaxed">
                    حدّد العلامات التجارية التي سيرى الكاتب سجلاتها. الفلترة تتم على عمود
                    <code className="text-amber-300 mx-1 font-mono">Brand</code>
                    في Airtable. إذا تركتها فارغة، لن يرى أيّ سجل ضمن جداوله. اتركها بلا اختيار (شاملة) لإلغاء التقييد عبر تعديل لاحق.
                  </p>
                  <AllowedBrandsPicker
                    value={form.allowedBrandIds}
                    onChange={(next) => setForm((p) => ({ ...p, allowedBrandIds: next }))}
                  />
                </section>
              )}

              {/* Toggles section */}
              <section className="space-y-2">
                <h4 className="text-[0.65rem] font-black text-neutral-500 uppercase tracking-wider border-b border-neutral-800 pb-1">
                  {form.role === "content_writer" ? "٥" : "٤"}. الحساب والمهام
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-[#1a1a1a] border border-neutral-800 rounded-lg p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white">حالة الحساب</p>
                      <p className="text-[0.65rem] text-neutral-500 leading-snug">
                        {form.isActive
                          ? "يستطيع تسجيل الدخول الآن. أوقفه مؤقتاً بدلاً من الحذف عند انتهاء عمله."
                          : "تسجيل الدخول معطّل. البيانات والمهام محفوظة، يمكنك إعادة التفعيل لاحقاً."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, isActive: !p.isActive }))}
                      className={`text-[0.65rem] font-bold rounded-full px-3 py-1 border transition-colors shrink-0 ${
                        form.isActive
                          ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                          : "border-neutral-700 text-neutral-500 bg-neutral-800/30"
                      }`}
                    >
                      {form.isActive ? "مفعّل" : "معطّل"}
                    </button>
                  </div>

                  {/* Tasks tab toggle — defaults to true for content_writer
                      when creating, but the admin can flip it for any role.
                      Surfaces the bell + the /dashboard/tasks page. */}
                  <div className="bg-[#1a1a1a] border border-neutral-800 rounded-lg p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white">تبويب «المهام»</p>
                      <p className="text-[0.65rem] text-neutral-500 leading-snug">
                        {form.tasksEnabled
                          ? "يظهر تبويب «المهام» + جرس الإشعارات. تستطيع تكليفه بمهام من تلك الصفحة."
                          : "تبويب «المهام» مخفي. لن تستطيع تكليفه بمهام حتى تفعّله."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, tasksEnabled: !p.tasksEnabled }))}
                      className={`text-[0.65rem] font-bold rounded-full px-3 py-1 border transition-colors shrink-0 ${
                        form.tasksEnabled
                          ? "border-amber-400/40 text-amber-300 bg-amber-400/10"
                          : "border-neutral-700 text-neutral-500 bg-neutral-800/30"
                      }`}
                    >
                      {form.tasksEnabled ? "ظاهر" : "مخفي"}
                    </button>
                  </div>
                </div>
              </section>

              {/* Live summary — what this user will actually be able to
                  do once we hit save. Reads form state, so it updates
                  as the admin tweaks role / tables / toggles. */}
              <FormPreview form={form} />

              {error && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-neutral-800 flex items-center gap-3 justify-end">
              <button onClick={closeForm} className="zto-btn zto-btn-ghost">إلغاء</button>
              <button onClick={submit} disabled={saving} className="zto-btn zto-btn-gold">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {form.id ? "حفظ التغييرات" : "إنشاء"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PermCell({ on }: { on: boolean }) {
  return (
    <td className="px-3 py-2 text-center">
      {on ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" />
      ) : (
        <XCircle className="w-3.5 h-3.5 text-neutral-700 inline" />
      )}
    </td>
  );
}

/* ─────────────── AllowedTablesPicker ───────────────
   Lists every Airtable table in the destination base + lets the admin
   tick which ones a content-writer is allowed to see. Pulls /api/airtable
   tables — visible to admins for every base. The "destination" base id
   matches the rest of the app (see destination-mapping.ts).
*/
function AllowedTablesPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  // Hardcoded — same constant as src/lib/destination-mapping.ts. Could be
  // wired through the API later if we ever support multiple bases.
  const BASE_ID = "appIpXIFs2yxyxaUm";
  interface TableLite { id: string; name: string }
  const [tables, setTables] = useState<TableLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/airtable?action=tables&baseId=${encodeURIComponent(BASE_ID)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "فشل تحميل الجداول");
        if (cancelled) return;
        setTables(Array.isArray(data.tables) ? data.tables.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })) : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "فشل تحميل الجداول");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  const selectAll = () => onChange(tables.map((t) => t.id));
  const selectNone = () => onChange([]);

  const q = search.trim().toLowerCase();
  const visible = q ? tables.filter((t) => t.name.toLowerCase().includes(q)) : tables;

  return (
    <div className="bg-purple-500/5 border border-purple-500/30 rounded-lg p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div>
          <p className="text-sm font-bold text-white">الجداول المسموحة *</p>
          <p className="text-[0.65rem] text-neutral-400 mt-0.5">
            اختر الجداول التي يستطيع هذا المستخدم رؤيتها بعد تسجيل الدخول. لن يرى أيّ شيء آخر في Airtable.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={selectAll}
            disabled={loading || tables.length === 0}
            className="text-[0.6rem] font-bold rounded px-2 py-1 border border-neutral-700 text-neutral-300 hover:border-purple-400 hover:text-purple-300 disabled:opacity-40"
          >
            تحديد الكل
          </button>
          <button
            type="button"
            onClick={selectNone}
            disabled={loading || selected.length === 0}
            className="text-[0.6rem] font-bold rounded px-2 py-1 border border-neutral-700 text-neutral-300 hover:border-red-400 hover:text-red-300 disabled:opacity-40"
          >
            مسح
          </button>
        </div>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="بحث في الجداول..."
        className="zto-input text-xs mb-2"
      />

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />
        </div>
      ) : error ? (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">{error}</p>
      ) : visible.length === 0 ? (
        <p className="text-center py-4 text-xs text-neutral-500 font-bold">
          {tables.length === 0 ? "لا توجد جداول في القاعدة" : "لا نتائج للبحث"}
        </p>
      ) : (
        <div className="max-h-56 overflow-y-auto bg-[#0d0d0d] border border-neutral-800 rounded space-y-0.5 p-1">
          {visible.map((t) => {
            const checked = selected.includes(t.id);
            return (
              <label
                key={t.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                  checked ? "bg-purple-400/10 text-purple-200" : "text-neutral-300 hover:bg-neutral-800/40"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(t.id)}
                  className="shrink-0"
                />
                <span className="text-xs font-bold truncate flex-1">{t.name}</span>
                <code className="text-[0.55rem] text-neutral-600 font-mono">{t.id}</code>
              </label>
            );
          })}
        </div>
      )}

      <p className="text-[0.6rem] text-neutral-500 mt-2 font-bold">
        {selected.length} جدول مختار من أصل {tables.length}
      </p>
    </div>
  );
}

/* ─────────────── AllowedBrandsPicker ───────────────
   Same pattern as AllowedTablesPicker but pulls from /api/brands. The
   writer's records get filtered server-side against {Brand}=brand.name
   in Airtable, so the admin picks brand IDs here and the server does
   the name lookup at request time. */
function AllowedBrandsPicker({
  value,
  onChange,
}: {
  // `null` ⇒ "no restriction" (writer sees every brand). An array
  // (even empty) ⇒ restricted to those brand IDs.
  value: string[] | null;
  onChange: (next: string[] | null) => void;
}) {
  interface BrandLite { id: string; name: string; slug: string }
  const [brands, setBrands] = useState<BrandLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Verified names from Airtable Brands table. Empty = not loaded yet
  // or the Airtable lookup failed. Used to flag any scraper_brands.name
  // that doesn't have a matching row in the Airtable table — those
  // would silently filter to zero records at runtime.
  const [airtableNames, setAirtableNames] = useState<Set<string>>(new Set());
  const [airtableLookupError, setAirtableLookupError] = useState<string | null>(null);
  const unrestricted = value === null;
  const selected = value ?? [];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        // Load both sources in parallel so the verification is ready
        // by the time the picker renders.
        const [brandsRes, airtableRes] = await Promise.all([
          fetch("/api/brands"),
          fetch("/api/brands?action=airtable-names"),
        ]);
        const data = await brandsRes.json();
        if (!brandsRes.ok) throw new Error(data.error || "فشل تحميل العلامات");
        if (cancelled) return;
        const list = Array.isArray(data.brands) ? data.brands : [];
        setBrands(
          list.map((b: { id: string; name: string; slug: string }) => ({
            id: b.id,
            name: b.name,
            slug: b.slug,
          }))
        );

        try {
          const airtableData = await airtableRes.json();
          if (cancelled) return;
          if (airtableData?.ok && Array.isArray(airtableData.names)) {
            // Case-insensitive matching with trim so trailing-space
            // typos in Airtable don't trigger false warnings.
            setAirtableNames(
              new Set((airtableData.names as string[]).map((n) => n.trim().toLowerCase()))
            );
            setAirtableLookupError(null);
          } else {
            setAirtableLookupError(
              airtableData?.error || "تعذّر الاتصال بـ Airtable للتحقّق"
            );
          }
        } catch {
          if (!cancelled) setAirtableLookupError("تعذّر الاتصال بـ Airtable للتحقّق");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "فشل تحميل العلامات");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Names that exist in scraper_brands but NOT in Airtable Brands.
  // The writer filter would yield zero records for these, so we flag
  // them prominently.
  const mismatches = brands.filter(
    (b) => !airtableNames.has(b.name.trim().toLowerCase())
  );
  const airtableVerified = airtableNames.size > 0;

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  const selectAll = () => onChange(brands.map((b) => b.id));
  const selectNone = () => onChange([]);

  const q = search.trim().toLowerCase();
  const visible = q
    ? brands.filter((b) => b.name.toLowerCase().includes(q) || b.slug.toLowerCase().includes(q))
    : brands;

  return (
    <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-lg p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">العلامات المسموحة</p>
          <p className="text-[0.65rem] text-neutral-400 mt-0.5 leading-snug">
            الفلترة تطبَّق على عمود <code className="text-amber-300 mx-0.5 font-mono">Brand</code>
            في كلّ جدول. الكاتب يرى فقط السجلات التي قيمة العمود فيها تطابق
            اسم إحدى العلامات المختارة هنا حرفياً.
          </p>
          {airtableVerified && (
            <p className="text-[0.6rem] text-emerald-300 mt-1 font-bold">
              ✓ تمّ التحقّق من {airtableNames.size} اسم في جدول «Brands» داخل Airtable.
            </p>
          )}
          {airtableLookupError && (
            <p className="text-[0.6rem] text-amber-300 mt-1">
              ⚠ تعذّر التحقّق التلقائي من Airtable ({airtableLookupError}). تأكّد يدوياً أن أسماء العلامات تطابق ما هو في جدول «Brands».
            </p>
          )}
          {airtableVerified && mismatches.length > 0 && (
            <p className="text-[0.6rem] text-red-300 mt-1 leading-snug">
              ⚠ {mismatches.length} علامة من القائمة لا توجد في جدول «Brands» داخل Airtable
              ({mismatches.slice(0, 3).map((m) => `«${m.name}»`).join("، ")}
              {mismatches.length > 3 ? "…" : ""}). الكاتب لن يرى أيّ سجل لهذه العلامات حتى تُضاف إلى Airtable بنفس الاسم تماماً.
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={selectAll}
            disabled={loading || brands.length === 0 || unrestricted}
            className="text-[0.6rem] font-bold rounded px-2 py-1 border border-neutral-700 text-neutral-300 hover:border-emerald-400 hover:text-emerald-300 disabled:opacity-40"
          >
            تحديد الكل
          </button>
          <button
            type="button"
            onClick={selectNone}
            disabled={loading || selected.length === 0 || unrestricted}
            className="text-[0.6rem] font-bold rounded px-2 py-1 border border-neutral-700 text-neutral-300 hover:border-red-400 hover:text-red-300 disabled:opacity-40"
          >
            مسح
          </button>
        </div>
      </div>

      {/* "بلا تقييد" — explicit no-filter mode. Sends null to the API
          so the writer sees every record their table allowlist permits,
          regardless of the Brand column. Clearer than leaving the list
          empty (which means "deny everything"). */}
      <label
        className={`flex items-start gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors border mb-2 ${
          unrestricted
            ? "border-amber-400/40 bg-amber-400/5"
            : "border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/30"
        }`}
      >
        <input
          type="checkbox"
          checked={unrestricted}
          onChange={(e) => onChange(e.target.checked ? null : [])}
          className="mt-0.5 shrink-0"
        />
        <span className="flex-1 min-w-0">
          <span className="block text-[0.78rem] text-white font-bold">
            بلا تقييد · يرى كل العلامات
          </span>
          <span className="block text-[0.6rem] text-neutral-400 mt-0.5 leading-snug">
            عند التفعيل، يتجاهل الخادم فلتر العلامة تماماً ويعرض كل سجلات الجداول المسموحة لهذا المستخدم.
          </span>
        </span>
      </label>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="بحث في العلامات..."
        className="zto-input text-xs mb-2 disabled:opacity-50"
        disabled={unrestricted}
      />

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />
        </div>
      ) : error ? (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">{error}</p>
      ) : visible.length === 0 ? (
        <p className="text-center py-4 text-xs text-neutral-500 font-bold">
          {brands.length === 0 ? "لا توجد علامات بعد — أضفها من قسم «العلامات والمصادر»" : "لا نتائج للبحث"}
        </p>
      ) : (
        <div className={`max-h-56 overflow-y-auto bg-[#0d0d0d] border border-neutral-800 rounded space-y-0.5 p-1 ${unrestricted ? "opacity-50 pointer-events-none" : ""}`}>
          {visible.map((b) => {
            const checked = selected.includes(b.id);
            const verified =
              airtableVerified && airtableNames.has(b.name.trim().toLowerCase());
            const missingInAirtable = airtableVerified && !verified;
            return (
              <label
                key={b.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                  checked ? "bg-emerald-400/10 text-emerald-100" : "text-neutral-300 hover:bg-neutral-800/40"
                } ${missingInAirtable ? "ring-1 ring-red-500/30" : ""}`}
                title={
                  missingInAirtable
                    ? "هذا الاسم غير موجود في جدول «Brands» داخل Airtable — السجلات لن تُفلتر."
                    : verified
                      ? "اسم مطابق لجدول «Brands» في Airtable"
                      : ""
                }
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(b.id)}
                  className="shrink-0"
                  disabled={unrestricted}
                />
                <span className="text-xs font-bold truncate flex-1">{b.name}</span>
                {verified && (
                  <span className="text-[0.55rem] text-emerald-400 shrink-0" aria-label="مطابق">✓</span>
                )}
                {missingInAirtable && (
                  <span className="text-[0.55rem] text-red-400 shrink-0" aria-label="غير مطابق">⚠</span>
                )}
                <code className="text-[0.55rem] text-neutral-500 font-mono">{b.slug}</code>
              </label>
            );
          })}
        </div>
      )}

      <p className="text-[0.6rem] text-neutral-500 mt-2 font-bold">
        {unrestricted
          ? "بلا تقييد — كل العلامات مرئية"
          : `${selected.length} علامة مختارة من أصل ${brands.length}`}
      </p>
    </div>
  );
}

/* ─────────────── FormPreview ───────────────
   Live recap of what the new/edited user will be able to do, based on
   the current form state. Helps the admin double-check the choices
   before they hit save and accidentally over- or under-provision the
   account.
*/
function FormPreview({ form }: { form: FormState }) {
  const role = ROLE_META[form.role];
  const allow: string[] = [];
  const deny: string[] = [];

  // Build the per-section list. Order matches the sidebar so it's
  // easy to map "this card" → "the actual nav".
  if (form.role === "admin") {
    allow.push("جميع الأقسام والإعدادات والسجلات");
  } else if (form.role === "editor") {
    allow.push("قاعدة البيانات + المصادر + التحليلات + الوكلاء + مولّد الصور");
    deny.push("إدارة المستخدمين + السجلات");
  } else if (form.role === "content_writer") {
    if (form.allowedTableIds.length === 0) {
      deny.push("لا توجد جداول مخصّصة — لن يرى أيّ بيانات بعد تسجيل الدخول");
    } else {
      allow.push(`${form.allowedTableIds.length} جدول من Airtable (تحرير + قراءة، بدون حذف)`);
    }
    if (form.allowedBrandIds === null) {
      allow.push("بلا تقييد على العلامات — يرى كل السجلات في جداوله");
    } else if (form.allowedBrandIds.length === 0) {
      deny.push("لا توجد علامات مخصّصة — لن يرى أيّ سجل (الفلترة على عمود Brand)");
    } else {
      allow.push(`${form.allowedBrandIds.length} علامة — يرى فقط سجلات هذه العلامات`);
    }
    allow.push("مولّد الصور + وكلاء الكتابة");
    deny.push("المصادر + التحليلات + لوحات الفريق + إدارة المستخدمين + السجلات");
  } else {
    allow.push("قراءة جميع الجداول + التحليلات");
    deny.push("التعديل والحذف وإدارة المستخدمين");
  }

  if (form.tasksEnabled || form.role === "admin") {
    allow.push("تبويب «المهام» + جرس الإشعارات");
  } else {
    deny.push("تبويب «المهام» (مخفي)");
  }

  if (!form.isActive) {
    deny.push("تسجيل الدخول معطّل — لن يستطيع الدخول حتى التفعيل");
  }

  return (
    <div className="bg-gradient-to-br from-amber-400/[0.04] to-transparent border border-amber-400/20 rounded-lg p-3 space-y-2">
      <p className="text-[0.65rem] font-black text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5" />
        ما الذي سيراه هذا المستخدم؟
      </p>
      <p className="text-[0.65rem] text-neutral-400 leading-snug">
        دور <span className={`font-bold ${role.color}`}>{role.label}</span>
        {form.name ? <> — <span className="text-neutral-200 font-bold">{form.name}</span></> : null}
      </p>
      <ul className="space-y-1">
        {allow.map((line, i) => (
          <li key={`a-${i}`} className="flex items-start gap-1.5 text-[0.65rem] text-emerald-300">
            <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5" />
            <span className="leading-snug">{line}</span>
          </li>
        ))}
        {deny.map((line, i) => (
          <li key={`d-${i}`} className="flex items-start gap-1.5 text-[0.65rem] text-neutral-500">
            <XCircle className="w-3 h-3 shrink-0 mt-0.5" />
            <span className="leading-snug">{line}</span>
          </li>
        ))}
      </ul>
      {!form.id && (
        <p className="text-[0.6rem] text-neutral-500 leading-snug pt-1 border-t border-neutral-800/60 mt-2 flex items-start gap-1.5">
          <ListChecks className="w-3 h-3 shrink-0 mt-0.5 text-amber-400" />
          <span>
            بعد الحفظ: شارك مع المستخدم اسم المستخدم وكلمة المرور بقناة آمنة. يستطيع الدخول فوراً من الصفحة الرئيسية للموقع.
          </span>
        </p>
      )}
    </div>
  );
}
