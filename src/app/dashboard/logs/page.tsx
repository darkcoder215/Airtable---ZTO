"use client";

import { useState, useEffect, useMemo } from "react";
import { useAppStore } from "@/store/app-store";
import PageGuide from "@/components/PageGuide";
import {
  ScrollText,
  RefreshCw,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Info,
  Bug,
  Lock,
  Activity,
  UserCog,
  ChevronDown,
  Search,
  User as UserIcon,
} from "lucide-react";

interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  context?: string;
  details?: unknown;
  userId?: string;
}

interface DirectoryUser {
  id: string;
  name: string;
  role: string;
  email: string;
}

const LEVEL_CONFIG = {
  info: { icon: Info, badge: "zto-badge zto-badge-info", label: "معلومات", textColor: "text-blue-400" },
  warn: { icon: AlertTriangle, badge: "zto-badge zto-badge-warn", label: "تحذير", textColor: "text-amber-400" },
  error: { icon: AlertCircle, badge: "zto-badge zto-badge-err", label: "خطأ", textColor: "text-red-400" },
  debug: { icon: Bug, badge: "zto-badge zto-badge-default", label: "تصحيح", textColor: "text-neutral-400" },
};

type Tab = "system" | "actions";

export default function LogsPage() {
  const { user, addToast } = useAppStore();
  const [tab, setTab] = useState<Tab>("system");

  // Two independent log buffers so switching tabs doesn't refetch the other.
  const [systemLogs, setSystemLogs] = useState<LogEntry[]>([]);
  const [actionLogs, setActionLogs] = useState<LogEntry[]>([]);
  const [directory, setDirectory] = useState<Record<string, DirectoryUser>>({});

  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState<string>("");
  const [filterUserId, setFilterUserId] = useState<string>(""); // for actions tab
  const [search, setSearch] = useState("");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    try {
      if (tab === "system") {
        const params = new URLSearchParams({ limit: "300" });
        if (filterLevel) params.set("level", filterLevel);
        const res = await fetch(`/api/logs?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "فشل التحميل");
        setSystemLogs(data.logs ?? []);
      } else {
        const params = new URLSearchParams({ limit: "500", actions: "1" });
        if (filterLevel) params.set("level", filterLevel);
        if (filterUserId) params.set("userId", filterUserId);
        const res = await fetch(`/api/logs?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "فشل التحميل");
        setActionLogs(data.logs ?? []);
        // Cache the directory keyed by id for fast lookups.
        if (Array.isArray(data.users)) {
          const map: Record<string, DirectoryUser> = {};
          for (const u of data.users as DirectoryUser[]) map[u.id] = u;
          setDirectory(map);
        }
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : "فشل تحميل السجلات", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLogs();
    setExpandedIdx(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filterLevel, filterUserId]);

  // ── System tab: client-side text search ────────────────────────────────
  const filteredSystemLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return systemLogs;
    return systemLogs.filter((l) =>
      l.message.toLowerCase().includes(q) ||
      (l.context?.toLowerCase().includes(q) ?? false)
    );
  }, [systemLogs, search]);

  // ── Actions tab: text search + per-user grouping for the sidebar ──────
  const filteredActionLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return actionLogs;
    return actionLogs.filter((l) =>
      l.message.toLowerCase().includes(q) ||
      (l.context?.toLowerCase().includes(q) ?? false) ||
      (directory[l.userId ?? ""]?.name?.toLowerCase().includes(q) ?? false)
    );
  }, [actionLogs, search, directory]);

  // Per-user activity counts driving the actions sidebar.
  const userActivityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of actionLogs) {
      if (!l.userId) continue;
      counts.set(l.userId, (counts.get(l.userId) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([id, count]) => ({ id, count, user: directory[id] }))
      .sort((a, b) => b.count - a.count);
  }, [actionLogs, directory]);

  if (user?.role !== "admin") {
    return (
      <div className="zto-card p-16 text-center" dir="rtl">
        <Lock className="w-10 h-10 text-neutral-600 mx-auto mb-3" />
        <p className="text-neutral-400 text-sm font-bold">
          هذه الصفحة متاحة للمديرين فقط
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-neutral-400 text-sm">متابعة جميع العمليات والأحداث</p>
        <div className="flex items-center gap-2">
          <div className="zto-select-wrap">
            <select
              className="zto-input w-40 text-xs"
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
            >
              <option value="">جميع المستويات</option>
              <option value="info">معلومات</option>
              <option value="warn">تحذيرات</option>
              <option value="error">أخطاء</option>
              <option value="debug">تصحيح</option>
            </select>
          </div>
          <button
            onClick={() => void loadLogs()}
            disabled={loading}
            className="zto-btn zto-btn-outline zto-btn-sm text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 p-1 bg-[#1a1a1a] border border-neutral-800 rounded-xl w-fit">
        <button
          onClick={() => setTab("system")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
            tab === "system" ? "bg-white text-black shadow" : "text-neutral-400 hover:text-white"
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          أحداث النظام
          {systemLogs.length > 0 && (
            <span className={`text-[0.55rem] rounded px-1.5 ${
              tab === "system" ? "bg-black/10" : "bg-neutral-800 text-neutral-300"
            }`}>
              {systemLogs.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("actions")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
            tab === "actions" ? "bg-white text-black shadow" : "text-neutral-400 hover:text-white"
          }`}
        >
          <UserCog className="w-3.5 h-3.5" />
          إجراءات المستخدمين
          {actionLogs.length > 0 && (
            <span className={`text-[0.55rem] rounded px-1.5 ${
              tab === "actions" ? "bg-black/10" : "bg-neutral-800 text-neutral-300"
            }`}>
              {actionLogs.length}
            </span>
          )}
        </button>
      </div>

      <PageGuide
        pageName="السجلّات"
        accent="blue"
        storageKey="logs"
        intro={
          <>
            تبويبان:
            <span className="text-blue-300 mx-1 font-bold">أحداث النظام</span>
            (كل عملية جلب/فلترة/حفظ يقوم بها النظام نفسه) و
            <span className="text-blue-300 mx-1 font-bold">إجراءات المستخدمين</span>
            (سجل تدقيق لكل ما يفعله المديرون والمحرّرون: إضافة، تعديل، حذف...).
          </>
        }
        tips={[
          { title: "الفلترة بالمستوى", body: <>القائمة العلوية تنتقي السجلّات بحسب الأهمّية: <span className="text-amber-300">معلومات</span> · <span className="text-amber-300">تحذيرات</span> · <span className="text-red-300">أخطاء</span>.</> },
          { title: "تبويب «أحداث النظام»", body: <>كل دورة جلب تكتب 5–6 أسطر بترتيب: <code className="text-amber-400 font-mono">FETCH → DEDUP → PERSIST → FILTER → AIRTABLE → DONE</code>. تتبّع المصدر باسمه لمشاهدة دورة كاملة.</> },
          { title: "تبويب «إجراءات المستخدمين»", body: <>سجلّ تدقيق: من فعل ماذا ومتى. الشريط الجانبي يصنّف الأحداث بحسب المستخدم؛ ابحث في رسائل الأحداث أو أسماء المستخدمين.</> },
          { title: "تتبّع حدث معيّن", body: <>اضغط أيّ سطر لعرض البيانات الكاملة (JSON) — معرّف المصدر، عدد العناصر، الأخطاء الخام إلخ.</> },
        ]}
      />

      {/* Search */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === "system" ? "بحث في رسائل النظام والسياق..." : "بحث في الإجراءات أو أسماء المستخدمين..."}
          className="zto-input text-xs"
          style={{ paddingInlineStart: "2.5rem" }}
        />
      </div>

      {/* Content */}
      {tab === "system" ? (
        <SystemLogsList logs={filteredSystemLogs} loading={loading} expandedIdx={expandedIdx} setExpandedIdx={setExpandedIdx} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          {/* Per-user sidebar */}
          <div className="zto-card p-3 space-y-1 lg:max-h-[calc(100vh-340px)] lg:overflow-y-auto">
            <button
              onClick={() => setFilterUserId("")}
              className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-right transition-colors ${
                !filterUserId
                  ? "bg-amber-400/10 border border-amber-400/30 text-amber-200"
                  : "border border-transparent text-neutral-400 hover:bg-neutral-800/40"
              }`}
            >
              <span className="text-xs font-bold flex items-center gap-2">
                <UserCog className="w-3.5 h-3.5" />
                كل المستخدمين
              </span>
              <span className="text-[0.6rem] text-neutral-500 tabular-nums">{actionLogs.length}</span>
            </button>
            <div className="border-t border-neutral-800 my-2" />
            {userActivityCounts.length === 0 ? (
              <p className="text-[0.65rem] text-neutral-500 text-center py-6">
                لا إجراءات مسجّلة
              </p>
            ) : (
              userActivityCounts.map((row) => {
                const isActive = filterUserId === row.id;
                const display = row.user?.name || row.user?.email || row.id.slice(0, 8);
                return (
                  <button
                    key={row.id}
                    onClick={() => setFilterUserId(isActive ? "" : row.id)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-right transition-colors ${
                      isActive
                        ? "bg-blue-400/10 border border-blue-400/30 text-blue-200"
                        : "border border-transparent text-neutral-300 hover:bg-neutral-800/40"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate flex items-center gap-1.5">
                        <UserIcon className="w-3 h-3 text-neutral-500 shrink-0" />
                        {display}
                      </p>
                      {row.user?.role && (
                        <p className="text-[0.55rem] text-neutral-500 mt-0.5 truncate">
                          {row.user.role === "admin" ? "مدير" : row.user.role === "editor" ? "محرّر" : "مشاهد"}
                          {row.user.email && ` · ${row.user.email}`}
                        </p>
                      )}
                    </div>
                    <span className={`text-[0.6rem] tabular-nums shrink-0 ${
                      isActive ? "text-blue-300" : "text-neutral-500"
                    }`}>
                      {row.count}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Action logs list */}
          <ActionLogsList
            logs={filteredActionLogs}
            loading={loading}
            directory={directory}
            expandedIdx={expandedIdx}
            setExpandedIdx={setExpandedIdx}
          />
        </div>
      )}
    </div>
  );
}

/* ───────── System logs list ───────── */

function SystemLogsList({
  logs,
  loading,
  expandedIdx,
  setExpandedIdx,
}: {
  logs: LogEntry[];
  loading: boolean;
  expandedIdx: number | null;
  setExpandedIdx: (i: number | null) => void;
}) {
  if (loading && logs.length === 0) {
    return (
      <div className="zto-card p-16 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
      </div>
    );
  }
  if (logs.length === 0) {
    return (
      <div className="zto-card p-16 text-center">
        <ScrollText className="w-10 h-10 text-neutral-600 mx-auto mb-3" />
        <p className="text-neutral-400 text-sm font-bold">لا توجد سجلات</p>
      </div>
    );
  }
  return (
    <div className="zto-card overflow-hidden">
      <div className="divide-y divide-neutral-800">
        {logs.map((log, idx) => (
          <LogRow
            key={idx}
            log={log}
            expanded={expandedIdx === idx}
            onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
          />
        ))}
      </div>
    </div>
  );
}

/* ───────── Action logs list ───────── */

function ActionLogsList({
  logs,
  loading,
  directory,
  expandedIdx,
  setExpandedIdx,
}: {
  logs: LogEntry[];
  loading: boolean;
  directory: Record<string, DirectoryUser>;
  expandedIdx: number | null;
  setExpandedIdx: (i: number | null) => void;
}) {
  if (loading && logs.length === 0) {
    return (
      <div className="zto-card p-16 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
      </div>
    );
  }
  if (logs.length === 0) {
    return (
      <div className="zto-card p-16 text-center">
        <UserCog className="w-10 h-10 text-neutral-600 mx-auto mb-3" />
        <p className="text-neutral-400 text-sm font-bold">لا إجراءات مطابقة</p>
        <p className="text-neutral-600 text-xs mt-1">
          إجراءات المستخدمين (مثل إنشاء مصدر أو تعديل وكيل) ستظهر هنا تلقائياً.
        </p>
      </div>
    );
  }

  // Group by date so the audit log is easier to scan day-by-day.
  const groups = new Map<string, LogEntry[]>();
  for (const l of logs) {
    const day = new Date(l.timestamp).toLocaleDateString("ar-SA", {
      year: "numeric", month: "long", day: "numeric",
    });
    const arr = groups.get(day) ?? [];
    arr.push(l);
    groups.set(day, arr);
  }

  // Stable global index across groups for the expand toggle.
  let globalIdx = 0;
  return (
    <div className="space-y-4">
      {Array.from(groups.entries()).map(([day, list]) => (
        <div key={day} className="zto-card overflow-hidden">
          <div className="px-4 py-2 border-b border-neutral-800 bg-[#0e0e0e]">
            <p className="text-[0.65rem] text-neutral-400 font-bold flex items-center gap-2">
              <span className="w-1 h-3 bg-blue-400/60 rounded-full" />
              {day}
              <span className="text-neutral-600">· {list.length} إجراء</span>
            </p>
          </div>
          <div className="divide-y divide-neutral-800">
            {list.map((log) => {
              const me = globalIdx++;
              const userName = log.userId
                ? (directory[log.userId]?.name || directory[log.userId]?.email || log.userId.slice(0, 8))
                : "النظام";
              return (
                <LogRow
                  key={me}
                  log={log}
                  expanded={expandedIdx === me}
                  onToggle={() => setExpandedIdx(expandedIdx === me ? null : me)}
                  byline={userName}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────── Single log row ───────── */

function LogRow({
  log,
  expanded,
  onToggle,
  byline,
}: {
  log: LogEntry;
  expanded: boolean;
  onToggle: () => void;
  byline?: string;
}) {
  const config = LEVEL_CONFIG[log.level];
  const Icon = config.icon;
  const rowBg =
    log.level === "error"
      ? "bg-red-500/5"
      : log.level === "warn"
        ? "bg-amber-500/5"
        : "";
  const hasDetails = log.details != null && (typeof log.details !== "object" || Object.keys(log.details as object).length > 0);

  return (
    <div className={`px-5 py-3 ${rowBg}`}>
      <button onClick={onToggle} className="w-full flex items-start gap-3 text-right hover:opacity-90 transition-opacity">
        <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 mt-0.5 ${config.textColor}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={config.badge}>{config.label}</span>
            {log.context && <span className="zto-badge zto-badge-info">{log.context}</span>}
            {byline && (
              <span className="text-[0.6rem] text-blue-300 font-bold flex items-center gap-1">
                <UserIcon className="w-2.5 h-2.5" />
                {byline}
              </span>
            )}
            <span className="text-[0.6rem] text-neutral-500 font-mono">
              {new Date(log.timestamp).toLocaleString("ar-SA")}
            </span>
            {hasDetails && (
              <ChevronDown
                className={`w-3 h-3 text-neutral-500 mr-auto transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            )}
          </div>
          <p className="text-sm text-neutral-200 mt-1 font-medium break-words">{log.message}</p>
          {expanded && hasDetails && (
            <pre className="text-[0.65rem] text-neutral-300 mt-2 bg-neutral-950 border border-neutral-800 rounded p-3 overflow-x-auto max-w-full font-mono leading-relaxed">
              <code>
                {typeof log.details === "string"
                  ? log.details
                  : (JSON.stringify(log.details, null, 2) as string)}
              </code>
            </pre>
          )}
        </div>
      </button>
    </div>
  );
}
