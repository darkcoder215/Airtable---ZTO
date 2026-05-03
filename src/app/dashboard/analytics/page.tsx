"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useAppStore } from "@/store/app-store";
import PageGuide from "@/components/PageGuide";
import {
  BarChart3,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Inbox,
  Clock,
  Activity,
  Search,
  Download,
  RotateCcw,
  Filter as FilterIcon,
  Calendar,
  ArrowUp,
  ArrowDown,
  ChevronDown,
} from "lucide-react";

interface Brand { id: string; slug: string; name: string }
interface Source { id: string; brand_id: string; name: string; type: string }

interface DailyStat {
  brand_id: string | null;
  source_id: string | null;
  day: string | null;
  runs: number | null;
  runs_success: number | null;
  runs_error: number | null;
  runs_empty: number | null;
  items_fetched: number | null;
  items_saved: number | null;
  avg_duration_ms: number | null;
}

type RunStatus = "success" | "partial" | "error" | "empty" | "skipped";

interface Run {
  id: string;
  brand_id: string;
  source_id: string;
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  items_fetched: number;
  items_passed: number;
  items_saved: number;
  error_message: string | null;
}

const STATUS_META: Record<RunStatus, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  success: { label: "نجاح", color: "text-emerald-400", bg: "bg-emerald-400/10", icon: CheckCircle2 },
  partial: { label: "جزئي", color: "text-amber-400", bg: "bg-amber-400/10", icon: AlertCircle },
  error:   { label: "خطأ",  color: "text-red-400",     bg: "bg-red-400/10",     icon: XCircle },
  empty:   { label: "فارغ", color: "text-neutral-400", bg: "bg-neutral-400/10", icon: Inbox },
  skipped: { label: "تخطي", color: "text-neutral-500", bg: "bg-neutral-700/20", icon: Clock },
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  rss: "مواقع",
  twitter: "X (تويتر)",
  linkedin: "LinkedIn",
  apify: "Apify",
  custom: "مخصّص",
};

const DAY_LABELS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/* ───────── Filter state ───────── */

type Preset = "today" | "yesterday" | "24h" | "7d" | "30d" | "thisMonth" | "custom";
type SortKey = "started_at" | "duration_ms" | "items_fetched" | "items_saved" | "status";

interface Filter {
  preset: Preset;
  fromLocal: string;          // datetime-local string ("2026-05-03T08:00")
  toLocal: string;
  brandId: string;
  sourceIds: string[];
  sourceTypes: string[];
  statuses: RunStatus[];
  hourFrom: number;           // 0-23
  hourTo: number;             // 0-23 (inclusive); equals hourFrom-1 wrap to disable
  daysOfWeek: number[];       // 0-6, empty == all
  search: string;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
}

const FILTER_PREFS_KEY = "zto-analytics-filter:v1";

function isoLocal(d: Date): string {
  // datetime-local needs YYYY-MM-DDTHH:mm in local time; ISO has Z so we
  // shave the timezone offset manually.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function rangeFromPreset(p: Preset): { fromLocal: string; toLocal: string } | null {
  const now = new Date();
  const start = new Date(now);
  switch (p) {
    case "today":
      start.setHours(0, 0, 0, 0);
      return { fromLocal: isoLocal(start), toLocal: isoLocal(now) };
    case "yesterday": {
      const s = new Date(now); s.setDate(s.getDate() - 1); s.setHours(0, 0, 0, 0);
      const e = new Date(s); e.setHours(23, 59, 59, 999);
      return { fromLocal: isoLocal(s), toLocal: isoLocal(e) };
    }
    case "24h":
      start.setHours(now.getHours() - 24);
      return { fromLocal: isoLocal(start), toLocal: isoLocal(now) };
    case "7d":
      start.setDate(now.getDate() - 7);
      return { fromLocal: isoLocal(start), toLocal: isoLocal(now) };
    case "30d":
      start.setDate(now.getDate() - 30);
      return { fromLocal: isoLocal(start), toLocal: isoLocal(now) };
    case "thisMonth": {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { fromLocal: isoLocal(s), toLocal: isoLocal(now) };
    }
    case "custom":
      return null;
  }
}

