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
  Filter,
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
  info: { icon: Info, color: "text-blue-600 bg-blue-50", label: "معلومات" },
  warn: { icon: AlertTriangle, color: "text-amber-600 bg-amber-50", label: "تحذير" },
  error: { icon: AlertCircle, color: "text-red-600 bg-red-50", label: "خطأ" },
  debug: { icon: Bug, color: "text-gray-600 bg-gray-50", label: "تصحيح" },
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
  }, [filterLevel]);

  if (user?.role !== "admin") {
    return (
      <div className="card p-12 text-center">
        <ScrollText className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
        <p className="text-text-secondary">هذه الصفحة متاحة للمديرين فقط</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <ScrollText className="w-7 h-7 text-primary-600" />
            سجل النظام
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            متابعة جميع العمليات والأحداث في النظام
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-text-tertiary" />
            <select
              className="input w-40"
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
          <button onClick={loadLogs} disabled={loading} className="btn-secondary">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card p-12 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : logs.length === 0 ? (
        <div className="card p-12 text-center">
          <ScrollText className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
          <p className="text-text-secondary">لا توجد سجلات</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="space-y-0">
            {logs.map((log, idx) => {
              const config = LEVEL_CONFIG[log.level];
              const Icon = config.icon;
              return (
                <div
                  key={idx}
                  className={`flex items-start gap-3 px-5 py-3 border-b border-border last:border-b-0 ${
                    log.level === "error" ? "bg-red-50/30" : log.level === "warn" ? "bg-amber-50/30" : ""
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${config.color}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.color}`}>
                        {config.label}
                      </span>
                      {log.context && (
                        <span className="text-xs bg-surface-tertiary text-text-secondary px-2 py-0.5 rounded-full">
                          {log.context}
                        </span>
                      )}
                      <span className="text-xs text-text-tertiary">
                        {new Date(log.timestamp).toLocaleString("ar-SA")}
                      </span>
                    </div>
                    <p className="text-sm text-text-primary mt-1">{log.message}</p>
                    {log.details != null && (
                      <pre className="text-xs text-text-tertiary mt-1 bg-surface-tertiary rounded p-2 overflow-x-auto max-w-full">
                        {typeof log.details === "string"
                          ? log.details
                          : JSON.stringify(log.details, null, 2) as string}
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
