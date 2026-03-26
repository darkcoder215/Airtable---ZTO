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

function getFieldTypeColor(type: string): string {
  switch (type) {
    case "singleLineText":
    case "multilineText":
    case "richText":
      return "text-blue-400";
    case "number":
    case "currency":
    case "percent":
    case "count":
    case "autoNumber":
      return "text-orange-400";
    case "date":
    case "dateTime":
    case "createdTime":
    case "lastModifiedTime":
      return "text-cyan-400";
    case "email":
      return "text-pink-400";
    case "phoneNumber":
      return "text-green-400";
    case "url":
      return "text-violet-400";
    case "checkbox":
      return "text-emerald-400";
    case "rating":
      return "text-amber-400";
    case "singleSelect":
    case "multipleSelects":
      return "text-purple-400";
    case "multipleAttachments":
      return "text-rose-400";
    case "multipleRecordLinks":
    case "multipleLookupValues":
      return "text-teal-400";
    case "formula":
    case "rollup":
    case "lookup":
      return "text-neutral-400";
    default:
      return "text-neutral-500";
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
  const [quickSearch, setQuickSearch] = useState("");

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

  /* linked record names */
  const [linkedNames, setLinkedNames] = useState<Record<string, string>>({});

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
            if (data.linkedRecordNames) {
              setLinkedNames((prev) => ({ ...prev, ...data.linkedRecordNames }));
            }
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
              {linkedNames[v] || v}
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

  /* ──── Quick search filter (client-side) ──── */
  const filteredRecords = quickSearch.trim()
    ? records.filter((r) =>
        Object.values(r.fields).some((v) => {
          if (v === null || v === undefined) return false;
          if (Array.isArray(v))
            return v.some((item) =>
              String(linkedNames[item] || item)
                .toLowerCase()
                .includes(quickSearch.toLowerCase())
            );
          return String(v).toLowerCase().includes(quickSearch.toLowerCase());
        })
      )
    : records;

  /* ──────────────────── JSX ──────────────────── */

  return (
    <div className="space-y-0 max-w-full">
      {/* ── Base selector row ── */}
      <div className="flex items-center gap-3 mb-4">
        <Database className="w-5 h-5 text-amber-400 shrink-0" />
        <div className="zto-select-wrap w-64">
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
        {loading && <Loader2 className="w-4 h-4 animate-spin text-amber-400" />}
      </div>

      {/* Bases error */}
      {basesError && (
        <div className="zto-alert zto-alert-err mb-4">
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

      {/* ── Table Tabs ── */}
      {selectedBase && tables.length > 0 && (
        <div className="flex items-center gap-0 border-b-2 border-neutral-800 mb-0 overflow-x-auto">
          {tables.map((table) => (
            <button
              key={table.id}
              onClick={() => setSelectedTable(table)}
              className={`px-5 py-2.5 text-[13px] font-bold whitespace-nowrap border-b-2 -mb-[2px] transition-colors ${
                selectedTable?.id === table.id
                  ? "border-amber-400 text-amber-400 bg-amber-400/5"
                  : "border-transparent text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.02]"
              }`}
            >
              {table.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Toolbar ── */}
      {selectedTable && (
        <div className="bg-[#141414] border border-neutral-800 border-t-0 rounded-b-xl px-4 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Quick search */}
            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                className="zto-input pr-9 text-[13px]"
                placeholder="بحث سريع..."
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
              />
            </div>

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilter(!showFilter)}
              className={`zto-btn zto-btn-ghost zto-btn-sm ${
                showFilter || filterFormula ? "text-amber-400" : ""
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              فلتر
            </button>

            {/* Sort */}
            <div className="zto-select-wrap w-36">
              <select
                className="zto-input text-[12px]"
                value={sortField}
                onChange={(e) => {
                  setSortField(e.target.value);
                  loadRecords();
                }}
              >
                <option value="">ترتيب حسب...</option>
                {selectedTable.fields.map((f) => (
                  <option key={f.id} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            {sortField && (
              <button
                onClick={() => {
                  setSortDir(sortDir === "asc" ? "desc" : "asc");
                  loadRecords();
                }}
                className="zto-btn zto-btn-ghost zto-btn-sm"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                {sortDir === "asc" ? "↑" : "↓"}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-neutral-500 font-bold">
              {filteredRecords.length} سجل
            </span>
            <button
              onClick={() => loadRecords()}
              disabled={loadingRecords}
              className="zto-btn zto-btn-ghost zto-btn-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingRecords ? "animate-spin" : ""}`} />
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
      )}

      {/* ── Advanced filter row ── */}
      {showFilter && selectedTable && (
        <div className="bg-[#111] border border-neutral-800 border-t-0 px-4 py-3 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-neutral-500 font-bold shrink-0">Airtable Formula:</span>
          <input
            type="text"
            className="zto-input flex-1 text-[13px] font-mono"
            placeholder='مثال: {Status} = "Published"'
            value={filterFormula}
            onChange={(e) => setFilterFormula(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") loadRecords();
            }}
          />
          <button onClick={() => loadRecords()} className="zto-btn zto-btn-gold zto-btn-sm">
            تطبيق
          </button>
          {filterFormula && (
            <button
              onClick={() => {
                setFilterFormula("");
                loadRecords();
              }}
              className="zto-btn zto-btn-ghost zto-btn-sm text-red-400"
            >
              <X className="w-3 h-3" />
              مسح
            </button>
          )}
        </div>
      )}

      {/* ── Loading ── */}
      {(loading || loadingRecords) && (
        <div className="bg-[#111] border border-neutral-800 rounded-b-xl p-16 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
          <p className="text-neutral-500 text-[13px] font-bold">جاري تحميل البيانات...</p>
        </div>
      )}

      {/* ── Records error ── */}
      {recordsError && !loadingRecords && (
        <div className="zto-card p-10 flex flex-col items-center justify-center gap-3 text-center mt-4">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <p className="text-red-400 text-[14px] font-bold">{recordsError}</p>
          <button onClick={() => loadRecords()} className="zto-btn zto-btn-outline zto-btn-sm">
            <RefreshCw className="w-3.5 h-3.5" />
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* ── Records table ── */}
      {selectedTable && !loadingRecords && !recordsError && filteredRecords.length > 0 && (
        <div className="border border-neutral-800 border-t-0 rounded-b-xl overflow-hidden bg-[#0d0d0d]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#161616]">
                  <th className="px-3 py-3 text-[11px] font-bold text-neutral-400 text-right border-b-2 border-neutral-700 w-12">
                    #
                  </th>
                  {selectedTable.fields.map((field) => {
                    const Icon = getFieldIcon(field.type);
                    const typeColor = getFieldTypeColor(field.type);
                    return (
                      <th
                        key={field.id}
                        className="px-4 py-3 text-[11px] font-bold text-neutral-400 text-right border-b-2 border-neutral-700 border-r border-neutral-800 whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <Icon className={`w-3.5 h-3.5 ${typeColor} shrink-0`} />
                          <span>{field.name}</span>
                        </div>
                      </th>
                    );
                  })}
                  {(canEdit || canDelete) && (
                    <th className="px-3 py-3 text-[11px] font-bold text-neutral-400 text-right border-b-2 border-neutral-700 w-24">
                      إجراءات
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record, idx) => (
                  <tr
                    key={record.id}
                    className="border-b border-neutral-700/80 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-3 py-3 text-neutral-600 text-[11px] font-mono border-r border-neutral-800">
                      {idx + 1}
                    </td>
                    {selectedTable.fields.map((field) => (
                      <td
                        key={field.id}
                        className="px-4 py-3 text-[13px] max-w-xs border-r border-neutral-800/60"
                      >
                        {editingRecord === record.id
                          ? renderFieldInput(field, editFields[field.name], (val) =>
                              setEditFields((prev) => ({ ...prev, [field.name]: val }))
                            )
                          : renderFieldValue(record.fields[field.name], field)}
                      </td>
                    ))}
                    {(canEdit || canDelete) && (
                      <td className="px-3 py-3">
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
                                    confirmDelete === record.id ? "اضغط مرة أخرى للتأكيد" : "حذف"
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
          <div className="flex items-center justify-between px-4 py-3 border-t-2 border-neutral-700 bg-[#141414]">
            <span className="text-[11px] text-neutral-500 font-bold">
              عرض {filteredRecords.length} سجل
              {quickSearch && filteredRecords.length !== records.length && (
                <span className="text-neutral-600"> (من {records.length})</span>
              )}
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
      {selectedTable && !loadingRecords && !recordsError && filteredRecords.length === 0 && (
        <div className="border border-neutral-800 border-t-0 rounded-b-xl p-16 flex flex-col items-center justify-center text-center bg-[#0d0d0d]">
          <Database className="w-10 h-10 text-neutral-700 mb-3" />
          <p className="text-neutral-400 text-[14px] font-bold">
            {quickSearch ? "لا توجد نتائج للبحث" : "لا توجد سجلات"}
          </p>
          <p className="text-neutral-600 text-[13px] mt-1">
            {quickSearch
              ? "جرّب كلمة بحث مختلفة"
              : "هذا الجدول فارغ أو لا توجد نتائج تطابق الفلتر"}
          </p>
        </div>
      )}

      {/* ── No table selected ── */}
      {!selectedTable && !loading && selectedBase && tables.length > 0 && (
        <div className="zto-card p-16 flex flex-col items-center justify-center text-center mt-4">
          <Table2 className="w-10 h-10 text-neutral-700 mb-3" />
          <p className="text-neutral-400 text-[14px] font-bold">اختر جدول من الأعلى</p>
        </div>
      )}

      {!selectedBase && !loading && (
        <div className="zto-card p-16 flex flex-col items-center justify-center text-center">
          <Layers className="w-10 h-10 text-neutral-700 mb-3" />
          <p className="text-neutral-400 text-[14px] font-bold">اختر قاعدة بيانات</p>
          <p className="text-neutral-600 text-[13px] mt-1">حدد القاعدة من القائمة أعلاه للبدء</p>
        </div>
      )}

      {/* ── Create modal ── */}
      {showCreateModal && selectedTable && (
        <div className="zto-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="zto-modal max-w-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-[#3a3a3a] flex items-center justify-between">
              <h3 className="text-[14px] font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" />
                سجل جديد في {selectedTable.name}
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-neutral-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {selectedTable.fields.map((field) => {
                const Icon = getFieldIcon(field.type);
                const typeColor = getFieldTypeColor(field.type);
                return (
                  <div key={field.id}>
                    <label className="zto-label flex items-center gap-1.5">
                      <Icon className={`w-3 h-3 ${typeColor}`} />
                      {field.name}
                      <span className="text-neutral-600 font-normal text-[11px]">({field.type})</span>
                    </label>
                    {renderFieldInput(field, createFields[field.name], (val) =>
                      setCreateFields((prev) => ({ ...prev, [field.name]: val }))
                    )}
                  </div>
                );
              })}
            </div>
            <div className="p-5 border-t border-[#3a3a3a] flex items-center gap-3 justify-start">
              <button onClick={handleCreate} disabled={creatingRecord} className="zto-btn zto-btn-gold">
                {creatingRecord ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                إنشاء
              </button>
              <button onClick={() => setShowCreateModal(false)} className="zto-btn zto-btn-outline">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
