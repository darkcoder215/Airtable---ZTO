"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import {
  ScrollText,
  RefreshCw,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Info,
  Bug,
  ChevronDown,
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
  info: { icon: Info, badge: "badge-info", label: "معلومات" },
  warn: { icon: AlertTriangle, badge: "badge-warning", label: "تحذير" },
  error: { icon: AlertCircle, badge: "badge-danger", label: "خطأ" },
  debug: { icon: Bug, badge: "badge-primary", label: "تصحيح" },
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

  useEffect(() => { loadLogs(); }, [filterLevel]);

  if (user?.role !== "admin") {
    return (
      <div className="card p-16 text-center">
        <Lock className="w-10 h-10 text-[var(--color-zto-gray-700)] mx-auto mb-3" />
        <p className="text-[var(--color-zto-gray-400)] text-sm font-bold">هذه الصفحة متاحة للمديرين فقط</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-[var(--color-zto-gray-500)] text-sm">متابعة جميع العمليات والأحداث</p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select className="input w-40 appearance-none text-xs" value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}>
              <option value="">جميع المستويات</option>
              <option value="info">معلومات</option>
              <option value="warn">تحذيرات</option>
              <option value="error">أخطاء</option>
              <option value="debug">تصحيح</option>
            </select>
            <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-zto-gray-600)] pointer-events-none" />
          </div>
          <button onClick={loadLogs} disabled={loading} className="btn-secondary text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card p-16 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-zto-gray-500)]" />
        </div>
      ) : logs.length === 0 ? (
        <div className="card p-16 text-center">
          <ScrollText className="w-10 h-10 text-[var(--color-zto-gray-700)] mx-auto mb-3" />
          <p className="text-[var(--color-zto-gray-500)] text-sm font-bold">لا توجد سجلات</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-[var(--color-zto-gray-800)]">
            {logs.map((log, idx) => {
              const config = LEVEL_CONFIG[log.level];
              const Icon = config.icon;
              const rowBg = log.level === "error" ? "bg-[var(--color-danger-muted)]" : log.level === "warn" ? "bg-[var(--color-warning-muted)]" : "";
              return (
                <div key={idx} className={`flex items-start gap-3 px-5 py-3 ${rowBg}`}>
                  <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 mt-0.5 ${
                    log.level === "error" ? "bg-[var(--color-danger-muted)] text-[var(--color-danger)]"
                    : log.level === "warn" ? "bg-[var(--color-warning-muted)] text-[var(--color-warning)]"
                    : log.level === "info" ? "bg-[var(--color-info-muted)] text-[var(--color-info)]"
                    : "bg-[var(--color-zto-gray-800)] text-[var(--color-zto-gray-500)]"
                  }`}>
                    <Icon className="w-3 h-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={config.badge}>{config.label}</span>
                      {log.context && <span className="badge-primary">{log.context}</span>}
                      <span className="text-[0.6rem] text-[var(--color-zto-gray-600)] font-mono">
                        {new Date(log.timestamp).toLocaleString("ar-SA")}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--color-zto-gray-200)] mt-1 font-medium">{log.message}</p>
                    {log.details != null && (
                      <pre className="text-[0.65rem] text-[var(--color-zto-gray-500)] mt-1.5 bg-[var(--color-zto-dark)] border border-[var(--color-zto-gray-800)] rounded p-2 overflow-x-auto max-w-full font-mono">
                        {typeof log.details === "string" ? log.details : JSON.stringify(log.details, null, 2) as string}
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
