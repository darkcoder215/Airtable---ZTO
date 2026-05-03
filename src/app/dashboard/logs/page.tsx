"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";

interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  context?: string;
  details?: unknown;
  userId?: string;
}

const LEVEL_CONFIG = {
  info: { icon: Info, badge: "zto-badge zto-badge-info", label: "معلومات", textColor: "text-blue-400" },
  warn: { icon: AlertTriangle, badge: "zto-badge zto-badge-warn", label: "تحذير", textColor: "text-amber-400" },
  error: { icon: AlertCircle, badge: "zto-badge zto-badge-err", label: "خطأ", textColor: "text-red-400" },
  debug: { icon: Bug, badge: "zto-badge zto-badge-default", label: "تصحيح", textColor: "text-neutral-400" },
};

export default function LogsPage() {
  const { user, addToast } = useAppStore();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState<string>("");

  const loadLogs = () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (filterLevel) params.set("level", filterLevel);
    fetch(`/api/logs?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.logs) setLogs(data.logs);
        else if (data.error) addToast(data.error, "error");
      })
      .catch(() => addToast("فشل تحميل السجلات", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterLevel]);

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
            onClick={loadLogs}
            disabled={loading}
            className="zto-btn zto-btn-outline zto-btn-sm text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </button>
        </div>
      </div>

      <PageGuide
        pageName="السجلّات"
        accent="blue"
        storageKey="logs"
        intro={
          <>
            خط زمني لكل عملية جلب وفلترة وحفظ يقوم بها النظام. هنا تذهب أوّلاً عند ظهور أيّ سلوك غير متوقّع: مصدر يعطي صفر أخبار، خبر لا يصل لـAirtable، عملية فلترة طويلة... كل عملية مسجّلة بسطر مع طوابع زمنية وتفاصيل.
          </>
        }
        tips={[
          { title: "الفلترة بالمستوى", body: <>القائمة الأولى تنتقي السجلّات بحسب الأهمّية: <span className="text-amber-300">معلومات</span> (الأحداث العادية)، <span className="text-amber-300">تحذيرات</span> (شيء يستحق الانتباه)، <span className="text-red-300">أخطاء</span> (فشل فعلي يحتاج تدخّلاً).</> },
          { title: "مراحل الجلب", body: <>كل دورة جلب تكتب 5–6 أسطر بترتيب: <code className="text-amber-400 font-mono">FETCH → DEDUP → PERSIST → FILTER → AIRTABLE → DONE</code>. تتبّع المصدر بحسب اسمه لمشاهدة دورة كاملة.</> },
          { title: "تتبّع خبر معيّن", body: <>اضغط أيّ سطر لعرض البيانات الكاملة (JSON). فيها معرّف المصدر، عدد العناصر، الأخطاء الخام من Airtable إلخ — كل ما تحتاجه للتشخيص.</> },
          { title: "تنظيف السجلّات", body: <>السجلّات تُحفَظ تلقائياً (آخر 10,000 سطر). إن أردت أرشفة أو تصدير، الإجراء يتمّ من قاعدة البيانات مباشرةً عبر فريق التشغيل.</> },
        ]}
      />

      {/* Content */}
      {loading ? (
        <div className="zto-card p-16 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
        </div>
      ) : logs.length === 0 ? (
        <div className="zto-card p-16 text-center">
          <ScrollText className="w-10 h-10 text-neutral-600 mx-auto mb-3" />
          <p className="text-neutral-400 text-sm font-bold">لا توجد سجلات</p>
        </div>
      ) : (
        <div className="zto-card overflow-hidden">
          <div className="divide-y divide-neutral-800">
            {logs.map((log, idx) => {
              const config = LEVEL_CONFIG[log.level];
              const Icon = config.icon;
              const rowBg =
                log.level === "error"
                  ? "bg-red-500/5"
                  : log.level === "warn"
                    ? "bg-amber-500/5"
                    : "";

              return (
                <div key={idx} className={`flex items-start gap-3 px-5 py-3 ${rowBg}`}>
                  <div
                    className={`w-6 h-6 rounded flex items-center justify-center shrink-0 mt-0.5 ${config.textColor}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={config.badge}>{config.label}</span>
                      {log.context && (
                        <span className="zto-badge zto-badge-info">{log.context}</span>
                      )}
                      <span className="text-[0.6rem] text-neutral-500 font-mono">
                        {new Date(log.timestamp).toLocaleString("ar-SA")}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-200 mt-1 font-medium">
                      {log.message}
                    </p>
                    {log.details != null && (
                      <pre className="text-[0.65rem] text-neutral-500 mt-1.5 bg-neutral-900 border border-neutral-800 rounded p-2 overflow-x-auto max-w-full font-mono">
                        <code>
                          {typeof log.details === "string"
                            ? log.details
                            : (JSON.stringify(log.details, null, 2) as string)}
                        </code>
                      </pre>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
