"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Users,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Inbox,
  Search,
  User,
  Mail,
  Briefcase,
  TrendingUp,
  Zap,
  ChevronRight,
  Layers,
  ListTodo,
  Settings,
  Download,
  X,
  RotateCcw,
  Eye,
  EyeOff,
  ArrowUpDown,
} from "lucide-react";
import { useAppStore } from "@/store/app-store";
import PageGuide from "@/components/PageGuide";

/* ───────── Types (mirror /api/dashboards response) ───────── */

interface TeamMember {
  id: string;
  name: string;
  role?: string;
  email?: string;
  avatarUrl?: string;
  department?: string;
  managerId?: string;
}
interface BucketCounts {
  total: number;
  done: number;
  inProgress: number;
  overdue: number;
  dueSoon: number;
}
interface UpcomingItem {
  recordId: string;
  title: string;
  table: string;
  status?: string;
  dueAt?: string;
}
interface PerMemberSummary {
  member: TeamMember;
  totals: BucketCounts;
  perTable: Array<{
    tableId: string;
    tableName: string;
    counts: BucketCounts;
    statusBreakdown: Array<{ label: string; count: number }>;
  }>;
  upcoming: UpcomingItem[];
  overdue: UpcomingItem[];
}
interface Diagnostics {
  teamTable: { id: string; name: string } | null;
  linkedTables: Array<{
    id: string;
    name: string;
    linkField: string;
    linkKind?: "recordLink" | "collaborator" | "textName";
    statusField: string | null;
    dueField: string | null;
  }>;
  warnings: string[];
  availableTables?: Array<{ id: string; name: string }>;
}

/* ───────── Helpers ───────── */

function relativeDate(iso?: string): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const diff = t - Date.now();
  const past = diff < 0;
  const days = Math.round(Math.abs(diff) / 86_400_000);
  if (days === 0) return past ? "اليوم" : "اليوم";
  if (days === 1) return past ? "البارحة" : "غداً";
  if (days < 7) return past ? `قبل ${days} أيام` : `خلال ${days} أيام`;
  if (days < 30) {
    const w = Math.round(days / 7);
    return past ? `قبل ${w} أسبوع` : `خلال ${w} أسبوع`;
  }
  return new Date(t).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.round((n / d) * 100);
}

/* ───────── User preferences ─────────
   Everything here is persisted to localStorage under a single key, so admins'
   customisations survive reloads and don't need a server round-trip. The API
   returns enough per-task detail (dueAt, table, status) that the heavy work
   — sorting, filtering, bucketing — can all happen client-side. */

type RosterSort = "name" | "total" | "overdue" | "completion" | "dueSoon";
type SortDir = "asc" | "desc";
type GroupBy = "department" | "role" | "manager" | "none";
type Density = "compact" | "comfortable";
type SoonWindow = 3 | 7 | 14 | 30;

interface ViewPrefs {
  rosterSort: RosterSort;
  sortDir: SortDir;
  groupBy: GroupBy;
  density: Density;
  hideEmpty: boolean;
  soonWindow: SoonWindow;
  showStatTiles: boolean;
  showPerTable: boolean;
  showUpcoming: boolean;
  showOverdue: boolean;
  showProfileMeta: boolean;
  showCompletionRing: boolean;
  // Empty array == include every detected table.
  tableAllowList: string[];
}

const DEFAULT_PREFS: ViewPrefs = {
  rosterSort: "overdue",
  sortDir: "desc",
  groupBy: "department",
  density: "comfortable",
  hideEmpty: false,
  soonWindow: 7,
  showStatTiles: true,
  showPerTable: true,
  showUpcoming: true,
  showOverdue: true,
  showProfileMeta: true,
  showCompletionRing: true,
  tableAllowList: [],
};

const PREFS_KEY = "zto-views-prefs:v1";

function loadPrefs(): ViewPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<ViewPrefs>;
    // Whitelist merge — drop anything we don't recognise so prefs from a
    // future build never crash an older one.
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(p: ViewPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // Storage quota / private mode — ignore.
  }
}

/* ───────── Component ───────── */