const DEFAULT_FILTER: Filter = {
  preset: "7d",
  ...(rangeFromPreset("7d") as { fromLocal: string; toLocal: string }),
  brandId: "",
  sourceIds: [],
  sourceTypes: [],
  statuses: [],
  hourFrom: 0,
  hourTo: 23,
  daysOfWeek: [],
  search: "",
  sortKey: "started_at",
  sortDir: "desc",
};

function loadFilter(): Filter {
  if (typeof window === "undefined") return DEFAULT_FILTER;
  try {
    const raw = window.localStorage.getItem(FILTER_PREFS_KEY);
    if (!raw) return DEFAULT_FILTER;
    const parsed = JSON.parse(raw) as Partial<Filter>;
    // When restoring a non-custom preset, reseed the date range from the
    // preset so reloading on Tuesday doesn't reuse last Friday's window.
    if (parsed.preset && parsed.preset !== "custom") {
      const r = rangeFromPreset(parsed.preset);
      if (r) {
        parsed.fromLocal = r.fromLocal;
        parsed.toLocal = r.toLocal;
      }
    }
    return { ...DEFAULT_FILTER, ...parsed };
  } catch {
    return DEFAULT_FILTER;
  }
}

function saveFilter(f: Filter): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FILTER_PREFS_KEY, JSON.stringify(f));
  } catch {
    // private mode / quota — ignore
  }
}

