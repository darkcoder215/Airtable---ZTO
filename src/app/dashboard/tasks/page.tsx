"use client";

// Tasks tab. Two distinct UX modes inside the same page:
//   • assignee — sees their own queue, can mark in_progress / done /
//     ack-read. Auto-fires a "mark all read" when the page mounts so
//     the bell badge clears the moment they open it.
//   • admin — sees ALL tasks in the org, can create new ones for any
//     active user, edit any field, cancel/delete.
// We keep both flows in one file to avoid duplicating the table /
// filters / status pills.

import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/app-store";
import PageGuide from "@/components/PageGuide";
import {
  Plus,
  X,
  Loader2,
  Filter,
  Search,
  CheckCircle2,
  Clock,
  CircleDashed,
  XCircle,
  Trash2,
  Pencil,
  Flag,
  Calendar,
  User as UserIcon,
} from "lucide-react";

type TaskStatus = "pending" | "in_progress" | "done" | "cancelled";
type TaskPriority = "low" | "normal" | "high" | "urgent";

interface AppTask {
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
  assignedToName?: string;
  assignedByName?: string | null;
}

interface PublicUser {
  id: string;
  username: string;
  name: string;
  role: "admin" | "editor" | "content_writer" | "viewer";
  isActive: boolean;
  tasksEnabled: boolean;
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "قيد الانتظار",
  in_progress: "قيد التنفيذ",
  done: "مكتملة",
  cancelled: "ملغاة",
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "منخفضة",
  normal: "عادية",
  high: "عالية",
  urgent: "عاجلة",
};

const PRIORITY_TONE: Record<TaskPriority, string> = {
  low: "border-neutral-700 text-neutral-400",
  normal: "border-blue-500/40 text-blue-300 bg-blue-500/10",
  high: "border-amber-500/40 text-amber-300 bg-amber-500/10",
  urgent: "border-red-500/40 text-red-300 bg-red-500/10",
};

const STATUS_TONE: Record<TaskStatus, string> = {
  pending: "border-neutral-700 text-neutral-300 bg-neutral-800/40",
  in_progress: "border-blue-500/40 text-blue-300 bg-blue-500/10",
  done: "border-emerald-500/40 text-emerald-300 bg-emerald-500/10",
  cancelled: "border-red-500/40 text-red-400 bg-red-500/5",
};

