"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3,
  Database,
  Tag,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Clock,
  Layers,
} from "lucide-react";

interface AnalyticsResponse {
  summary: {
    totalSources: number;
    activeSources: number;
    totalBrands: number;
    articlesInMemory: number;
    savedTotal30d: number;
    savedRecent7d: number;
    filterRunsRecent: number;
    filterTotals: { total: number; passed: number; rejected: number };
  };
  brands: {
    id: string;
    name: string;
    scrapeIntervalMinutes: number;
    sourceCount: number;
    activeSourceCount: number;
    savedRecords30d: number;
  }[];
  byType: Record<string, number>;
  sourcesTop: {
    id: string;
    name: string;
    type: string;
    brand: string;
    isActive: boolean;
    lastFetchedAt: string | null;
    savedCount30d: number;
  }[];
  recentFilters: {
    id: string;
    sourceName: string;
    timestamp: string;
    totalArticles: number;
    passedArticles: number;
    rejectedArticles: number;
  }[];
}

const TYPE_LABELS: Record<string, string> = {
  rss: "RSS",
  twitter: "X (Twitter)",
  linkedin: "LinkedIn",
  apify: "Apify",
  custom: "Custom",
};

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms)) return "—";
  const min = Math.round(ms / 60_000);
  if (min < 1) return "الآن";
  if (min < 60) return `${min} د`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} س`;
  const d = Math.round(hr / 24);
  return `${d} ي`;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const res = await fetch("/api/analytics");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
      </div>
    );
  }

  const passRate =
    data.summary.filterTotals.total > 0
      ? Math.round(
          (data.summary.filterTotals.passed / data.summary.filterTotals.total) *
            100
        )
      : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400/10 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">التحليلات</h1>
            <p className="text-xs text-neutral-500 font-bold">
              نظرة عامة على المصادر والبراندات والمحتوى المحفوظ
            </p>
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="zto-btn zto-btn-ghost"
        >
          {refreshing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          تحديث
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          icon={<Tag className="w-4 h-4 text-purple-400" />}
          label="البراندات"
          value={data.summary.totalBrands}
        />
        <SummaryCard
          icon={<Database className="w-4 h-4 text-blue-400" />}
          label="المصادر النشطة"
          value={`${data.summary.activeSources} / ${data.summary.totalSources}`}
        />
        <SummaryCard
          icon={<Layers className="w-4 h-4 text-emerald-400" />}
          label="محفوظ آخر 30 يوم"
          value={data.summary.savedTotal30d}
          sublabel={`${data.summary.savedRecent7d} هذا الأسبوع`}
        />
        <SummaryCard
          icon={<CheckCircle2 className="w-4 h-4 text-amber-400" />}
          label="نسبة قبول الفلتر"
          value={`${passRate}%`}
          sublabel={`${data.summary.filterTotals.passed} من ${data.summary.filterTotals.total}`}
        />
      </div>

      {/* Brands table */}
      <div className="zto-card">
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
          <h2 className="text-sm font-black text-white flex items-center gap-2">
            <Tag className="w-4 h-4 text-purple-400" />
            البراندات
          </h2>
          <span className="text-[11px] text-neutral-500 font-bold">
            {data.brands.length} براند
          </span>
        </div>
        {data.brands.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 text-sm">
            لم يتم إنشاء أي براند بعد. أضف براند جديد من صفحة المصادر.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] text-neutral-500 font-bold tracking-wider uppercase">
                <tr className="border-b border-neutral-800">
                  <th className="text-right p-3">الاسم</th>
                  <th className="text-right p-3">الفترة (دقيقة)</th>
                  <th className="text-right p-3">المصادر</th>
                  <th className="text-right p-3">نشط</th>
                  <th className="text-right p-3">محفوظ 30 يوم</th>
                </tr>
              </thead>
              <tbody>
                {data.brands.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b border-neutral-900 hover:bg-neutral-900/30"
                  >
                    <td className="p-3 font-bold text-white">{b.name}</td>
                    <td className="p-3 text-neutral-300">
                      {b.scrapeIntervalMinutes}
                    </td>
                    <td className="p-3 text-neutral-300">{b.sourceCount}</td>
                    <td className="p-3 text-emerald-400 font-bold">
                      {b.activeSourceCount}
                    </td>
                    <td className="p-3 text-amber-400 font-bold">
                      {b.savedRecords30d}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* By type */}
      <div className="zto-card">
        <div className="px-5 py-4 border-b border-neutral-800">
          <h2 className="text-sm font-black text-white">المصادر حسب النوع</h2>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.entries(TYPE_LABELS).map(([k, label]) => (
            <div key={k} className="bg-neutral-900/40 rounded-lg p-3">
              <div className="text-[10px] text-neutral-500 font-bold tracking-wider uppercase">
                {label}
              </div>
              <div className="text-2xl font-black text-white mt-1">
                {data.byType[k] || 0}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top sources */}
      <div className="zto-card">
        <div className="px-5 py-4 border-b border-neutral-800">
          <h2 className="text-sm font-black text-white">
            أكثر المصادر إنتاجاً (آخر 30 يوم)
          </h2>
        </div>
        {data.sourcesTop.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 text-sm">
            لا توجد بيانات محفوظة بعد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] text-neutral-500 font-bold tracking-wider uppercase">
                <tr className="border-b border-neutral-800">
                  <th className="text-right p-3">المصدر</th>
                  <th className="text-right p-3">النوع</th>
                  <th className="text-right p-3">البراند</th>
                  <th className="text-right p-3">آخر جلب</th>
                  <th className="text-right p-3">محفوظ</th>
                </tr>
              </thead>
              <tbody>
                {data.sourcesTop.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-neutral-900 hover:bg-neutral-900/30"
                  >
                    <td className="p-3 font-bold text-white truncate max-w-[260px]">
                      {s.name}
                      {!s.isActive && (
                        <span className="ml-2 text-[10px] text-red-400 font-bold">
                          [معطّل]
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-neutral-300">
                      {TYPE_LABELS[s.type] || s.type}
                    </td>
                    <td className="p-3 text-neutral-300">{s.brand}</td>
                    <td className="p-3 text-neutral-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatRelative(s.lastFetchedAt)}
                    </td>
                    <td className="p-3 text-amber-400 font-bold">
                      {s.savedCount30d}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent filter runs */}
      <div className="zto-card">
        <div className="px-5 py-4 border-b border-neutral-800">
          <h2 className="text-sm font-black text-white">
            آخر تشغيلات فلتر AI
          </h2>
        </div>
        {data.recentFilters.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 text-sm">
            لم يتم تشغيل الفلتر بعد.
          </div>
        ) : (
          <div className="divide-y divide-neutral-900">
            {data.recentFilters.map((f) => (
              <div
                key={f.id}
                className="px-5 py-3 flex items-center justify-between hover:bg-neutral-900/30"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white truncate">
                    {f.sourceName}
                  </div>
                  <div className="text-[11px] text-neutral-500 font-bold mt-0.5">
                    {new Date(f.timestamp).toLocaleString("ar")}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-bold">
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {f.passedArticles}
                  </span>
                  <span className="text-red-400 flex items-center gap-1">
                    <XCircle className="w-3 h-3" />
                    {f.rejectedArticles}
                  </span>
                  <span className="text-neutral-500">من {f.totalArticles}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sublabel,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  sublabel?: string;
}) {
  return (
    <div className="zto-card p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[10px] text-neutral-500 font-bold tracking-wider uppercase">
          {label}
        </span>
      </div>
      <div className="text-2xl font-black text-white">{value}</div>
      {sublabel && (
        <div className="text-[11px] text-neutral-500 font-bold mt-1">
          {sublabel}
        </div>
      )}
    </div>
  );
}