// Convert datetime-local → ISO (UTC). The input is local time per the
// browser, so new Date(local) is correct.
function localToIso(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/* ───────── Component ───────── */

export default function AnalyticsPage() {
  const { addToast } = useAppStore();
  const [filter, setFilter] = useState<Filter>(DEFAULT_FILTER);
  const [showFilters, setShowFilters] = useState(true);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [stats, setStats] = useState<DailyStat[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [sources, setSources] = useState<Source[]>([]);

  // Hydrate filter from localStorage on mount.
  useEffect(() => {
    setFilter(loadFilter());
  }, []);

  const updateFilter = useCallback((patch: Partial<Filter>) => {
    setFilter((cur) => {
      // If the user changes any time-bearing field, force preset → custom
      // unless the patch itself is a preset switch.
      const next: Filter = { ...cur, ...patch };
      if (
        patch.preset === undefined &&
        (patch.fromLocal !== undefined || patch.toLocal !== undefined)
      ) {
        next.preset = "custom";
      }
      // If the patch sets a non-custom preset, recompute the range so the
      // visible inputs reflect what the server will actually receive.
      if (patch.preset && patch.preset !== "custom") {
        const r = rangeFromPreset(patch.preset);
        if (r) {
          next.fromLocal = r.fromLocal;
          next.toLocal = r.toLocal;
        }
      }
      saveFilter(next);
      return next;
    });
  }, []);
  const resetFilter = () => {
    setFilter(DEFAULT_FILTER);
    saveFilter(DEFAULT_FILTER);
  };

  // Debounce the network call so wiggling a slider doesn't fire a request
  // every keystroke.
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      void load(filter);
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function load(f: Filter) {
    setLoading(true);
    setConfigError(null);
    try {
      const params = new URLSearchParams();
      const fromIso = localToIso(f.fromLocal);
      const toIso = localToIso(f.toLocal);
      if (fromIso) params.set("from", fromIso);
      if (toIso) params.set("to", toIso);
      if (f.brandId) params.set("brandId", f.brandId);
      if (f.sourceIds.length) params.set("sourceIds", f.sourceIds.join(","));
      if (f.sourceTypes.length) params.set("sourceTypes", f.sourceTypes.join(","));
      if (f.statuses.length) params.set("statuses", f.statuses.join(","));
      if (!(f.hourFrom === 0 && f.hourTo === 23)) {
        params.set("hourFrom", String(f.hourFrom));
        params.set("hourTo", String(f.hourTo));
      }
      if (f.daysOfWeek.length > 0 && f.daysOfWeek.length < 7) {
        params.set("daysOfWeek", f.daysOfWeek.join(","));
      }
      if (f.search.trim()) params.set("search", f.search.trim());
      params.set("limit", "2000");

      const res = await fetch(`/api/analytics?${params}`);
      const data = await res.json();
      if (res.status === 503) { setConfigError(data.error); return; }
      if (!res.ok) throw new Error(data.error || "Failed");
      setStats(data.stats || []);
      setRuns(data.runs || []);
      setBrands(data.brands || []);
      setSources(data.sources || []);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "خطأ", "error");
    } finally {
      setLoading(false);
    }
  }

  const sourceById = useMemo(() => {
    const m = new Map<string, Source>();
    for (const s of sources) m.set(s.id, s);
    return m;
  }, [sources]);
  const brandById = useMemo(() => {
    const m = new Map<string, Brand>();
    for (const b of brands) m.set(b.id, b);
    return m;
  }, [brands]);

  // KPI totals computed from RUNS so hour-of-day / day-of-week filters are
  // correctly reflected. (The daily stats view can't express those.)
  const totals = useMemo(() => {
    const t = { runs: 0, success: 0, partial: 0, error: 0, empty: 0, skipped: 0, fetched: 0, saved: 0 };
    for (const r of runs) {
      t.runs++;
      t[r.status]++;
      t.fetched += r.items_fetched;
      t.saved += r.items_saved;
    }
    return t;
  }, [runs]);

  // Histogram of runs per hour-of-day in the current result set — a
  // 24-bucket bar chart that helps spot patterns ("most failures happen at
  // 3am", "twitter is reliable except 8-10am UTC", etc.).
  const hourHistogram = useMemo(() => {
    const buckets = Array.from({ length: 24 }, () => ({ runs: 0, errors: 0 }));
    for (const r of runs) {
      const h = new Date(r.started_at).getUTCHours();
      if (Number.isFinite(h)) {
        buckets[h].runs++;
        if (r.status === "error" || r.status === "partial") buckets[h].errors++;
      }
    }
    const max = Math.max(1, ...buckets.map((b) => b.runs));
    return buckets.map((b, i) => ({ hour: i, ...b, frac: b.runs / max }));
  }, [runs]);

  const sortedRuns = useMemo(() => {
    const dir = filter.sortDir === "asc" ? 1 : -1;
    return [...runs].sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      switch (filter.sortKey) {
        case "started_at":    av = a.started_at;    bv = b.started_at;    break;
        case "duration_ms":   av = a.duration_ms ?? 0; bv = b.duration_ms ?? 0; break;
        case "items_fetched": av = a.items_fetched; bv = b.items_fetched; break;
        case "items_saved":   av = a.items_saved;   bv = b.items_saved;   break;
        case "status":        av = a.status;        bv = b.status;        break;
      }
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [runs, filter.sortKey, filter.sortDir]);

  const exportCSV = () => {
    if (sortedRuns.length === 0) {
      addToast("لا توجد بيانات لتصديرها", "warning");
      return;
    }
    const headers = ["Started At", "Brand", "Source", "Source Type", "Status", "Items Fetched", "Items Passed", "Items Saved", "Duration (ms)", "Error"];
    const rows = sortedRuns.map((r) => {
      const src = sourceById.get(r.source_id);
      const brand = brandById.get(r.brand_id);
      return [
        r.started_at,
        brand?.name ?? "",
        src?.name ?? r.source_id,
        src?.type ?? "",
        r.status,
        String(r.items_fetched),
        String(r.items_passed),
        String(r.items_saved),
        r.duration_ms != null ? String(r.duration_ms) : "",
        r.error_message ?? "",
      ];
    });
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-runs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    addToast(`تم تصدير ${sortedRuns.length} سجلّاً`, "success");
  };

  const toggleSort = (key: SortKey) => {
    updateFilter({
      sortKey: key,
      sortDir: filter.sortKey === key && filter.sortDir === "desc" ? "asc" : "desc",
    });
  };

  // Available source types in the loaded sources — used to gray out chips
  // for types that don't exist in the current brand selection.
  const availableSourceTypes = useMemo(() => {
    const set = new Set(sources.map((s) => s.type));
    return Array.from(set);
  }, [sources]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filter.brandId) n++;
    if (filter.sourceIds.length) n++;
    if (filter.sourceTypes.length) n++;
    if (filter.statuses.length) n++;
    if (!(filter.hourFrom === 0 && filter.hourTo === 23)) n++;
    if (filter.daysOfWeek.length > 0 && filter.daysOfWeek.length < 7) n++;
    if (filter.search.trim()) n++;
    if (filter.preset === "custom") n++;
    return n;
  }, [filter]);

  if (configError) {
    return (
      <div className="max-w-2xl mx-auto mt-10 p-6 rounded-2xl bg-amber-400/5 border border-amber-400/30">
        <div className="flex items-center gap-3 mb-3">
          <AlertCircle className="w-5 h-5 text-amber-400" />
          <h3 className="text-amber-400 font-bold">Supabase غير مهيّأ</h3>
        </div>
        <p className="text-[13px] text-neutral-300">{configError}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-amber-400" />
            <h1 className="text-2xl font-black text-white">التحليلات</h1>
            {loading && <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />}
          </div>
          <p className="text-[13px] text-neutral-500 mt-1">
            إحصائيات الفحص لكل علامة ومصدر — مع فلترة دقيقة بالساعة، اليوم، والحالة.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`zto-btn zto-btn-sm flex items-center gap-1.5 ${
              activeFilterCount > 0 ? "zto-btn-outline border-amber-400/40 !text-amber-300" : "zto-btn-ghost"
            }`}
          >
            <FilterIcon className="w-3.5 h-3.5" />
            الفلترة
            {activeFilterCount > 0 && (
              <span className="zto-badge text-[0.55rem] !py-0 bg-amber-400/20 text-amber-300 border-amber-400/40">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? "rotate-180" : ""}`} />
          </button>
          <button onClick={exportCSV} disabled={loading || runs.length === 0} className="zto-btn zto-btn-ghost zto-btn-sm">
            <Download className="w-3.5 h-3.5" />
            تصدير CSV
          </button>
          {activeFilterCount > 0 && (
            <button onClick={resetFilter} className="zto-btn zto-btn-ghost zto-btn-sm" title="إعادة تعيين الفلاتر">
              <RotateCcw className="w-3.5 h-3.5" />
              مسح
            </button>
          )}
        </div>
      </div>

      <PageGuide
        pageName="التحليلات"
        accent="emerald"
        storageKey="analytics"
        intro={
          <>
            صفحة التحليلات تجمع كل عمليات الجلب والفلترة والحفظ في مكان واحد، مع فلترة متقدّمة. أجب عن أسئلة من نوع «كم خبراً وصل من ميديا اليوم؟»، «ما المصدر الذي يفشل دائماً بين 2-4 صباحاً؟»، أو «ما العمليات التي رجعت برسالة الخطأ X؟».
          </>
        }
        tips={[
          { title: "الإعدادات السريعة", body: <>اضغط أحد الأزرار <span className="text-emerald-300 font-bold">«اليوم»</span> / <span className="text-emerald-300 font-bold">«آخر ٢٤ ساعة»</span> / <span className="text-emerald-300 font-bold">«٧ أيام»</span> ... للقفز إلى نطاق زمني شائع. أيّ تغيير على الحقول يحوّل الإعداد إلى «مخصّص» تلقائياً.</> },
          { title: "نطاق زمني دقيق", body: <>حقول التاريخ + الوقت تقبل دقّة بالدقيقة. مفيد لتشخيص حادثة محدّدة («ماذا حدث بين 02:30 و03:00 ليلة الجمعة؟»).</> },
          { title: "نافذة الساعة", body: <>المنزلق يحدّد ساعات اليوم التي تظهر فيها العمليات (مثلاً 22-06 لرصد عمليات الليل). يدعم الالتفاف حول منتصف الليل.</> },
          { title: "أيام الأسبوع", body: <>اضغط أيّاً من أزرار الأيام لتقصير العرض على أيام محدّدة. مفيد لمتابعة الأنماط الأسبوعية.</> },
          { title: "الحالات", body: <>اختر «خطأ» فقط لرؤية الإخفاقات، أو «نجاح + جزئي» للمؤشّرات الإيجابية. البحث النصّي داخل رسائل الأخطاء يكمّل التشخيص.</> },
          { title: "ترتيب وتصدير", body: <>اضغط على رأس أيّ عمود في جدول الفحوصات للترتيب تصاعدياً/تنازلياً. زرّ <span className="text-emerald-300 font-bold">«تصدير CSV»</span> يصدّر النتائج المعروضة تماماً.</> },
        ]}
      />

      {/* Filter panel */}
      {showFilters && (
        <FilterPanel
          filter={filter}
          brands={brands}
          sources={sources}
          availableSourceTypes={availableSourceTypes}
          onChange={updateFilter}
        />
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Kpi label="إجمالي الفحوصات" value={totals.runs}    icon={Activity}      color="text-blue-400" />
        <Kpi label="نجاح"            value={totals.success} icon={CheckCircle2}  color="text-emerald-400" />
        <Kpi label="فشل"             value={totals.error}   icon={XCircle}       color="text-red-400" />
        <Kpi label="فارغ"            value={totals.empty}   icon={Inbox}         color="text-neutral-400" />
        <Kpi label="عناصر مُجلبة"     value={totals.fetched} icon={Inbox}         color="text-amber-400" />
        <Kpi label="عناصر محفوظة"    value={totals.saved}   icon={CheckCircle2}  color="text-emerald-400" />
      </div>

      {/* Hour-of-day histogram */}
      <div className="zto-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-bold text-white flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            توزيع العمليات على ساعات اليوم (UTC)
          </h3>
          <span className="text-[0.6rem] text-neutral-500">{runs.length} عملية</span>
        </div>
        {runs.length === 0 ? (
          <p className="text-xs text-neutral-500 text-center py-4">لا بيانات لعرضها</p>
        ) : (
          <div className="flex items-end gap-1 h-24" dir="ltr">
            {hourHistogram.map((b) => (
              <div key={b.hour} className="flex-1 flex flex-col items-center justify-end" title={`${String(b.hour).padStart(2, "0")}:00 — ${b.runs} عملية، ${b.errors} خطأ`}>
                {b.runs > 0 ? (
                  <div className="w-full flex flex-col-reverse" style={{ height: `${b.frac * 100}%` }}>
                    {b.errors > 0 && (
                      <div className="bg-red-500" style={{ height: `${(b.errors / b.runs) * 100}%` }} />
                    )}
                    <div className="bg-blue-500/70" style={{ flex: 1 }} />
                  </div>
                ) : (
                  <div className="w-full h-px bg-neutral-800" />
                )}
                <span className={`text-[0.5rem] mt-1 font-mono ${
                  b.hour % 6 === 0 ? "text-neutral-400" : "text-neutral-700"
                }`}>
                  {b.hour % 6 === 0 ? String(b.hour).padStart(2, "0") : "·"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent runs */}
      <div className="zto-card overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
          <h3 className="text-[14px] font-bold text-white">
            الفحوصات
            <span className="mr-2 text-[0.65rem] text-neutral-500 font-normal">
              {sortedRuns.length} نتيجة
            </span>
          </h3>
        </div>
        {sortedRuns.length === 0 ? (
          <div className="p-10 text-center text-neutral-500 text-[13px]">
            {loading ? "جاري التحميل..." : "لا توجد فحوصات تطابق الفلاتر."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-[#0e0e0e] text-neutral-500">
                <tr>
                  <SortableTh label="الوقت" k="started_at" filter={filter} onClick={toggleSort} />
                  <th className="text-right px-4 py-2 font-bold">العلامة</th>
                  <th className="text-right px-4 py-2 font-bold">المصدر</th>
                  <th className="text-right px-4 py-2 font-bold">النوع</th>
                  <SortableTh label="الحالة" k="status" filter={filter} onClick={toggleSort} />
                  <SortableTh label="مُجلب" k="items_fetched" filter={filter} onClick={toggleSort} />
                  <SortableTh label="محفوظ" k="items_saved" filter={filter} onClick={toggleSort} />
                  <SortableTh label="المدة" k="duration_ms" filter={filter} onClick={toggleSort} />
                  <th className="text-right px-4 py-2 font-bold">الخطأ</th>
                </tr>
              </thead>
              <tbody>
                {sortedRuns.map((r) => {
                  const meta = STATUS_META[r.status];
                  const Icon = meta.icon;
                  const src = sourceById.get(r.source_id);
                  const brand = brandById.get(r.brand_id);
                  return (
                    <tr key={r.id} className="border-t border-neutral-800 hover:bg-[#0e0e0e]">
                      <td className="px-4 py-2 text-neutral-400 whitespace-nowrap" title={r.started_at}>
                        {new Date(r.started_at).toLocaleString("ar")}
                      </td>
                      <td className="px-4 py-2 text-white">{brand?.name || "—"}</td>
                      <td className="px-4 py-2 text-neutral-300 max-w-[200px] truncate">{src?.name || r.source_id}</td>
                      <td className="px-4 py-2 text-neutral-500">
                        {src?.type ? (SOURCE_TYPE_LABELS[src.type] ?? src.type) : "—"}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center gap-1.5 ${meta.color} ${meta.bg} px-2 py-0.5 rounded text-[11px] font-bold`}>
                          <Icon className="w-3 h-3" /> {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-neutral-300 tabular-nums">{r.items_fetched}</td>
                      <td className="px-4 py-2 text-emerald-400 font-bold tabular-nums">{r.items_saved}</td>
                      <td className="px-4 py-2 text-neutral-400 tabular-nums">{r.duration_ms ? `${r.duration_ms}ms` : "—"}</td>
                      <td className="px-4 py-2 text-red-400 max-w-[260px] truncate text-[11px]" title={r.error_message ?? ""}>
                        {r.error_message || ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────── Filter panel ───────── */

const PRESETS: Array<{ key: Preset; label: string }> = [
  { key: "today",     label: "اليوم" },
  { key: "yesterday", label: "أمس" },
  { key: "24h",       label: "آخر 24 ساعة" },
  { key: "7d",        label: "آخر 7 أيام" },
  { key: "30d",       label: "آخر 30 يوم" },
  { key: "thisMonth", label: "هذا الشهر" },
  { key: "custom",    label: "مخصّص" },
];

function FilterPanel({
  filter,
  brands,
  sources,
  availableSourceTypes,
  onChange,
}: {
  filter: Filter;
  brands: Brand[];
  sources: Source[];
  availableSourceTypes: string[];
  onChange: (patch: Partial<Filter>) => void;
}) {
  const [searchInput, setSearchInput] = useState(filter.search);
  // Debounce the text input → filter so a slow type doesn't fire 12 requests.
  useEffect(() => setSearchInput(filter.search), [filter.search]);
  useEffect(() => {
    if (searchInput === filter.search) return;
    const id = window.setTimeout(() => onChange({ search: searchInput }), 400);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const sourcesForBrand = useMemo(() => {
    if (!filter.brandId) return sources;
    return sources.filter((s) => s.brand_id === filter.brandId);
  }, [sources, filter.brandId]);

  const toggleArrayMember = <T extends string | number>(arr: T[], v: T): T[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  return (
    <div className="zto-card p-4 space-y-4">
      {/* Preset chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {PRESETS.map((p) => {
          const active = filter.preset === p.key;
          return (
            <button
              key={p.key}
              onClick={() => onChange({ preset: p.key })}
              className={`text-[0.65rem] rounded-full px-3 py-1 border transition-colors font-bold ${
                active
                  ? "bg-emerald-400/15 text-emerald-300 border-emerald-400/40"
                  : "border-neutral-800 text-neutral-400 hover:border-neutral-600"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Date range + brand */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="zto-label flex items-center gap-1.5">
            <Calendar className="w-3 h-3" /> من
          </label>
          <input
            type="datetime-local"
            value={filter.fromLocal}
            onChange={(e) => onChange({ fromLocal: e.target.value })}
            className="zto-input text-xs"
          />
        </div>
        <div>
          <label className="zto-label flex items-center gap-1.5">
            <Calendar className="w-3 h-3" /> إلى
          </label>
          <input
            type="datetime-local"
            value={filter.toLocal}
            onChange={(e) => onChange({ toLocal: e.target.value })}
            className="zto-input text-xs"
          />
        </div>
        <div>
          <label className="zto-label">العلامة</label>
          <select
            className="zto-input text-xs"
            value={filter.brandId}
            onChange={(e) => onChange({ brandId: e.target.value, sourceIds: [] })}
          >
            <option value="">جميع العلامات</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Hour-of-day window */}
      <div>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <label className="zto-label flex items-center gap-1.5 !mb-0">
            <Clock className="w-3 h-3" />
            نافذة ساعات اليوم (UTC)
          </label>
          <span className="text-[0.65rem] text-neutral-400 tabular-nums">
            {String(filter.hourFrom).padStart(2, "0")}:00 — {String(filter.hourTo).padStart(2, "0")}:59
            {filter.hourFrom > filter.hourTo && (
              <span className="text-amber-400 mr-1.5">↻ يلتفّ حول منتصف الليل</span>
            )}
            {filter.hourFrom === 0 && filter.hourTo === 23 && (
              <span className="text-neutral-600 mr-1.5">(كل الساعات)</span>
            )}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[0.55rem] text-neutral-500 mb-1">من ساعة</p>
            <input
              type="range"
              min={0}
              max={23}
              step={1}
              value={filter.hourFrom}
              onChange={(e) => onChange({ hourFrom: Number(e.target.value) })}
              className="w-full accent-amber-400"
            />
          </div>
          <div>
            <p className="text-[0.55rem] text-neutral-500 mb-1">إلى ساعة</p>
            <input
              type="range"
              min={0}
              max={23}
              step={1}
              value={filter.hourTo}
              onChange={(e) => onChange({ hourTo: Number(e.target.value) })}
              className="w-full accent-amber-400"
            />
          </div>
        </div>
      </div>

      {/* Days of week */}
      <div>
        <label className="zto-label">أيام الأسبوع</label>
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => onChange({ daysOfWeek: [] })}
            className={`text-[0.6rem] rounded-full px-2.5 py-1 border transition-colors ${
              filter.daysOfWeek.length === 0
                ? "bg-emerald-400/15 text-emerald-300 border-emerald-400/40"
                : "border-neutral-800 text-neutral-400 hover:border-neutral-600"
            }`}
          >
            الكل
          </button>
          {DAY_LABELS.map((label, idx) => {
            const active = filter.daysOfWeek.includes(idx);
            return (
              <button
                key={idx}
                onClick={() => onChange({ daysOfWeek: toggleArrayMember(filter.daysOfWeek, idx) })}
                className={`text-[0.6rem] rounded-full px-2.5 py-1 border transition-colors ${
                  active
                    ? "bg-emerald-400/15 text-emerald-300 border-emerald-400/40"
                    : "border-neutral-800 text-neutral-400 hover:border-neutral-600"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Status + source type */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="zto-label">الحالة</label>
          <div className="flex items-center gap-1 flex-wrap">
            {(Object.keys(STATUS_META) as RunStatus[]).map((s) => {
              const meta = STATUS_META[s];
              const active = filter.statuses.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => onChange({ statuses: toggleArrayMember(filter.statuses, s) })}
                  className={`text-[0.6rem] rounded-full px-2.5 py-1 border transition-colors flex items-center gap-1 ${
                    active
                      ? `${meta.bg} ${meta.color} border-current`
                      : "border-neutral-800 text-neutral-400 hover:border-neutral-600"
                  }`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="zto-label">نوع المصدر</label>
          <div className="flex items-center gap-1 flex-wrap">
            {Object.entries(SOURCE_TYPE_LABELS).map(([key, label]) => {
              const active = filter.sourceTypes.includes(key);
              const exists = availableSourceTypes.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => onChange({ sourceTypes: toggleArrayMember(filter.sourceTypes, key) })}
                  disabled={!exists}
                  className={`text-[0.6rem] rounded-full px-2.5 py-1 border transition-colors ${
                    active
                      ? "bg-blue-400/15 text-blue-300 border-blue-400/40"
                      : exists
                        ? "border-neutral-800 text-neutral-400 hover:border-neutral-600"
                        : "border-neutral-900 text-neutral-700 cursor-not-allowed"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Source multi-select */}
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1.5">
          <label className="zto-label !mb-0">المصادر</label>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onChange({ sourceIds: sourcesForBrand.map((s) => s.id) })}
              className="text-[0.6rem] text-neutral-400 hover:text-emerald-300"
            >
              تحديد الكل
            </button>
            <span className="text-neutral-700">·</span>
            <button
              onClick={() => onChange({ sourceIds: [] })}
              className="text-[0.6rem] text-neutral-400 hover:text-emerald-300"
            >
              مسح
            </button>
          </div>
        </div>
        <div className="max-h-40 overflow-y-auto bg-[#0d0d0d] border border-neutral-800 rounded-md p-2 space-y-1">
          {sourcesForBrand.length === 0 ? (
            <p className="text-[0.65rem] text-neutral-500 text-center py-3">
              {filter.brandId ? "لا مصادر لهذه العلامة" : "لا مصادر بعد"}
            </p>
          ) : (
            sourcesForBrand.map((s) => {
              const active = filter.sourceIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => onChange({ sourceIds: toggleArrayMember(filter.sourceIds, s.id) })}
                  className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded transition-colors text-right ${
                    active
                      ? "bg-emerald-400/10 text-emerald-200"
                      : "text-neutral-400 hover:bg-neutral-800/40"
                  }`}
                >
                  <span className="text-[0.65rem] truncate">{s.name}</span>
                  <span className="text-[0.55rem] text-neutral-500 font-mono shrink-0">
                    {SOURCE_TYPE_LABELS[s.type] ?? s.type}
                  </span>
                </button>
              );
            })
          )}
        </div>
        {filter.sourceIds.length > 0 && (
          <p className="text-[0.6rem] text-neutral-500 mt-1.5">
            {filter.sourceIds.length} مصدر مختار
          </p>
        )}
      </div>

      {/* Error text search */}
      <div>
        <label className="zto-label flex items-center gap-1.5">
          <Search className="w-3 h-3" />
          البحث في رسائل الخطأ
        </label>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder='مثال: "403" أو "timeout" أو "invalid token"...'
          className="zto-input text-xs"
        />
      </div>
    </div>
  );
}

/* ───────── Sortable column header ───────── */

function SortableTh({
  label,
  k,
  filter,
  onClick,
}: {
  label: string;
  k: SortKey;
  filter: Filter;
  onClick: (k: SortKey) => void;
}) {
  const active = filter.sortKey === k;
  return (
    <th
      onClick={() => onClick(k)}
      className={`text-right px-4 py-2 font-bold cursor-pointer select-none hover:text-white ${
        active ? "text-emerald-400" : ""
      }`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active &&
          (filter.sortDir === "asc" ? (
            <ArrowUp className="w-3 h-3" />
          ) : (
            <ArrowDown className="w-3 h-3" />
          ))}
      </span>
    </th>
  );
}

/* ───────── KPI tile ───────── */

function Kpi({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof BarChart3; color: string }) {
  return (
    <div className="zto-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="text-2xl font-black text-white">{value.toLocaleString("ar")}</div>
    </div>
  );
}
