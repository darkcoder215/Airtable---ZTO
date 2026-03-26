"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/app-store";
import {
  Database,
  RefreshCw,
  Search,
  Edit3,
  Plus,
  Trash2,
  Save,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
  ArrowUpDown,
  CheckSquare,
  Square,
  Link as LinkIcon,
  AlertCircle,
  Table2,
  Layers,
  Hash,
  Type,
  Calendar,
  Mail,
  Phone,
  Star,
  List,
  Paperclip,
  ExternalLink,
} from "lucide-react";

/* ────────── Types ────────── */

interface Base {
  id: string;
  name: string;
  permissionLevel: string;
}

interface TableInfo {
  id: string;
  name: string;
  description?: string;
  fields: Field[];
  primaryFieldId: string;
}

interface Field {
  id: string;
  name: string;
  type: string;
  description?: string;
  options?: Record<string, unknown>;
}

interface AirtableRecord {
  id: string;
  fields: { [key: string]: unknown };
  createdTime: string;
}

/* ────────── Helpers ────────── */

function getFieldIcon(type: string) {
  switch (type) {
    case "singleLineText":
    case "multilineText":
    case "richText":
      return Type;
    case "number":
    case "currency":
    case "percent":
    case "count":
      return Hash;
    case "date":
    case "dateTime":
    case "createdTime":
    case "lastModifiedTime":
      return Calendar;
    case "email":
      return Mail;
    case "phoneNumber":
      return Phone;
    case "url":
      return LinkIcon;
    case "checkbox":
      return CheckSquare;
    case "rating":
      return Star;
    case "singleSelect":
    case "multipleSelects":
      return List;
    case "multipleAttachments":
      return Paperclip;
    case "multipleRecordLinks":
      return ExternalLink;
    default:
      return Type;
  }
}

const READ_ONLY_TYPES = [
  "autoNumber",
  "createdTime",
  "lastModifiedTime",
  "lastModifiedBy",
  "createdBy",
  "count",
  "lookup",
  "rollup",
  "formula",
  "button",
  "multipleRecordLinks",
  "multipleLookupValues",
];

/* ────────── Component ────────── */

