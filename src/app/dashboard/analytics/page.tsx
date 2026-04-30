"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/app-store";
import {
  BarChart3,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Inbox,
  Clock,
  Activity,
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

interface Run {
  id: string;
  brand_id: string;
  source_id: string;
  status: "success" | "partial" | "error" | "empty" | "skipped";
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  items_fetched: number;
  items_passed: number;
  items_saved: number;
  error_message: string | null;
}

const STATUS_META = {
  success: { label: "نجاح", color: "text-emerald-400", bg: "bg-emerald-400/10", icon: CheckCircle2 },
  partial: { label: "جزئي", color: "text-amber-400", bg: "bg-amber-400/10", icon: AlertCircle },
  error: { label: "خطأ", color: "text-red-400", bg: "bg-red-400/10", icon: XCircle },
  empty: { label: "فارغ", color: "text-neutral-400", bg: "bg-neutral-400/10", icon: Inbox },
  skipped: { label: "تخطي", color: "text-neutral-500", bg: "bg-neutral-700/20", icon: Clock },
} as const;

export default function AnalyticsPage() {
  const { addToast } = useAppStore();
  const [brandId, setBrandId] = useState<string>("");
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [stats, setStats] = useState<DailyStat[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [sources, setSources] = useState<Source[]>([]);

  async function load() {
    setLoading(true);
    setConfigError(null);
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (brandId) params.set("brandId", brandId);
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

  useEffect(() => { load(); }, [brandId, days]);

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

  const totals = useMemo(() => {
    const t = { runs: 0, success: 0, error: 0, empty: 0, fetched: 0, saved: 0 };
    for (const s of stats) {
      t.runs += s.runs ?? 0;
      t.success += s.runs_success ?? 0;
      t.error += s.runs_error ?? 0;
      t.empty += s.runs_empty ?? 0;
      t.fetched += s.items_fetched ?? 0;
      t.saved += s.items_saved ?? 0;
    }
    return t;
  }, [stats]);

  if (loading && !configError) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
      </div>
    );
  }

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
          </div>
          <p className="text-[13px] text-neutral-500 mt-1">
            إحصائيات الفحص لكل علامة ومصدر.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className="zto-input !w-[160px]" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">جميع العلامات</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="zto-input !w-[120px]" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>آخر يوم</option>
            <option value={7}>آخر 7 أيام</option>
            <option value={30}>آخر 30 يوم</option>
            <option value={90}>آخر 90 يوم</option>
          </select>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Kpi label="إجمالي الفحوصات" value={totals.runs} icon={Activity} color="text-blue-400" />
        <Kpi label="نجاح" value={totals.success} icon={CheckCircle2} color="text-emerald-400" />
        <Kpi label="فشل" value={totals.error} icon={XCircle} color="text-red-400" />
        <Kpi label="فارغ" value={totals.empty} icon={Inbox} color="text-neutral-400" />
        <Kpi label="عناصر مُجلبة" value={totals.fetched} icon={Inbox} color="text-amber-400" />
        <Kpi label="عناصر محفوظة" value={totals.saved} icon={CheckCircle2} color="text-emerald-400" />
      </div>

      {/* Recent runs */}
      <div className="zto-card overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-800">
          <h3 className="text-[14px] font-bold text-white">آخر الفحوصات</h3>
        </div>
        {runs.length === 0 ? (
          <div className="p-10 text-center text-neutral-500 text-[13px]">لا توجد فحوصات بعد.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-[#0e0e0e] text-neutral-500">
                <tr>
                  <th className="text-right px-4 py-2 font-bold">الوقت</th>
                  <th className="text-right px-4 py-2 font-bold">العلامة</th>
                  <th className="text-right px-4 py-2 font-bold">المصدر</th>
                  <th className="text-right px-4 py-2 font-bold">الحالة</th>
                  <th className="text-right px-4 py-2 font-bold">مُجلب</th>
                  <th className="text-right px-4 py-2 font-bold">محفوظ</th>
                  <th className="text-right px-4 py-2 font-bold">المدة</th>
                  <th className="text-right px-4 py-2 font-bold">الخطأ</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const meta = STATUS_META[r.status];
                  const Icon = meta.icon;
                  const src = sourceById.get(r.source_id);
                  const brand = brandById.get(r.brand_id);
                  return (
                    <tr key={r.id} className="border-t border-neutral-800 hover:bg-[#0e0e0e]">
                      <td className="px-4 py-2 text-neutral-400 whitespace-nowrap">
                        {new Date(r.started_at).toLocaleString("ar")}
                      </td>
                      <td className="px-4 py-2 text-white">{brand?.name || "—"}</td>
                      <td className="px-4 py-2 text-neutral-300 max-w-[200px] truncate">{src?.name || r.source_id}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center gap-1.5 ${meta.color} ${meta.bg} px-2 py-0.5 rounded text-[11px] font-bold`}>
                          <Icon className="w-3 h-3" /> {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-neutral-300">{r.items_fetched}</td>
                      <td className="px-4 py-2 text-emerald-400 font-bold">{r.items_saved}</td>
                      <td className="px-4 py-2 text-neutral-400">{r.duration_ms ? `${r.duration_ms}ms` : "—"}</td>
                      <td className="px-4 py-2 text-red-400 max-w-[200px] truncate text-[11px]">{r.error_message || ""}</td>
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