export default function DashboardsAndViewsPage() {
  const { addToast } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [summaries, setSummaries] = useState<PerMemberSummary[]>([]);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [prefs, setPrefs] = useState<ViewPrefs>(DEFAULT_PREFS);
  const [showSettings, setShowSettings] = useState(false);

  // Hydrate prefs once on mount so SSR doesn't render mismatched markup.
  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);
  const updatePrefs = (patch: Partial<ViewPrefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...patch };
      savePrefs(next);
      return next;
    });
  };
  const resetPrefs = () => {
    setPrefs(DEFAULT_PREFS);
    savePrefs(DEFAULT_PREFS);
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboards", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التحميل");
      setMembers(data.members ?? []);
      setSummaries(data.summaries ?? []);
      setDiag(data.diagnostics ?? null);
      if (data.summaries?.length > 0 && !activeId) {
        setActiveId(data.summaries[0].member.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ غير معروف");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allDepartments = useMemo(() => {
    const set = new Set<string>();
    for (const s of summaries) if (s.member.department) set.add(s.member.department);
    return Array.from(set).sort();
  }, [summaries]);
  const [departmentFilter, setDepartmentFilter] = useState<string>("");

  // Tables we've actually seen across all members — drives the table-filter
  // chooser inside the settings drawer.
  const allTables = useMemo(() => {
    const map = new Map<string, string>(); // tableId -> tableName
    for (const s of summaries) for (const t of s.perTable) map.set(t.tableId, t.tableName);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [summaries]);

  // Effective allow-list: empty array means "include everything", which is
  // simpler for the toggles inside the drawer.
  const tableAllowSet = useMemo(() => {
    if (prefs.tableAllowList.length === 0) return null;
    return new Set(prefs.tableAllowList);
  }, [prefs.tableAllowList]);

  // Recompute totals against the active table allowlist + soonWindow so the
  // user sees their settings reflected immediately. We work off the existing
  // perTable + upcoming/overdue arrays the API already returns — the API's
  // 7-day "soon" window stays as the maximum, and we trim down on the client
  // when the admin picks 3 days.
  const adjustedSummaries = useMemo(() => {
    const soonMs = prefs.soonWindow * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return summaries.map((s) => {
      const perTable = tableAllowSet
        ? s.perTable.filter((t) => tableAllowSet.has(t.tableId))
        : s.perTable;
      const totals: BucketCounts = perTable.reduce(
        (acc, t) => ({
          total: acc.total + t.counts.total,
          done: acc.done + t.counts.done,
          inProgress: acc.inProgress + t.counts.inProgress,
          overdue: acc.overdue + t.counts.overdue,
          dueSoon: acc.dueSoon + t.counts.dueSoon,
        }),
        { total: 0, done: 0, inProgress: 0, overdue: 0, dueSoon: 0 }
      );
      // Re-bucket upcoming items against the configured window. Items past
      // the window become "later", which we drop from the upcoming card.
      const upcoming = s.upcoming.filter((it) => {
        if (tableAllowSet && !allTables.find((t) => t.name === it.table && tableAllowSet.has(t.id))) return false;
        if (!it.dueAt) return true;
        const t = Date.parse(it.dueAt);
        if (!Number.isFinite(t)) return true;
        return t - now <= soonMs;
      });
      const overdue = s.overdue.filter((it) => {
        if (tableAllowSet && !allTables.find((t) => t.name === it.table && tableAllowSet.has(t.id))) return false;
        return true;
      });
      return { ...s, totals, perTable, upcoming, overdue };
    });
  }, [summaries, prefs.soonWindow, tableAllowSet, allTables]);

  const filteredSummaries = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = adjustedSummaries.filter((s) => {
      if (departmentFilter && s.member.department !== departmentFilter) return false;
      if (prefs.hideEmpty && s.totals.total === 0) return false;
      if (!q) return true;
      return (
        s.member.name.toLowerCase().includes(q) ||
        (s.member.role?.toLowerCase().includes(q) ?? false) ||
        (s.member.email?.toLowerCase().includes(q) ?? false) ||
        (s.member.department?.toLowerCase().includes(q) ?? false)
      );
    });

    // Sort. The "completion" sort treats members with no work as 0 % so they
    // bunch at the bottom in desc mode (felt right when testing).
    const dir = prefs.sortDir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      switch (prefs.rosterSort) {
        case "name": av = a.member.name; bv = b.member.name; break;
        case "total": av = a.totals.total; bv = b.totals.total; break;
        case "overdue": av = a.totals.overdue; bv = b.totals.overdue; break;
        case "dueSoon": av = a.totals.dueSoon; bv = b.totals.dueSoon; break;
        case "completion": av = pct(a.totals.done, a.totals.total); bv = pct(b.totals.done, b.totals.total); break;
      }
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
    return out;
  }, [adjustedSummaries, search, departmentFilter, prefs.hideEmpty, prefs.rosterSort, prefs.sortDir]);

  // Roster grouping — the prefs let admins group by department / role /
  // manager, or flatten everything into a single list.
  const groupedRoster = useMemo(() => {
    if (prefs.groupBy === "none") return [["__none__", filteredSummaries] as const];
    const unassignedKey = "__none__";
    const groups = new Map<string, typeof filteredSummaries>();
    for (const s of filteredSummaries) {
      let k: string;
      if (prefs.groupBy === "department") k = s.member.department ?? unassignedKey;
      else if (prefs.groupBy === "role") k = s.member.role ?? unassignedKey;
      else {
        const mgr = s.member.managerId
          ? summaries.find((x) => x.member.id === s.member.managerId)?.member.name
          : null;
        k = mgr ?? unassignedKey;
      }
      const arr = groups.get(k) ?? [];
      arr.push(s);
      groups.set(k, arr);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === unassignedKey) return 1;
      if (b === unassignedKey) return -1;
      return a.localeCompare(b);
    });
  }, [filteredSummaries, prefs.groupBy, summaries]);

  const overall = useMemo(() => {
    const t: BucketCounts = { total: 0, done: 0, inProgress: 0, overdue: 0, dueSoon: 0 };
    for (const s of adjustedSummaries) {
      t.total += s.totals.total;
      t.done += s.totals.done;
      t.inProgress += s.totals.inProgress;
      t.overdue += s.totals.overdue;
      t.dueSoon += s.totals.dueSoon;
    }
    return t;
  }, [adjustedSummaries]);

  // CSV export of the currently-visible roster — picks up whatever the
  // sort/filter/groupBy currently show. Safe against commas/quotes in
  // member fields by quoting every cell unconditionally.
  const exportCSV = () => {
    if (filteredSummaries.length === 0) {
      addToast("لا توجد بيانات لتصديرها", "warning");
      return;
    }
    const headers = ["Name", "Role", "Department", "Email", "Total", "In Progress", "Done", "Overdue", "Due Soon", "Completion %"];
    const rows = filteredSummaries.map((s) => [
      s.member.name,
      s.member.role ?? "",
      s.member.department ?? "",
      s.member.email ?? "",
      String(s.totals.total),
      String(s.totals.inProgress),
      String(s.totals.done),
      String(s.totals.overdue),
      String(s.totals.dueSoon),
      `${pct(s.totals.done, s.totals.total)}%`,
    ]);
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
    // Prepend BOM so Excel opens it as UTF-8 instead of mangling Arabic.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `team-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    addToast(`تم تصدير ${filteredSummaries.length} سجلّاً`, "success");
  };

  const active =
    adjustedSummaries.find((s) => s.member.id === activeId) ?? filteredSummaries[0];

  return (
    <div className="space-y-6 zto-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-400" />
            لوحات الفريق والعرض
          </h2>
          <p className="text-neutral-500 text-sm mt-1">
            نظرة عامة على عمل كل عضو من فريقك — مهام مفتوحة، تأخّرات، قادم خلال أسبوع.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            disabled={loading || filteredSummaries.length === 0}
            className="zto-btn zto-btn-ghost zto-btn-sm"
            title="تصدير CSV"
          >
            <Download className="w-3.5 h-3.5" />
            تصدير
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="zto-btn zto-btn-ghost zto-btn-sm"
            title="إعدادات العرض"
          >
            <Settings className="w-3.5 h-3.5" />
            تخصيص
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="zto-btn zto-btn-outline zto-btn-sm"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            تحديث
          </button>
        </div>
      </div>

      <PageGuide
        pageName="لوحات الفريق والعرض"
        accent="pink"
        storageKey="views"
        intro={
          <>
            صفحة عرض جماعية: تستعرض ما يعمل عليه كل عضو من الفريق الآن — المهام المفتوحة، المتأخّرة، والقادمة خلال أسبوع. تُغذّى من جدول
            <code className="text-amber-400 mx-1 font-mono">Team</code>
            داخل قاعدة Airtable نفسها.
          </>
        }
        tips={[
          { title: "اختيار عضو الفريق", body: <>القائمة الجانبية فيها كل أسماء أعضاء الفريق — اختر اسماً لرؤية كل مهامه على اليمين. كرّر يومياً مع كل عضو لمعرفة من يحتاج دعماً.</> },
          { title: "تحديث البيانات", body: <>اضغط زرّ <span className="text-amber-300 font-bold">«تحديث»</span> لإعادة سحب أحدث المهام من Airtable. التحديث الذاتي يحدث عند فتح الصفحة فقط.</> },
          { title: "إن لم يظهر الفريق", body: <>تأكّد من وجود جدول <code className="text-amber-400 font-mono">Team</code> في قاعدتك يحوي على الأقل الأعمدة (Name, Email, Role). البطاقة التشخيصية أعلى ستخبرك بالضبط ما الناقص.</> },
          { title: "ربط المهام بالأعضاء", body: <>كل سجلّ مهمّة في Airtable يجب أن يحوي حقلاً نوعه «Linked record» يشير إلى الجدول Team — هذا الرابط هو ما يجمعها بالشخص المسؤول هنا.</> },
        ]}
      />

      {error && (
        <div className="zto-card p-4 flex items-start gap-2 border-red-500/30 bg-red-500/5">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Diagnostics card when team table not detected */}
      {!loading && diag && !diag.teamTable && (
        <div className="zto-card p-5 border-amber-500/30 bg-amber-500/5 space-y-2">
          <p className="text-sm font-bold text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            لم يُعثر على جدول &quot;Team&quot; في قاعدة Airtable
          </p>
          <p className="text-xs text-neutral-300">
            للظهور هنا، أنشئ جدولاً باسم
            <code className="text-amber-400 mx-1 font-mono">Team</code>
            (أو
            <code className="text-amber-400 mx-1 font-mono">Members</code>)
            ثم أنشئ حقل ربط
            <code className="text-amber-400 mx-1 font-mono">multipleRecordLinks</code>
            من جداول المهام إلى Team.
          </p>
          {diag.availableTables && diag.availableTables.length > 0 && (
            <details className="text-[0.65rem] text-neutral-500 mt-2">
              <summary className="cursor-pointer">الجداول المتاحة في القاعدة</summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {diag.availableTables.map((t) => (
                  <code key={t.id} className="bg-[#1a1a1a] border border-neutral-800 rounded px-1.5 py-0.5 font-mono">
                    {t.name}
                  </code>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && summaries.length === 0 && (
        <div className="zto-card p-16 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
        </div>
      )}

      {/* Top stats — overall */}
      {summaries.length > 0 && prefs.showStatTiles && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatTile
            icon={<Users className="w-4 h-4" />}
            label="أعضاء"
            value={members.length.toString()}
            tone="indigo"
          />
          <StatTile
            icon={<ListTodo className="w-4 h-4" />}
            label="مهام مُسندة"
            value={overall.total.toString()}
            tone="amber"
          />
          <StatTile
            icon={<TrendingUp className="w-4 h-4" />}
            label="جارية"
            value={overall.inProgress.toString()}
            sub={`${pct(overall.done, overall.total)}% منجز`}
            tone="blue"
          />
          <StatTile
            icon={<Zap className="w-4 h-4" />}
            label="قريبة الاستحقاق"
            value={overall.dueSoon.toString()}
            sub="خلال 7 أيام"
            tone="purple"
          />
          <StatTile
            icon={<AlertTriangle className="w-4 h-4" />}
            label="متأخّرة"
            value={overall.overdue.toString()}
            tone="red"
          />
        </div>
      )}

      {/* Layout: roster sidebar + active dashboard */}
      {summaries.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          {/* Roster */}
          <div className="zto-card p-3 space-y-3 lg:max-h-[calc(100vh-320px)] lg:overflow-y-auto">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث في الأعضاء..."
                className="zto-input text-xs" style={{ paddingInlineStart: "2.5rem" }}
              />
            </div>
            {/* Department pill filter — only when the Team table actually has dept info */}
            {allDepartments.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => setDepartmentFilter("")}
                  className={`text-[0.6rem] rounded-full px-2 py-0.5 border transition-colors ${
                    !departmentFilter
                      ? "bg-amber-400/15 text-amber-400 border-amber-400/40"
                      : "border-neutral-800 text-neutral-400 hover:border-neutral-600"
                  }`}
                >
                  الكل
                </button>
                {allDepartments.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDepartmentFilter(departmentFilter === d ? "" : d)}
                    className={`text-[0.6rem] rounded-full px-2 py-0.5 border transition-colors ${
                      departmentFilter === d
                        ? "bg-amber-400/15 text-amber-400 border-amber-400/40"
                        : "border-neutral-800 text-neutral-400 hover:border-neutral-600"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-3">
              {filteredSummaries.length === 0 && (
                <p className="text-xs text-neutral-500 text-center py-6">لا نتائج</p>
              )}
              {groupedRoster.map(([groupKey, list]) => {
                const isUnassigned = groupKey === "__none__";
                const showHeader = prefs.groupBy !== "none" && (
                  prefs.groupBy === "department" ? allDepartments.length > 0 : true
                );
                const groupLabel = isUnassigned
                  ? prefs.groupBy === "manager"
                    ? "بلا مدير"
                    : prefs.groupBy === "role"
                      ? "بلا مسمى وظيفي"
                      : "بدون قسم"
                  : groupKey;
                return (
                  <div key={groupKey}>
                    {showHeader && (
                      <p className="text-[0.55rem] font-black text-neutral-500 uppercase tracking-wider mb-1.5 px-1">
                        {groupLabel}
                        <span className="text-neutral-700 mr-1">· {list.length}</span>
                      </p>
                    )}
                    <div className={prefs.density === "compact" ? "space-y-0.5" : "space-y-1.5"}>
                      {list.map((s) => {
                        const isActive = (active?.member.id ?? "") === s.member.id;
                        const overdue = s.totals.overdue;
                        const completion = pct(s.totals.done, s.totals.total);
                        return (
                          <button
                            key={s.member.id}
                            onClick={() => setActiveId(s.member.id)}
                            className={`zto-roster-row w-full text-right ${
                              isActive ? "zto-roster-row-active" : ""
                            } ${prefs.density === "compact" ? "!py-1" : ""}`}
                          >
                            {prefs.density === "comfortable" && <Avatar member={s.member} />}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-bold text-white truncate">{s.member.name}</p>
                                {overdue > 0 && (
                                  <span className="zto-badge zto-badge-err text-[0.55rem] !py-0">
                                    {overdue}
                                  </span>
                                )}
                              </div>
                              {prefs.density === "comfortable" && s.member.role && (
                                <p className="text-[0.6rem] text-neutral-500 truncate">{s.member.role}</p>
                              )}
                            </div>
                            <div className="text-[0.6rem] text-neutral-500 tabular-nums shrink-0 flex items-center gap-2">
                              {prefs.rosterSort === "completion" && s.totals.total > 0 && (
                                <span className="text-emerald-400">{completion}%</span>
                              )}
                              {prefs.rosterSort === "dueSoon" && s.totals.dueSoon > 0 && (
                                <span className="text-purple-400">{s.totals.dueSoon}</span>
                              )}
                              {s.totals.total}
                            </div>
                            {isActive && <ChevronRight className="w-3 h-3 text-amber-400" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active member dashboard */}
          {active && <MemberDashboard summary={active} prefs={prefs} key={active.member.id} />}
        </div>
      )}

      {/* Empty roster */}
      {!loading && summaries.length === 0 && diag?.teamTable && (
        <div className="zto-card p-16 text-center">
          <Inbox className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
          <p className="text-neutral-500 text-sm font-bold">لا أعضاء في جدول Team بعد</p>
          <button
            onClick={() => addToast("أضف أعضاءً في جدول Team في Airtable ثم اضغط تحديث", "info")}
            className="zto-btn zto-btn-ghost zto-btn-sm mt-2"
          >
            تعرّف على الخطوات
          </button>
        </div>
      )}

      {/* Diagnostics footer */}
      {diag?.linkedTables && diag.linkedTables.length > 0 && (
        <details className="zto-card p-3 text-[0.65rem] text-neutral-500">
          <summary className="cursor-pointer text-neutral-400 font-bold">
            مصادر البيانات: {diag.linkedTables.length} جدول مرتبط بـ &quot;{diag.teamTable?.name}&quot;
          </summary>
          <div className="mt-2 space-y-1">
            {diag.linkedTables.map((l) => (
              <div key={`${l.id}-${l.linkField}`} className="flex items-center gap-2 flex-wrap">
                <code className="text-amber-400 font-mono">{l.name}</code>
                <span className="text-neutral-600">·</span>
                <span>عبر حقل</span>
                <code className="text-purple-400 font-mono">{l.linkField}</code>
                {l.linkKind && (
                  <span className="text-[0.55rem] text-neutral-500 font-mono">
                    [{l.linkKind === "recordLink" ? "ربط" : l.linkKind === "collaborator" ? "متعاون" : "اسم"}]
                  </span>
                )}
                {l.statusField && (
                  <>
                    <span className="text-neutral-600">·</span>
                    <span>حالة</span>
                    <code className="text-blue-400 font-mono">{l.statusField}</code>
                  </>
                )}
                {l.dueField && (
                  <>
                    <span className="text-neutral-600">·</span>
                    <span>استحقاق</span>
                    <code className="text-emerald-400 font-mono">{l.dueField}</code>
                  </>
                )}
              </div>
            ))}
            {diag.warnings.length > 0 && (
              <div className="mt-2 pt-2 border-t border-neutral-800 space-y-0.5">
                {diag.warnings.map((w, i) => (
                  <p key={i} className="text-amber-400">⚠ {w}</p>
                ))}
              </div>
            )}
          </div>
        </details>
      )}

      {/* Customisation drawer — fixed-position panel that slides in from the
          left (RTL ⇒ visually from the leading edge). Backed by localStorage
          via updatePrefs / resetPrefs so changes persist across reloads. */}
      {showSettings && (
        <SettingsDrawer
          prefs={prefs}
          allTables={allTables}
          onChange={updatePrefs}
          onReset={resetPrefs}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

/* ───────── Subcomponents ───────── */

function Avatar({ member }: { member: TeamMember }) {
  if (member.avatarUrl) {
    return (
      <div className="w-8 h-8 rounded-full overflow-hidden bg-neutral-800 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={member.avatarUrl} alt={member.name} className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400/40 to-purple-500/40 border border-neutral-700 flex items-center justify-center shrink-0">
      <span className="text-[10px] font-black text-white">{initials(member.name)}</span>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: "indigo" | "amber" | "blue" | "purple" | "red";
}) {
  const toneClass = {
    indigo: "from-indigo-500/15 to-indigo-500/5 text-indigo-300 border-indigo-500/20",
    amber: "from-amber-500/15 to-amber-500/5 text-amber-300 border-amber-500/20",
    blue: "from-blue-500/15 to-blue-500/5 text-blue-300 border-blue-500/20",
    purple: "from-purple-500/15 to-purple-500/5 text-purple-300 border-purple-500/20",
    red: "from-red-500/15 to-red-500/5 text-red-300 border-red-500/20",
  }[tone];
  return (
    <div className={`zto-stat-tile bg-gradient-to-br ${toneClass}`}>
      <div className="flex items-center justify-between">
        <span className="opacity-80">{icon}</span>
        <span className="text-[0.55rem] uppercase tracking-wider opacity-70 font-bold">
          {label}
        </span>
      </div>
      <div className="mt-1.5">
        <p className="text-2xl font-black tabular-nums text-white leading-none">{value}</p>
        {sub && <p className="text-[0.6rem] opacity-70 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function MemberDashboard({ summary, prefs }: { summary: PerMemberSummary; prefs: ViewPrefs }) {
  const m = summary.member;
  const completionPct = pct(summary.totals.done, summary.totals.total);
  return (
    <div className={`zto-slide-up ${prefs.density === "compact" ? "space-y-3" : "space-y-4"}`}>
      {/* Profile header */}
      <div className={`zto-card zto-glow-edge ${prefs.density === "compact" ? "p-4" : "p-5"}`}>
        <div className="flex items-start gap-4 flex-wrap">
          <div className={`rounded-2xl bg-gradient-to-br from-amber-400/40 to-purple-500/40 border border-neutral-700 flex items-center justify-center overflow-hidden shrink-0 ${
            prefs.density === "compact" ? "w-10 h-10" : "w-14 h-14"
          }`}>
            {m.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.avatarUrl} alt={m.name} className="w-full h-full object-cover" />
            ) : (
              <span className={`font-black text-white ${prefs.density === "compact" ? "text-xs" : "text-base"}`}>{initials(m.name)}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-black text-white">{m.name}</h3>
            {prefs.showProfileMeta && (
              <div className="flex items-center gap-3 flex-wrap text-[0.7rem] text-neutral-400 mt-1">
                {m.role && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="w-3 h-3" />
                    {m.role}
                  </span>
                )}
                {m.email && (
                  <span className="flex items-center gap-1" dir="ltr">
                    <Mail className="w-3 h-3" />
                    {m.email}
                  </span>
                )}
                {m.department && (
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {m.department}
                  </span>
                )}
                {!m.role && !m.email && !m.department && (
                  <span className="text-neutral-600 flex items-center gap-1">
                    <User className="w-3 h-3" />
                    بلا تفاصيل إضافية
                  </span>
                )}
              </div>
            )}
          </div>
          {/* Completion progress ring */}
          {prefs.showCompletionRing && (
            <div className="flex items-center gap-3">
              <ProgressRing pct={completionPct} />
              <div className="text-[0.65rem] text-neutral-400">
                <p className="font-bold text-white text-sm">{completionPct}%</p>
                <p>مُنجَز من إجمالي العمل</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Per-table breakdown */}
      {prefs.showPerTable && (
      <div>
        <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" />
          توزيع العمل على الجداول
        </h4>
        {summary.perTable.length === 0 ? (
          <div className="zto-card p-10 text-center">
            <Inbox className="w-8 h-8 text-neutral-700 mx-auto mb-2" />
            <p className="text-xs text-neutral-500">لا أعمال مُسندة بعد</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {summary.perTable.map((t) => (
              <div key={t.tableId} className="zto-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-bold text-sm text-white truncate">{t.tableName}</p>
                  <span className="zto-badge border border-neutral-700 text-neutral-300 text-[0.6rem]">
                    {t.counts.total}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <MiniStat label="جارية" value={t.counts.inProgress} tone="blue" />
                  <MiniStat label="منجزة" value={t.counts.done} tone="emerald" />
                  <MiniStat label="متأخرة" value={t.counts.overdue} tone="red" />
                </div>
                <ProgressBar
                  parts={[
                    { value: t.counts.done, color: "bg-emerald-500" },
                    { value: t.counts.inProgress - t.counts.overdue, color: "bg-blue-500" },
                    { value: t.counts.overdue, color: "bg-red-500" },
                  ]}
                />
                {t.statusBreakdown.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {t.statusBreakdown.slice(0, 6).map((sb) => (
                      <span
                        key={sb.label}
                        className="text-[0.6rem] bg-[#1a1a1a] border border-neutral-800 rounded-full px-2 py-0.5 text-neutral-300"
                      >
                        {sb.label}
                        <span className="text-neutral-500 mr-1">{sb.count}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      )}

      {/* Overdue + upcoming */}
      {(prefs.showOverdue || prefs.showUpcoming) && (
        <div className={`grid gap-3 ${
          prefs.showOverdue && prefs.showUpcoming
            ? "grid-cols-1 md:grid-cols-2"
            : "grid-cols-1"
        }`}>
          {prefs.showOverdue && (
            <ListCard
              title="مهام متأخرة"
              icon={<AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
              items={summary.overdue}
              empty="لا تأخّر — أحسنت!"
              tone="red"
            />
          )}
          {prefs.showUpcoming && (
            <ListCard
              title={`قادمة خلال ${prefs.soonWindow === 7 ? "أسبوع" : `${prefs.soonWindow} يوم`}`}
              icon={<Clock className="w-3.5 h-3.5 text-purple-400" />}
              items={summary.upcoming}
              empty="لا قادم في الأفق"
              tone="purple"
            />
          )}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: "blue" | "emerald" | "red" }) {
  const toneClass = {
    blue: "text-blue-300 bg-blue-500/10 border-blue-500/20",
    emerald: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
    red: "text-red-300 bg-red-500/10 border-red-500/20",
  }[tone];
  return (
    <div className={`rounded-lg border ${toneClass} py-1.5 px-2`}>
      <p className="text-base font-black tabular-nums leading-none">{value}</p>
      <p className="text-[0.55rem] uppercase tracking-wide mt-0.5 opacity-80">{label}</p>
    </div>
  );
}

function ProgressBar({ parts }: { parts: Array<{ value: number; color: string }> }) {
  const total = Math.max(1, parts.reduce((s, p) => s + Math.max(0, p.value), 0));
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-neutral-800">
      {parts.map((p, i) => {
        const w = (Math.max(0, p.value) / total) * 100;
        if (w === 0) return null;
        return <div key={i} className={p.color} style={{ width: `${w}%` }} />;
      })}
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return (
    <svg viewBox="0 0 56 56" className="w-12 h-12 -rotate-90">
      <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        stroke="rgb(251, 191, 36)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

function ListCard({
  title,
  icon,
  items,
  empty,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  items: UpcomingItem[];
  empty: string;
  tone: "red" | "purple";
}) {
  return (
    <div className="zto-card p-4">
      <h4 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
        {icon}
        {title}
        <span className={`mr-auto zto-badge text-[0.6rem] ${
          tone === "red"
            ? "border border-red-500/30 text-red-400"
            : "border border-purple-500/30 text-purple-400"
        }`}>
          {items.length}
        </span>
      </h4>
      {items.length === 0 ? (
        <div className="text-center py-6">
          <CheckCircle2 className="w-6 h-6 text-neutral-700 mx-auto mb-1.5" />
          <p className="text-xs text-neutral-500">{empty}</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {items.map((it) => (
            <div
              key={it.recordId}
              className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-neutral-800/40 transition-colors"
            >
              <span
                className={`w-1 self-stretch rounded-full ${
                  tone === "red" ? "bg-red-500/60" : "bg-purple-500/60"
                }`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-medium line-clamp-1">{it.title}</p>
                <div className="flex items-center gap-1.5 text-[0.6rem] text-neutral-500 mt-0.5">
                  <span>{it.table}</span>
                  {it.status && (
                    <>
                      <span>·</span>
                      <span>{it.status}</span>
                    </>
                  )}
                  {it.dueAt && (
                    <>
                      <span>·</span>
                      <span className={tone === "red" ? "text-red-400" : "text-purple-400"}>
                        {relativeDate(it.dueAt)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────── Settings drawer ───────── */

interface DrawerProps {
  prefs: ViewPrefs;
  allTables: Array<{ id: string; name: string }>;
  onChange: (patch: Partial<ViewPrefs>) => void;
  onReset: () => void;
  onClose: () => void;
}

function SettingsDrawer({ prefs, allTables, onChange, onReset, onClose }: DrawerProps) {
  // Toggle a single table in/out of the allowlist. Empty list == include
  // all (keeps the drawer's "everything visible" state simple).
  const toggleTable = (id: string) => {
    const cur = new Set(prefs.tableAllowList);
    // First click on an "include all" state → switch to single-include mode
    // populated with everything except the toggled id.
    if (cur.size === 0) {
      const allIds = new Set(allTables.map((t) => t.id));
      allIds.delete(id);
      onChange({ tableAllowList: Array.from(allIds) });
      return;
    }
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    // If the user hides every table, fall back to "show everything" — the
    // empty state is more useful than an empty dashboard.
    if (cur.size === 0) onChange({ tableAllowList: [] });
    else onChange({ tableAllowList: Array.from(cur) });
  };
  const includesTable = (id: string) =>
    prefs.tableAllowList.length === 0 || prefs.tableAllowList.includes(id);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      {/* Panel — pinned to the leading edge (right side in RTL). */}
      <aside
        className="fixed inset-y-0 left-0 w-full sm:w-[420px] bg-[#0d0d0d] border-l border-neutral-800 z-50 overflow-y-auto"
        dir="rtl"
      >
        <div className="sticky top-0 bg-[#0d0d0d] border-b border-neutral-800 p-4 flex items-center justify-between gap-2 z-10">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">تخصيص العرض</h3>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white" title="إغلاق">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          <DrawerSection title="ترتيب القائمة" icon={<ArrowUpDown className="w-3.5 h-3.5 text-amber-400" />}>
            <div className="grid grid-cols-2 gap-2">
              <SegmentedSelect
                value={prefs.rosterSort}
                onChange={(v) => onChange({ rosterSort: v as RosterSort })}
                options={[
                  { value: "overdue", label: "متأخّرات" },
                  { value: "total", label: "إجمالي المهام" },
                  { value: "dueSoon", label: "قريبة الاستحقاق" },
                  { value: "completion", label: "نسبة الإنجاز" },
                  { value: "name", label: "الاسم" },
                ]}
              />
              <SegmentedSelect
                value={prefs.sortDir}
                onChange={(v) => onChange({ sortDir: v as SortDir })}
                options={[
                  { value: "desc", label: "تنازلي" },
                  { value: "asc", label: "تصاعدي" },
                ]}
              />
            </div>
          </DrawerSection>

          <DrawerSection title="تجميع الأعضاء" icon={<Layers className="w-3.5 h-3.5 text-purple-400" />}>
            <SegmentedSelect
              value={prefs.groupBy}
              onChange={(v) => onChange({ groupBy: v as GroupBy })}
              options={[
                { value: "department", label: "بالقسم" },
                { value: "role", label: "بالمسمى" },
                { value: "manager", label: "بالمدير" },
                { value: "none", label: "بدون تجميع" },
              ]}
            />
          </DrawerSection>

          <DrawerSection title="نافذة «قريبة الاستحقاق»" icon={<Clock className="w-3.5 h-3.5 text-purple-400" />}>
            <SegmentedSelect
              value={String(prefs.soonWindow)}
              onChange={(v) => onChange({ soonWindow: Number(v) as SoonWindow })}
              options={[
                { value: "3", label: "3 أيام" },
                { value: "7", label: "أسبوع" },
                { value: "14", label: "أسبوعان" },
                { value: "30", label: "30 يوم" },
              ]}
            />
            <p className="text-[0.6rem] text-neutral-500 mt-2 leading-relaxed">
              يحدّد ما يظهر في بطاقة «قادمة» وفي بطاقة «قريبة الاستحقاق» الإجمالية.
              المتأخّرات تبقى متأخّرات بصرف النظر عن هذا الإعداد.
            </p>
          </DrawerSection>

          <DrawerSection title="كثافة العرض" icon={<Eye className="w-3.5 h-3.5 text-blue-400" />}>
            <SegmentedSelect
              value={prefs.density}
              onChange={(v) => onChange({ density: v as Density })}
              options={[
                { value: "comfortable", label: "مريح" },
                { value: "compact", label: "مضغوط" },
              ]}
            />
            <p className="text-[0.6rem] text-neutral-500 mt-2 leading-relaxed">
              في الوضع المضغوط نُخفي الصور الرمزية والمسمى الوظيفي ونقلّص المسافات — مفيد لفِرَق كبيرة (+30 شخصاً).
            </p>
          </DrawerSection>

          <DrawerSection title="إظهار/إخفاء" icon={<EyeOff className="w-3.5 h-3.5 text-emerald-400" />}>
            <Toggle label="إخفاء الأعضاء بلا مهام"  value={prefs.hideEmpty}          onChange={(v) => onChange({ hideEmpty: v })} />
            <Toggle label="بطاقات الإحصائيات العلوية" value={prefs.showStatTiles}      onChange={(v) => onChange({ showStatTiles: v })} />
            <Toggle label="معلومات العضو الجانبية"   value={prefs.showProfileMeta}    onChange={(v) => onChange({ showProfileMeta: v })} />
            <Toggle label="حلقة نسبة الإنجاز"        value={prefs.showCompletionRing} onChange={(v) => onChange({ showCompletionRing: v })} />
            <Toggle label="توزيع العمل على الجداول"   value={prefs.showPerTable}       onChange={(v) => onChange({ showPerTable: v })} />
            <Toggle label="بطاقة المهام المتأخّرة"     value={prefs.showOverdue}        onChange={(v) => onChange({ showOverdue: v })} />
            <Toggle label="بطاقة المهام القادمة"      value={prefs.showUpcoming}       onChange={(v) => onChange({ showUpcoming: v })} />
          </DrawerSection>

          {allTables.length > 0 && (
            <DrawerSection title={`الجداول المعروضة (${allTables.length})`} icon={<ListTodo className="w-3.5 h-3.5 text-amber-400" />}>
              <p className="text-[0.6rem] text-neutral-500 mb-2 leading-relaxed">
                اختر أيّ الجداول تظهر في إحصائيات الفريق وفي توزيع العمل. إذا أخفيت الكل سيعود العرض تلقائياً للحالة الافتراضية «إظهار الجميع».
              </p>
              <div className="space-y-1">
                {allTables.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => toggleTable(t.id)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-right transition-colors ${
                      includesTable(t.id)
                        ? "bg-amber-400/10 border-amber-400/30 text-amber-200"
                        : "bg-[#0d0d0d] border-neutral-800 text-neutral-500 hover:border-neutral-700"
                    }`}
                  >
                    {includesTable(t.id) ? (
                      <Eye className="w-3 h-3 shrink-0" />
                    ) : (
                      <EyeOff className="w-3 h-3 shrink-0" />
                    )}
                    <span className="text-xs truncate flex-1">{t.name}</span>
                  </button>
                ))}
              </div>
            </DrawerSection>
          )}
        </div>

        <div className="sticky bottom-0 bg-[#0d0d0d] border-t border-neutral-800 p-4 flex items-center justify-between gap-2">
          <button
            onClick={onReset}
            className="zto-btn zto-btn-ghost zto-btn-sm"
            title="استعادة الإعدادات الافتراضية"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            استعادة الافتراضي
          </button>
          <button onClick={onClose} className="zto-btn zto-btn-gold zto-btn-sm">
            <CheckCircle2 className="w-3.5 h-3.5" />
            تم
          </button>
        </div>
      </aside>
    </>
  );
}

function DrawerSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[0.65rem] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
        {icon}
        {title}
      </p>
      {children}
    </div>
  );
}

function SegmentedSelect<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#1a1a1a] border border-neutral-800 rounded-lg">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`text-[0.65rem] py-1.5 px-2 rounded-md transition-colors font-bold ${
              active
                ? "bg-amber-400/15 text-amber-200 border border-amber-400/40"
                : "text-neutral-400 hover:text-neutral-200 border border-transparent"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md hover:bg-neutral-800/40 transition-colors text-right"
    >
      <span className="text-xs text-neutral-300">{label}</span>
      <span
        className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${
          value ? "bg-amber-400" : "bg-neutral-800"
        }`}
      >
        <span
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${
            value ? "right-0.5" : "right-[18px]"
          }`}
        />
      </span>
    </button>
  );
}