export default function DashboardPage() {
  const { user, addToast } = useAppStore();

  /* data */
  const [bases, setBases] = useState<Base[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [records, setRecords] = useState<AirtableRecord[]>([]);
  const [selectedBase, setSelectedBase] = useState<Base | null>(null);
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);

  /* loading / error */
  const [loading, setLoading] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [basesError, setBasesError] = useState<string | null>(null);
  const [recordsError, setRecordsError] = useState<string | null>(null);

  /* pagination */
  const [offset, setOffset] = useState<string | undefined>();
  const [prevOffsets, setPrevOffsets] = useState<string[]>([]);

  /* filter / sort */
  const [filterFormula, setFilterFormula] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [sortField, setSortField] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  /* edit */
  const [editingRecord, setEditingRecord] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<{ [key: string]: unknown }>({});
  const [savingRecord, setSavingRecord] = useState(false);

  /* create */
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createFields, setCreateFields] = useState<{ [key: string]: unknown }>(
    {}
  );
  const [creatingRecord, setCreatingRecord] = useState(false);

  /* delete */
  const [deletingRecord, setDeletingRecord] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  /* ──── Fetch bases ──── */
  useEffect(() => {
    setLoading(true);
    setBasesError(null);
    fetch("/api/airtable?action=bases")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data.error) {
          setBasesError(data.error);
          addToast(data.error, "error");
        } else if (data.bases) {
          setBases(data.bases);
          if (data.bases.length === 0) {
            setBasesError(
              "لا توجد قواعد بيانات متاحة. تأكد من صلاحيات رمز الوصول."
            );
          }
        }
      })
      .catch(() => {
        const msg =
          "فشل الاتصال بـ Airtable. تحقق من اتصال الإنترنت ورمز الوصول.";
        setBasesError(msg);
        addToast(msg, "error");
      })
      .finally(() => setLoading(false));
  }, [addToast]);

  /* ──── Fetch tables ──── */
  useEffect(() => {
    if (!selectedBase) return;
    setTables([]);
    setSelectedTable(null);
    setRecords([]);
    setRecordsError(null);
    setLoading(true);
    fetch(`/api/airtable?action=tables&baseId=${selectedBase.id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data.error) addToast(data.error, "error");
        else if (data.tables) setTables(data.tables);
      })
      .catch(() => addToast("فشل تحميل الجداول", "error"))
      .finally(() => setLoading(false));
  }, [selectedBase, addToast]);

  /* ──── Fetch records ──── */
  const loadRecords = useCallback(
    (pageOffset?: string) => {
      if (!selectedBase || !selectedTable) return;
      setLoadingRecords(true);
      setRecordsError(null);
      const params = new URLSearchParams({
        action: "records",
        baseId: selectedBase.id,
        tableId: selectedTable.id,
        pageSize: "50",
      });
      if (pageOffset) params.set("offset", pageOffset);
      if (filterFormula.trim()) params.set("filter", filterFormula.trim());
      if (sortField) {
        params.set("sortField", sortField);
        params.set("sortDir", sortDir);
      }

      fetch(`/api/airtable?${params.toString()}`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((data) => {
          if (data.error) {
            setRecordsError(data.error);
            addToast(data.error, "error");
          } else if (data.records) {
            setRecords(data.records);
            setOffset(data.offset);
          }
        })
        .catch(() => {
          const msg =
            "فشل تحميل السجلات. تحقق من صيغة الفلترة إذا كنت تستخدمها.";
          setRecordsError(msg);
          addToast(msg, "error");
        })
        .finally(() => setLoadingRecords(false));
    },
    [selectedBase, selectedTable, filterFormula, sortField, sortDir, addToast]
  );

  useEffect(() => {
    if (selectedTable) {
      setPrevOffsets([]);
      loadRecords();
    }
  }, [selectedTable, loadRecords]);

  /* ──── Edit ──── */
  const startEditing = (record: AirtableRecord) => {
    setEditingRecord(record.id);
    setEditFields({ ...record.fields });
  };

  const saveEdit = async () => {
    if (!selectedBase || !selectedTable || !editingRecord) return;
    setSavingRecord(true);
    try {
      const originalRecord = records.find((r) => r.id === editingRecord);
      const changedFields: Record<string, unknown> = {};
      if (originalRecord) {
        for (const [key, value] of Object.entries(editFields)) {
          if (
            JSON.stringify(value) !==
            JSON.stringify(originalRecord.fields[key])
          ) {
            changedFields[key] = value;
          }
        }
      }

      if (Object.keys(changedFields).length === 0) {
        setEditingRecord(null);
        addToast("لم يتم تغيير أي حقل", "info");
        return;
      }

      const res = await fetch("/api/airtable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          baseId: selectedBase.id,
          tableId: selectedTable.id,
          recordId: editingRecord,
          fields: changedFields,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRecords((prev) =>
          prev.map((r) => (r.id === editingRecord ? data.record : r))
        );
        setEditingRecord(null);
        addToast("تم حفظ التغييرات بنجاح", "success");
      } else {
        addToast(data.error || "فشل حفظ التغييرات", "error");
      }
    } catch {
      addToast("حدث خطأ أثناء الحفظ. حاول مرة أخرى.", "error");
    } finally {
      setSavingRecord(false);
    }
  };

  /* ──── Create ──── */
  const handleCreate = async () => {
    if (!selectedBase || !selectedTable) return;
    const filteredFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(createFields)) {
      if (value !== null && value !== undefined && value !== "") {
        filteredFields[key] = value;
      }
    }
    if (Object.keys(filteredFields).length === 0) {
      addToast("أدخل قيمة واحدة على الأقل", "warning");
      return;
    }
    setCreatingRecord(true);
    try {
      const res = await fetch("/api/airtable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          baseId: selectedBase.id,
          tableId: selectedTable.id,
          fields: filteredFields,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRecords((prev) => [data.record, ...prev]);
        setShowCreateModal(false);
        setCreateFields({});
        addToast("تم إنشاء السجل بنجاح", "success");
      } else {
        addToast(
          data.error || "فشل الإنشاء. تحقق من القيم المدخلة.",
          "error"
        );
      }
    } catch {
      addToast("حدث خطأ أثناء الإنشاء", "error");
    } finally {
      setCreatingRecord(false);
    }
  };

  /* ──── Delete ──── */
  const handleDelete = async (recordId: string) => {
    if (confirmDelete !== recordId) {
      setConfirmDelete(recordId);
      return;
    }
    if (!selectedBase || !selectedTable) return;
    setDeletingRecord(recordId);
    try {
      const res = await fetch("/api/airtable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          baseId: selectedBase.id,
          tableId: selectedTable.id,
          recordId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRecords((prev) => prev.filter((r) => r.id !== recordId));
        addToast("تم حذف السجل", "success");
      } else {
        addToast(data.error || "فشل الحذف", "error");
      }
    } catch {
      addToast("حدث خطأ أثناء الحذف", "error");
    } finally {
      setDeletingRecord(null);
      setConfirmDelete(null);
    }
  };

  /* ──── Render helpers ──── */

  const renderFieldValue = (
    value: unknown,
    field: Field
  ): React.ReactNode => {
    if (value === null || value === undefined || value === "") {
      return <span className="text-neutral-600">—</span>;
    }

    if (field.type === "multipleAttachments") {
      const attachments = Array.isArray(value) ? value : [];
      return (
        <div className="flex gap-1 flex-wrap">
          {attachments.map(
            (att: { url?: string; filename?: string }, i: number) => (
              <a
                key={i}
                href={att.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 bg-[#232323] text-amber-400 rounded px-2 py-0.5 text-[11px] font-medium hover:bg-[#2e2e2e] transition-colors"
              >
                <Paperclip className="w-3 h-3" />
                {att.filename || "ملف"}
              </a>
            )
          )}
        </div>
      );
    }

    if (field.type === "checkbox") {
      return value ? (
        <CheckSquare className="w-4 h-4 text-emerald-400" />
      ) : (
        <Square className="w-4 h-4 text-neutral-600" />
      );
    }

    if (field.type === "url") {
      return (
        <a
          href={String(value)}
          target="_blank"
          rel="noreferrer"
          className="text-amber-400 hover:text-amber-300 text-[13px] font-medium inline-flex items-center gap-1 truncate max-w-[180px]"
        >
          <LinkIcon className="w-3 h-3 shrink-0" />
          {String(value).replace(/^https?:\/\//, "")}
        </a>
      );
    }

    if (field.type === "multipleSelects" && Array.isArray(value)) {
      return (
        <div className="flex gap-1 flex-wrap">
          {(value as string[]).map((v, i) => (
            <span key={i} className="zto-badge zto-badge-default">
              {v}
            </span>
          ))}
        </div>
      );
    }

    if (field.type === "singleSelect") {
      return (
        <span className="zto-badge zto-badge-gold">{String(value)}</span>
      );
    }

    if (field.type === "multipleRecordLinks" && Array.isArray(value)) {
      return (
        <div className="flex gap-1 flex-wrap">
          {(value as string[]).map((v, i) => (
            <span key={i} className="zto-badge zto-badge-info">
              {v}
            </span>
          ))}
        </div>
      );
    }

    if (field.type === "rating") {
      const rating = Number(value) || 0;
      return (
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Star
              key={i}
              className={`w-3.5 h-3.5 ${
                i < rating
                  ? "text-amber-400 fill-amber-400"
                  : "text-neutral-700"
              }`}
            />
          ))}
        </div>
      );
    }

    if (typeof value === "object" && value !== null) {
      return (
        <span className="text-[11px] text-neutral-500 font-mono break-all">
          {JSON.stringify(value)}
        </span>
      );
    }

    const strVal = String(value);
    if (strVal.length > 80) {
      return (
        <span title={strVal} className="text-neutral-200">
          {strVal.substring(0, 80)}...
        </span>
      );
    }
    return <span className="text-neutral-200">{strVal}</span>;
  };

  const renderFieldInput = (
    field: Field,
    value: unknown,
    onChange: (val: unknown) => void
  ) => {
    if (READ_ONLY_TYPES.includes(field.type)) {
      return (
        <div className="text-[13px] text-neutral-500 bg-[#111] rounded-lg px-3 py-2.5 border border-[#3a3a3a]">
          {value
            ? typeof value === "object"
              ? JSON.stringify(value)
              : String(value)
            : "—"}
          <span className="text-neutral-600 mr-2">(قراءة فقط)</span>
        </div>
      );
    }

    if (field.type === "checkbox") {
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 rounded"
          />
          <span className="text-[13px] text-neutral-300">
            {value ? "مفعل" : "معطل"}
          </span>
        </label>
      );
    }

    if (field.type === "singleSelect") {
      const choices = (field.options?.choices as { name: string }[]) || [];
      return (
        <div className="zto-select-wrap">
          <select
            className="zto-input"
            value={String(value || "")}
            onChange={(e) => onChange(e.target.value || null)}
          >
            <option value="">— اختر —</option>
            {choices.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field.type === "multipleSelects") {
      const choices = (field.options?.choices as { name: string }[]) || [];
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-1.5 max-h-32 overflow-y-auto">
          {choices.map((c) => (
            <label
              key={c.name}
              className="flex items-center gap-2 text-[13px] cursor-pointer text-neutral-300"
            >
              <input
                type="checkbox"
                checked={selected.includes(c.name)}
                onChange={(e) => {
                  if (e.target.checked) onChange([...selected, c.name]);
                  else onChange(selected.filter((s) => s !== c.name));
                }}
                className="w-3.5 h-3.5 rounded"
              />
              {c.name}
            </label>
          ))}
        </div>
      );
    }

    if (
      field.type === "number" ||
      field.type === "currency" ||
      field.type === "percent" ||
      field.type === "rating"
    ) {
      return (
        <input
          type="number"
          className="zto-input"
          value={
            value !== null && value !== undefined ? String(value) : ""
          }
          onChange={(e) =>
            onChange(e.target.value ? Number(e.target.value) : null)
          }
          step={field.type === "rating" ? "1" : "any"}
          min={field.type === "rating" ? "0" : undefined}
          max={field.type === "rating" ? "5" : undefined}
        />
      );
    }

    if (field.type === "multilineText" || field.type === "richText") {
      return (
        <textarea
          className="zto-input min-h-[80px]"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }

    if (field.type === "date" || field.type === "dateTime") {
      const inputType = field.type === "dateTime" ? "datetime-local" : "date";
      return (
        <input
          type={inputType}
          className="zto-input"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    }

    return (
      <input
        type="text"
        className="zto-input"
        value={String(value || "")}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  };

  const canEdit = user?.role === "admin" || user?.role === "editor";
  const canDelete = user?.role === "admin";

  /* ──────────────────── JSX ──────────────────── */

  return (
    <div className="space-y-5 max-w-full">
      {/* ── Selection bar ── */}
      <div className="zto-card p-5">
        <h2 className="text-right text-[14px] font-bold text-white mb-4 flex items-center gap-2">
          <Database className="w-4 h-4 text-amber-400" />
          اختيار البيانات
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Base selector */}
          <div>
            <label className="zto-label flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              القاعدة
            </label>
            <div className="zto-select-wrap">
              <select
                className="zto-input"
                value={selectedBase?.id || ""}
                onChange={(e) => {
                  const base = bases.find((b) => b.id === e.target.value);
                  setSelectedBase(base || null);
                }}
                disabled={loading}
              >
                <option value="">— اختر قاعدة —</option>
                {bases.map((base) => (
                  <option key={base.id} value={base.id}>
                    {base.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Table selector */}
          <div>
            <label className="zto-label flex items-center gap-2">
              <Table2 className="w-3.5 h-3.5 text-amber-400" />
              الجدول
            </label>
            <div className="zto-select-wrap">
              <select
                className="zto-input"
                value={selectedTable?.id || ""}
                onChange={(e) => {
                  const table = tables.find((t) => t.id === e.target.value);
                  setSelectedTable(table || null);
                }}
                disabled={!selectedBase || loading}
              >
                <option value="">— اختر جدول —</option>
                {tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Bases error */}
        {basesError && (
          <div className="zto-alert zto-alert-err mt-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{basesError}</span>
            <button
              onClick={() => window.location.reload()}
              className="zto-btn zto-btn-ghost zto-btn-sm mr-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* Toolbar when table is selected */}
        {selectedTable && (
          <div className="mt-4 pt-4 border-t border-[#3a3a3a]">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className="text-[14px] font-bold text-white">
                  {selectedTable.name}
                </span>
                {selectedTable.description && (
                  <span className="text-[13px] text-neutral-500">
                    {selectedTable.description}
                  </span>
                )}
                <span className="zto-badge zto-badge-default">
                  {selectedTable.fields.length} حقل
                </span>
                <span className="zto-badge zto-badge-ok">
                  {records.length} سجل
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFilter(!showFilter)}
                  className={`zto-btn zto-btn-ghost zto-btn-sm ${
                    showFilter ? "text-amber-400" : ""
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  فلترة
                </button>
                <button
                  onClick={() => loadRecords()}
                  disabled={loadingRecords}
                  className="zto-btn zto-btn-ghost zto-btn-sm"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      loadingRecords ? "animate-spin" : ""
                    }`}
                  />
                  تحديث
                </button>
                {canEdit && (
                  <button
                    onClick={() => {
                      setCreateFields({});
                      setShowCreateModal(true);
                    }}
                    className="zto-btn zto-btn-gold zto-btn-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    سجل جديد
                  </button>
                )}
              </div>
            </div>

            {/* Filter row */}
            {showFilter && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-neutral-500 shrink-0" />
                  <input
                    type="text"
                    className="zto-input"
                    placeholder='مثال: {الاسم} = "أحمد"'
                    value={filterFormula}
                    onChange={(e) => setFilterFormula(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") loadRecords();
                    }}
                  />
                </div>
                <div className="zto-select-wrap w-44">
                  <select
                    className="zto-input"
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value)}
                  >
                    <option value="">ترتيب حسب...</option>
                    {selectedTable.fields.map((f) => (
                      <option key={f.id} value={f.name}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() =>
                    setSortDir(sortDir === "asc" ? "desc" : "asc")
                  }
                  className="zto-btn zto-btn-ghost zto-btn-sm"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  {sortDir === "asc" ? "تصاعدي" : "تنازلي"}
                </button>
                <button
                  onClick={() => loadRecords()}
                  className="zto-btn zto-btn-gold zto-btn-sm"
                >
                  تطبيق
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Loading ── */}
      {(loading || loadingRecords) && (
        <div className="zto-card p-16 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
          <p className="text-neutral-500 text-[13px] font-bold">
            جاري تحميل البيانات...
          </p>
        </div>
      )}

      {/* ── Records error ── */}
      {recordsError && !loadingRecords && (
        <div className="zto-card p-10 flex flex-col items-center justify-center gap-3 text-center">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <p className="text-red-400 text-[14px] font-bold">{recordsError}</p>
          <button
            onClick={() => loadRecords()}
            className="zto-btn zto-btn-outline zto-btn-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* ── Records table ── */}
      {selectedTable &&
        !loadingRecords &&
        !recordsError &&
        records.length > 0 && (
          <div className="zto-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="zto-th w-12">#</th>
                    {selectedTable.fields.map((field) => {
                      const Icon = getFieldIcon(field.type);
                      return (
                        <th key={field.id} className="zto-th">
                          <div className="flex items-center gap-1.5">
                            <Icon className="w-3 h-3 text-neutral-500" />
                            <span>{field.name}</span>
                          </div>
                        </th>
                      );
                    })}
                    {(canEdit || canDelete) && (
                      <th className="zto-th w-28">إجراءات</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {records.map((record, idx) => (
                    <tr key={record.id} className="zto-tr">
                      <td className="zto-td text-neutral-600 text-[11px] font-mono">
                        {idx + 1}
                      </td>
                      {selectedTable.fields.map((field) => (
                        <td
                          key={field.id}
                          className="zto-td max-w-xs"
                        >
                          {editingRecord === record.id
                            ? renderFieldInput(
                                field,
                                editFields[field.name],
                                (val) =>
                                  setEditFields((prev) => ({
                                    ...prev,
                                    [field.name]: val,
                                  }))
                              )
                            : renderFieldValue(
                                record.fields[field.name],
                                field
                              )}
                        </td>
                      ))}
                      {(canEdit || canDelete) && (
                        <td className="zto-td">
                          <div className="flex items-center gap-1">
                            {editingRecord === record.id ? (
                              <>
                                <button
                                  onClick={saveEdit}
                                  disabled={savingRecord}
                                  className="zto-btn zto-btn-ok zto-btn-sm"
                                  style={{ padding: "4px 8px" }}
                                >
                                  {savingRecord ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Save className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  onClick={() => setEditingRecord(null)}
                                  className="zto-btn zto-btn-ghost zto-btn-sm"
                                  style={{ padding: "4px 8px" }}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                {canEdit && (
                                  <button
                                    onClick={() => startEditing(record)}
                                    className="zto-btn zto-btn-ghost zto-btn-sm text-amber-400"
                                    style={{ padding: "4px 8px" }}
                                    title="تعديل"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    onClick={() => handleDelete(record.id)}
                                    disabled={deletingRecord === record.id}
                                    className={`zto-btn zto-btn-ghost zto-btn-sm ${
                                      confirmDelete === record.id
                                        ? "text-red-400 bg-red-400/10"
                                        : "text-neutral-500"
                                    }`}
                                    style={{ padding: "4px 8px" }}
                                    title={
                                      confirmDelete === record.id
                                        ? "اضغط مرة أخرى للتأكيد"
                                        : "حذف"
                                    }
                                  >
                                    {deletingRecord === record.id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-[#3a3a3a]">
              <span className="text-[11px] text-neutral-500 font-bold">
                عرض {records.length} سجل
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={prevOffsets.length === 0}
                  className="zto-btn zto-btn-ghost zto-btn-sm"
                  onClick={() => {
                    const prev = [...prevOffsets];
                    const lastOffset = prev.pop();
                    setPrevOffsets(prev);
                    loadRecords(lastOffset);
                  }}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  السابق
                </button>
                <button
                  disabled={!offset}
                  className="zto-btn zto-btn-ghost zto-btn-sm"
                  onClick={() => {
                    if (offset) {
                      setPrevOffsets((prev) => [...prev, offset]);
                      loadRecords(offset);
                    }
                  }}
                >
                  التالي
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

      {/* ── Empty state ── */}
      {selectedTable &&
        !loadingRecords &&
        !recordsError &&
        records.length === 0 && (
          <div className="zto-card p-16 flex flex-col items-center justify-center text-center">
            <Database className="w-10 h-10 text-neutral-700 mb-3" />
            <p className="text-neutral-400 text-[14px] font-bold">
              لا توجد سجلات
            </p>
            <p className="text-neutral-600 text-[13px] mt-1">
              هذا الجدول فارغ أو لا توجد نتائج تطابق الفلتر
            </p>
          </div>
        )}

      {/* ── No table selected ── */}
      {!selectedTable && !loading && (
        <div className="zto-card p-16 flex flex-col items-center justify-center text-center">
          <Table2 className="w-10 h-10 text-neutral-700 mb-3" />
          <p className="text-neutral-400 text-[14px] font-bold">
            اختر قاعدة وجدول
          </p>
          <p className="text-neutral-600 text-[13px] mt-1">
            حدد القاعدة والجدول من الأعلى لعرض البيانات
          </p>
        </div>
      )}

      {/* ── Create modal ── */}
      {showCreateModal && selectedTable && (
        <div
          className="zto-overlay"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="zto-modal max-w-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-[#3a3a3a] flex items-center justify-between">
              <h3 className="text-[14px] font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" />
                سجل جديد
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="zto-btn zto-btn-ghost zto-btn-sm"
                style={{ padding: "4px" }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Fields */}
            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {selectedTable.fields.map((field) => {
                const Icon = getFieldIcon(field.type);
                return (
                  <div key={field.id}>
                    <label className="zto-label flex items-center gap-1.5">
                      <Icon className="w-3 h-3 text-amber-400" />
                      {field.name}
                      <span className="text-neutral-600 font-normal text-[11px]">
                        ({field.type})
                      </span>
                    </label>
                    {renderFieldInput(
                      field,
                      createFields[field.name],
                      (val) =>
                        setCreateFields((prev) => ({
                          ...prev,
                          [field.name]: val,
                        }))
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-[#3a3a3a] flex items-center gap-3 justify-start">
              <button
                onClick={handleCreate}
                disabled={creatingRecord}
                className="zto-btn zto-btn-gold"
              >
                {creatingRecord ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                إنشاء
              </button>
              <button
                onClick={() => setShowCreateModal(false)}
                className="zto-btn zto-btn-outline"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