const STATUS_ICON: Record<TaskStatus, typeof CircleDashed> = {
  pending: CircleDashed,
  in_progress: Clock,
  done: CheckCircle2,
  cancelled: XCircle,
};

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("ar-EG", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

function fmtDay(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("ar-EG", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

function isOverdue(t: AppTask): boolean {
  if (!t.dueAt || t.status === "done" || t.status === "cancelled") return false;
  return Date.parse(t.dueAt) < Date.now();
}

interface CreateForm {
  id: string | null;
  assignedTo: string;
  title: string;
  description: string;
  priority: TaskPriority;
  dueAt: string; // datetime-local string
  status: TaskStatus;
}

function blankForm(): CreateForm {
  return {
    id: null,
    assignedTo: "",
    title: "",
    description: "",
    priority: "normal",
    dueAt: "",
    status: "pending",
  };
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

export default function TasksPage() {
  const { user, addToast } = useAppStore();
  const isAdmin = user?.role === "admin";

  const [tasks, setTasks] = useState<AppTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | TaskStatus>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>("all");
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateForm>(blankForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const url = isAdmin ? "/api/tasks?action=all" : "/api/tasks";
      const res = await fetch(url, { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "فشل التحميل");
      setTasks(d.tasks ?? []);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "فشل التحميل", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) return;
      setUsers((d.users ?? []) as PublicUser[]);
    } catch {
      // non-fatal — admin can retry by reopening the form
    }
  };

  // Auto-mark-read on mount for assignees so the bell badge clears.
  const markAllRead = async () => {
    if (isAdmin) return;
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark-read", all: true }),
      });
    } catch {
      // best-effort
    }
  };

  useEffect(() => {
    if (!user) return;
    void load();
    void loadUsers();
    void markAllRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (q) {
        const hay = `${t.title} ${t.description ?? ""} ${t.assignedToName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, statusFilter, priorityFilter, search]);

  const counts = useMemo(() => {
    const c = { all: tasks.length, pending: 0, in_progress: 0, done: 0, cancelled: 0 };
    for (const t of tasks) c[t.status] += 1;
    return c;
  }, [tasks]);

  const startCreate = () => {
    setForm(blankForm());
    setFormError(null);
    setShowForm(true);
  };
  const startEdit = (t: AppTask) => {
    setForm({
      id: t.id,
      assignedTo: t.assignedTo,
      title: t.title,
      description: t.description ?? "",
      priority: t.priority,
      dueAt: toLocalInput(t.dueAt),
      status: t.status,
    });
    setFormError(null);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setForm(blankForm());
    setFormError(null);
  };

  const submit = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const dueIso = form.dueAt ? new Date(form.dueAt).toISOString() : null;
      const payload: Record<string, unknown> = form.id
        ? {
            action: "update",
            id: form.id,
            title: form.title,
            description: form.description,
            priority: form.priority,
            dueAt: dueIso,
            assignedTo: form.assignedTo,
            status: form.status,
          }
        : {
            action: "create",
            assignedTo: form.assignedTo,
            title: form.title,
            description: form.description,
            priority: form.priority,
            dueAt: dueIso,
          };
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "فشل الحفظ");
      addToast(form.id ? "تم تحديث المهمّة" : "تم إنشاء المهمّة", "success");
      closeForm();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (t: AppTask, status: TaskStatus) => {
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: t.id, status }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "تعذّر التحديث");
      setTasks((prev) => prev.map((x) => (x.id === t.id ? (d.task as AppTask) : x)));
      addToast("تم تحديث الحالة", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "تعذّر التحديث", "error");
    }
  };

  const removeTask = async (t: AppTask) => {
    if (!confirm(`حذف المهمّة "${t.title}"؟ لا يمكن التراجع.`)) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: t.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "تعذّر الحذف");
      setTasks((prev) => prev.filter((x) => x.id !== t.id));
      addToast("تم حذف المهمّة", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "تعذّر الحذف", "error");
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-5 h-5 animate-spin text-neutral-500" />
      </div>
    );
  }

  // Anyone the layout let through to this page is either admin or has
  // tasksEnabled. We still defend in depth in case tasksEnabled is false
  // and the layout was bypassed somehow.
  if (!isAdmin && user.tasksEnabled !== true) {
    return (
      <div className="zto-card p-12 text-center max-w-md mx-auto" dir="rtl">
        <p className="text-sm text-neutral-400">تبويب المهام غير مفعّل لحسابك.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-white">المهام</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {isAdmin
              ? "إدارة جميع المهام المسندة لأعضاء الفريق."
              : "المهام المسندة إليك من قبل الإدارة."}
          </p>
        </div>
        {isAdmin && (
          <button onClick={startCreate} className="zto-btn zto-btn-primary">
            <Plus className="w-4 h-4" />
            مهمّة جديدة
          </button>
        )}
      </div>

      <PageGuide
        pageName="المهام"
        accent="amber"
        defaultOpen={!isAdmin}
        storageKey="tasks"
        intro={
          isAdmin ? (
            <>
              من هنا تُسند المهام لأعضاء الفريق وتتابع تقدّمها.
              كل مهمّة تظهر فوراً لدى صاحبها مع تنبيه بجرس الإشعارات في الأعلى.
              تستطيع التعديل، التمرير بين الحالات، أو الحذف في أيّ وقت.
            </>
          ) : (
            <>
              هذه قائمة المهام المسندة إليك من فريق الإدارة.
              المهام الجديدة تظهر بإطار ذهبي ونقطة لامعة حتى تفتحها — فور دخولك هذه الصفحة يختفي عدّاد الجرس تلقائياً.
              استخدم زرّي «بدء» و«إنهاء» لتحديث حالة عملك حتى تكون الإدارة على اطّلاع مباشر.
            </>
          )
        }
        tips={
          isAdmin
            ? [
                {
                  title: "إنشاء مهمّة جديدة",
                  body: <>اضغط <span className="text-amber-300 font-bold">«مهمّة جديدة»</span> في الأعلى، اختر المسؤول، اكتب عنواناً وصفاً، وحدّد الأولوية وتاريخ الاستحقاق إن وُجد.</>,
                },
                {
                  title: "أولويات واضحة",
                  body: <>«عاجلة» تُلوَّن بالأحمر، «عالية» بالكهرماني، «عادية» بالأزرق، «منخفضة» بالرمادي — اختر اللون الذي يعكس الواقع لتجنّب إرهاق فريقك.</>,
                },
                {
                  title: "تتبّع التقدّم",
                  body: <>الشرائط الخمسة في الأعلى تعمل كفلاتر أيضاً. اضغط أيّ شريط لرؤية المهام في تلك الحالة فقط.</>,
                },
                {
                  title: "التعديل والإلغاء",
                  body: <>أيقونة القلم تفتح كل الحقول. الإلغاء هو حالة «ملغاة» — لا حذف نهائياً إلّا بأيقونة سلّة المهملات.</>,
                },
              ]
            : [
                {
                  title: "ابدأ تنفيذ مهمّة",
                  body: <>اضغط <span className="text-amber-300 font-bold">«بدء»</span> لتحويل الحالة إلى «قيد التنفيذ» — تظهر الإدارة فوراً أنّك بدأت العمل.</>,
                },
                {
                  title: "علِّم كمكتملة",
                  body: <>عندما تنتهي اضغط <span className="text-emerald-300 font-bold">«إنهاء»</span>. ستُحفظ ساعة الإنجاز وسيختفي الإطار الذهبي.</>,
                },
                {
                  title: "ركّز بالفلاتر",
                  body: <>استخدم شريط الإحصاءات للتركيز على «قيد التنفيذ» مثلاً، أو خانة البحث لإيجاد مهمّة بعينها بسرعة.</>,
                },
                {
                  title: "الأولويات والاستحقاق",
                  body: <>إذا فات تاريخ الاستحقاق، تظهر شارة <span className="text-red-300 font-bold">«متأخّرة»</span> حمراء. ابدأ بها أولاً.</>,
                },
              ]
        }
      />

      {/* Stat strip — quick counts by status */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="الإجمالي" count={counts.all} active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
        <StatCard label="قيد الانتظار" count={counts.pending} tone="neutral" active={statusFilter === "pending"} onClick={() => setStatusFilter("pending")} />
        <StatCard label="قيد التنفيذ" count={counts.in_progress} tone="blue" active={statusFilter === "in_progress"} onClick={() => setStatusFilter("in_progress")} />
        <StatCard label="مكتملة" count={counts.done} tone="emerald" active={statusFilter === "done"} onClick={() => setStatusFilter("done")} />
        <StatCard label="ملغاة" count={counts.cancelled} tone="red" active={statusFilter === "cancelled"} onClick={() => setStatusFilter("cancelled")} />
      </div>

      {/* Filters */}
      <div className="zto-card p-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute top-1/2 -translate-y-1/2" style={{ insetInlineStart: "0.75rem" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث في العنوان أو الوصف…"
            className="zto-input text-xs"
            style={{ paddingInlineStart: "2.5rem" }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-neutral-500" />
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as "all" | TaskPriority)}
            className="zto-select text-xs"
          >
            <option value="all">كل الأولويات</option>
            <option value="urgent">عاجلة</option>
            <option value="high">عالية</option>
            <option value="normal">عادية</option>
            <option value="low">منخفضة</option>
          </select>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="zto-card p-12 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-neutral-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="zto-card p-12 text-center text-sm text-neutral-500">
          {tasks.length === 0
            ? isAdmin
              ? "لا توجد مهام بعد. ابدأ بإنشاء أول مهمّة."
              : "لا توجد مهام مسندة إليك حالياً."
            : "لا توجد نتائج مطابقة للفلاتر الحالية."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              isAdmin={isAdmin}
              isMine={t.assignedTo === user.id}
              onSetStatus={(s) => setStatus(t, s)}
              onEdit={() => startEdit(t)}
              onDelete={() => removeTask(t)}
            />
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={closeForm}>
          <div
            className="zto-card w-full max-w-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-center justify-between p-4 border-b border-neutral-800">
              <h2 className="text-lg font-black text-white">
                {form.id ? "تعديل المهمّة" : "مهمّة جديدة"}
              </h2>
              <button onClick={closeForm} className="text-neutral-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {formError && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md p-2">
                  {formError}
                </div>
              )}
              <div>
                <label className="block text-[0.65rem] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                  المسؤول
                </label>
                <select
                  value={form.assignedTo}
                  onChange={(e) => setForm((p) => ({ ...p, assignedTo: e.target.value }))}
                  className="zto-select"
                >
                  <option value="">— اختر مستخدماً —</option>
                  {users
                    .filter((u) => u.isActive)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.username})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-[0.65rem] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                  العنوان
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  className="zto-input"
                  maxLength={240}
                  placeholder="مثال: مراجعة مقالات قسم التكنولوجيا"
                />
              </div>
              <div>
                <label className="block text-[0.65rem] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                  الوصف
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  className="zto-input min-h-[120px]"
                  rows={5}
                  maxLength={6000}
                  placeholder="تفاصيل إضافية، روابط، معايير القبول…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[0.65rem] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                    الأولوية
                  </label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as TaskPriority }))}
                    className="zto-select"
                  >
                    <option value="low">منخفضة</option>
                    <option value="normal">عادية</option>
                    <option value="high">عالية</option>
                    <option value="urgent">عاجلة</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[0.65rem] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                    تاريخ الاستحقاق
                  </label>
                  <input
                    type="datetime-local"
                    value={form.dueAt}
                    onChange={(e) => setForm((p) => ({ ...p, dueAt: e.target.value }))}
                    className="zto-input"
                  />
                </div>
              </div>
              {form.id && (
                <div>
                  <label className="block text-[0.65rem] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                    الحالة
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as TaskStatus }))}
                    className="zto-select"
                  >
                    <option value="pending">قيد الانتظار</option>
                    <option value="in_progress">قيد التنفيذ</option>
                    <option value="done">مكتملة</option>
                    <option value="cancelled">ملغاة</option>
                  </select>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 p-4 border-t border-neutral-800">
              <button onClick={closeForm} className="zto-btn zto-btn-ghost" disabled={saving}>
                إلغاء
              </button>
              <button onClick={submit} className="zto-btn zto-btn-primary" disabled={saving || !form.title.trim() || !form.assignedTo}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : form.id ? "حفظ" : "إنشاء"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  count,
  tone = "neutral",
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone?: "neutral" | "blue" | "emerald" | "red";
  active?: boolean;
  onClick?: () => void;
}) {
  const toneCls =
    tone === "blue"
      ? "text-blue-300"
      : tone === "emerald"
        ? "text-emerald-300"
        : tone === "red"
          ? "text-red-300"
          : "text-white";
  return (
    <button
      onClick={onClick}
      className={`zto-card p-3 text-right transition-all ${active ? "border-amber-400/60 bg-amber-400/5" : "hover:border-neutral-700"}`}
    >
      <div className="text-[0.65rem] font-bold text-neutral-500 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-black mt-1 ${toneCls}`}>{count}</div>
    </button>
  );
}

function TaskCard({
  task,
  isAdmin,
  isMine,
  onSetStatus,
  onEdit,
  onDelete,
}: {
  task: AppTask;
  isAdmin: boolean;
  isMine: boolean;
  onSetStatus: (s: TaskStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const StatusIcon = STATUS_ICON[task.status];
  const overdue = isOverdue(task);
  const isUnread = isMine && task.readAt == null;
  const canEditStatus = isAdmin || isMine;
  return (
    <div
      className={`zto-card p-4 transition-colors ${
        isUnread ? "border-amber-400/40 bg-amber-400/[0.03]" : ""
      }`}
    >
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2 flex-wrap">
            {isUnread && (
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="جديد — لم تقرأ بعد" />
            )}
            <h3 className="text-base font-black text-white">{task.title}</h3>
            <span
              className={`zto-badge text-[0.6rem] font-black border ${STATUS_TONE[task.status]}`}
            >
              <StatusIcon className="w-3 h-3" />
              {STATUS_LABEL[task.status]}
            </span>
            <span
              className={`zto-badge text-[0.6rem] font-black border ${PRIORITY_TONE[task.priority]}`}
            >
              <Flag className="w-3 h-3" />
              {PRIORITY_LABEL[task.priority]}
            </span>
            {overdue && (
              <span className="zto-badge text-[0.6rem] font-black border border-red-500/40 text-red-300 bg-red-500/10">
                متأخّرة
              </span>
            )}
          </div>
          {task.description && (
            <p className="text-xs text-neutral-400 mt-2 whitespace-pre-wrap leading-relaxed">
              {task.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-3 flex-wrap text-[0.65rem] text-neutral-500">
            {isAdmin && task.assignedToName && (
              <span className="inline-flex items-center gap-1">
                <UserIcon className="w-3 h-3" />
                {task.assignedToName}
              </span>
            )}
            {task.assignedByName && (
              <span className="inline-flex items-center gap-1">
                من: <span className="text-neutral-400 font-bold">{task.assignedByName}</span>
              </span>
            )}
            {task.dueAt && (
              <span className={`inline-flex items-center gap-1 ${overdue ? "text-red-400" : ""}`}>
                <Calendar className="w-3 h-3" />
                استحقاق: {fmtDay(task.dueAt)}
              </span>
            )}
            <span>أنشئت: {fmtDate(task.createdAt)}</span>
            {task.completedAt && <span>اكتملت: {fmtDate(task.completedAt)}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canEditStatus && task.status !== "done" && task.status !== "cancelled" && (
            <>
              {task.status === "pending" && (
                <button
                  onClick={() => onSetStatus("in_progress")}
                  className="zto-btn zto-btn-outline zto-btn-sm"
                  title="بدء التنفيذ"
                >
                  <Clock className="w-3.5 h-3.5" />
                  بدء
                </button>
              )}
              <button
                onClick={() => onSetStatus("done")}
                className="zto-btn zto-btn-primary zto-btn-sm"
                title="تعليم كمكتملة"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                إنهاء
              </button>
            </>
          )}
          {canEditStatus && (task.status === "done" || task.status === "cancelled") && (
            <button
              onClick={() => onSetStatus("pending")}
              className="zto-btn zto-btn-ghost zto-btn-sm"
              title="إعادة فتح"
            >
              إعادة فتح
            </button>
          )}
          {isAdmin && (
            <>
              <button
                onClick={onEdit}
                className="zto-btn zto-btn-ghost zto-btn-sm"
                title="تعديل"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onDelete}
                className="zto-btn zto-btn-ghost zto-btn-sm text-red-400 hover:!text-red-400"
                title="حذف"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
