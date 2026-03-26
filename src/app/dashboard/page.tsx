"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/app-store";
import {
  Database,
  RefreshCw,
  Search,
  ChevronDown,
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
  Image as ImageIcon,
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

// Map field types to icons
function getFieldIcon(type: string) {
  switch (type) {
    case "singleLineText": case "multilineText": case "richText": return Type;
    case "number": case "currency": case "percent": case "count": return Hash;
    case "date": case "dateTime": case "createdTime": case "lastModifiedTime": return Calendar;
    case "email": return Mail;
    case "phoneNumber": return Phone;
    case "url": return LinkIcon;
    case "checkbox": return CheckSquare;
    case "rating": return Star;
    case "singleSelect": case "multipleSelects": return List;
    case "multipleAttachments": return Paperclip;
    case "multipleRecordLinks": return ExternalLink;
    default: return Type;
  }
}

export default function DashboardPage() {
  const { user, addToast } = useAppStore();
  const [bases, setBases] = useState<Base[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [records, setRecords] = useState<AirtableRecord[]>([]);
  const [selectedBase, setSelectedBase] = useState<Base | null>(null);
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [basesError, setBasesError] = useState<string | null>(null);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [offset, setOffset] = useState<string | undefined>();
  const [prevOffsets, setPrevOffsets] = useState<string[]>([]);
  const [filterFormula, setFilterFormula] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [sortField, setSortField] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Edit state
  const [editingRecord, setEditingRecord] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<{ [key: string]: unknown }>({});
  const [savingRecord, setSavingRecord] = useState(false);

  // Create state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createFields, setCreateFields] = useState<{ [key: string]: unknown }>({});
  const [creatingRecord, setCreatingRecord] = useState(false);

  // Delete confirmation
  const [deletingRecord, setDeletingRecord] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Load bases
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
            setBasesError("لا توجد قواعد بيانات متاحة. تأكد من صلاحيات رمز الوصول.");
          }
        }
      })
      .catch((err) => {
        const msg = "فشل الاتصال بـ Airtable. تحقق من اتصال الإنترنت ورمز الوصول.";
        setBasesError(msg);
        addToast(msg, "error");
      })
      .finally(() => setLoading(false));
  }, [addToast]);

  // Load tables when base is selected
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

  // Load records
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
        .catch((err) => {
          const msg = "فشل تحميل السجلات. تحقق من صيغة الفلترة إذا كنت تستخدمها.";
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

  // Edit record
  const startEditing = (record: AirtableRecord) => {
    setEditingRecord(record.id);
    setEditFields({ ...record.fields });
  };

  const saveEdit = async () => {
    if (!selectedBase || !selectedTable || !editingRecord) return;
    setSavingRecord(true);
    try {
      // Only send changed fields to avoid unnecessary updates
      const originalRecord = records.find((r) => r.id === editingRecord);
      const changedFields: Record<string, unknown> = {};
      if (originalRecord) {
        for (const [key, value] of Object.entries(editFields)) {
          if (JSON.stringify(value) !== JSON.stringify(originalRecord.fields[key])) {
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
        setRecords((prev) => prev.map((r) => (r.id === editingRecord ? data.record : r)));
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

  // Create record
  const handleCreate = async () => {
    if (!selectedBase || !selectedTable) return;

    // Filter out empty values
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
        addToast(data.error || "فشل الإنشاء. تحقق من القيم المدخلة.", "error");
      }
    } catch {
      addToast("حدث خطأ أثناء الإنشاء", "error");
    } finally {
      setCreatingRecord(false);
    }
  };

  // Delete record with confirmation
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

  const renderFieldValue = (value: unknown, field: Field): React.ReactNode => {
    if (value === null || value === undefined || value === "") {
      return <span className="text-[var(--color-zto-gray-700)]">—</span>;
    }

    if (field.type === "multipleAttachments") {
      const attachments = Array.isArray(value) ? value : [];
      return (
        <div className="flex gap-1 flex-wrap">
          {attachments.map((att: { url?: string; filename?: string }, i: number) => (
            <a key={i} href={att.url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 bg-[var(--color-zto-gray-800)] text-[var(--color-accent)] rounded px-2 py-0.5 text-[0.6875rem] font-medium hover:bg-[var(--color-zto-gray-700)] transition-colors">
              <Paperclip className="w-3 h-3" />
              {att.filename || "ملف"}
            </a>
          ))}
        </div>
      );
    }

    if (field.type === "checkbox") {
      return value ? (
        <CheckSquare className="w-4 h-4 text-[var(--color-success)]" />
      ) : (
        <Square className="w-4 h-4 text-[var(--color-zto-gray-700)]" />
      );
    }

    if (field.type === "url") {
      return (
        <a href={String(value)} target="_blank" rel="noreferrer"
          className="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] text-xs font-medium flex items-center gap-1 truncate max-w-[180px]">
          <LinkIcon className="w-3 h-3 shrink-0" />
          {String(value).replace(/^https?:\/\//, "")}
        </a>
      );
    }

    if (field.type === "multipleSelects" && Array.isArray(value)) {
      return (
        <div className="flex gap-1 flex-wrap">
          {(value as string[]).map((v, i) => (
            <span key={i} className="badge-primary text-[0.6rem]">{v}</span>
          ))}
        </div>
      );
    }

    if (field.type === "singleSelect") {
      return <span className="badge-accent text-[0.6875rem]">{String(value)}</span>;
    }

    if (field.type === "multipleRecordLinks" && Array.isArray(value)) {
      return (
        <div className="flex gap-1 flex-wrap">
          {(value as string[]).map((v, i) => (
            <span key={i} className="text-[0.65rem] bg-[var(--color-zto-gray-800)] text-[var(--color-zto-gray-300)] rounded px-1.5 py-0.5 font-medium">{v}</span>
          ))}
        </div>
      );
    }

    if (field.type === "rating") {
      const rating = Number(value) || 0;
      return (
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} className={`w-3 h-3 ${i < rating ? "text-[var(--color-accent)] fill-[var(--color-accent)]" : "text-[var(--color-zto-gray-700)]"}`} />
          ))}
        </div>
      );
    }

    if (typeof value === "object" && value !== null) {
      return <span className="text-[0.65rem] text-[var(--color-zto-gray-500)] font-mono">{JSON.stringify(value)}</span>;
    }

    const strVal = String(value);
    if (strVal.length > 80) {
      return <span title={strVal} className="text-[var(--color-zto-gray-200)]">{strVal.substring(0, 80)}...</span>;
    }

    return <span className="text-[var(--color-zto-gray-200)]">{strVal}</span>;
  };

  const renderFieldInput = (field: Field, value: unknown, onChange: (val: unknown) => void) => {
    const readOnlyTypes = [
      "autoNumber", "createdTime", "lastModifiedTime", "lastModifiedBy",
      "createdBy", "count", "lookup", "rollup", "formula", "button",
      "multipleRecordLinks", "multipleLookupValues",
    ];

    if (readOnlyTypes.includes(field.type)) {
      return (
        <div className="text-xs text-[var(--color-zto-gray-600)] bg-[var(--color-zto-gray-900)] rounded-lg px-3 py-2 border border-[var(--color-zto-gray-800)]">
          {value ? (typeof value === "object" ? JSON.stringify(value) : String(value)) : "—"}
          <span className="text-[var(--color-zto-gray-700)] mr-2">(قراءة فقط)</span>
        </div>
      );
    }

    if (field.type === "checkbox") {
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-sm text-[var(--color-zto-gray-300)]">{value ? "مفعل" : "معطل"}</span>
        </label>
      );
    }

    if (field.type === "singleSelect") {
      const choices = (field.options?.choices as { name: string }[]) || [];
      return (
        <div className="relative">
          <select className="input appearance-none" value={String(value || "")} onChange={(e) => onChange(e.target.value || null)}>
            <option value="">— اختر —</option>
            {choices.map((c) => (<option key={c.name} value={c.name}>{c.name}</option>))}
          </select>
          <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-zto-gray-600)] pointer-events-none" />
        </div>
      );
    }

    if (field.type === "multipleSelects") {
      const choices = (field.options?.choices as { name: string }[]) || [];
      const selected = Array.isArray(value) ? value as string[] : [];
      return (
        <div className="space-y-1.5 max-h-32 overflow-y-auto">
          {choices.map((c) => (
            <label key={c.name} className="flex items-center gap-2 text-sm cursor-pointer text-[var(--color-zto-gray-300)]">
              <input type="checkbox" checked={selected.includes(c.name)}
                onChange={(e) => {
                  if (e.target.checked) onChange([...selected, c.name]);
                  else onChange(selected.filter((s) => s !== c.name));
                }}
                className="w-3.5 h-3.5 rounded" />
              {c.name}
            </label>
          ))}
        </div>
      );
    }

    if (field.type === "number" || field.type === "currency" || field.type === "percent" || field.type === "rating") {
      return (
        <input type="number" className="input" value={value !== null && value !== undefined ? String(value) : ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          step={field.type === "rating" ? "1" : "any"}
          min={field.type === "rating" ? "0" : undefined}
          max={field.type === "rating" ? "5" : undefined} />
      );
    }

    if (field.type === "multilineText" || field.type === "richText") {
      return <textarea className="input min-h-[80px]" value={String(value || "")} onChange={(e) => onChange(e.target.value)} />;
    }

    if (field.type === "date" || field.type === "dateTime") {
      const inputType = field.type === "dateTime" ? "datetime-local" : "date";
      return <input type={inputType} className="input" value={String(value || "")} onChange={(e) => onChange(e.target.value || null)} />;
    }

    return <input type="text" className="input" value={String(value || "")} onChange={(e) => onChange(e.target.value)} />;
  };

  const canEdit = user?.role === "admin" || user?.role === "editor";
  const canDelete = user?.role === "admin";

  return (
    <div className="space-y-6 max-w-full">
      {/* Selection bar */}
      <div className="card p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-[var(--color-accent)]" />
              القاعدة
            </label>
            <div className="relative">
              <select className="input appearance-none" value={selectedBase?.id || ""}
                onChange={(e) => {
                  const base = bases.find((b) => b.id === e.target.value);
                  setSelectedBase(base || null);
                }}
                disabled={loading}>
                <option value="">— اختر قاعدة —</option>
                {bases.map((base) => (<option key={base.id} value={base.id}>{base.name}</option>))}
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-zto-gray-600)] pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="label flex items-center gap-2">
              <Table2 className="w-3.5 h-3.5 text-[var(--color-accent)]" />
              الجدول
            </label>
            <div className="relative">
              <select className="input appearance-none" value={selectedTable?.id || ""}
                onChange={(e) => {
                  const table = tables.find((t) => t.id === e.target.value);
                  setSelectedTable(table || null);
                }}
                disabled={!selectedBase || loading}>
                <option value="">— اختر جدول —</option>
                {tables.map((table) => (<option key={table.id} value={table.id}>{table.name}</option>))}
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-zto-gray-600)] pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Error display */}
        {basesError && (
          <div className="mt-4 flex items-center gap-3 bg-[var(--color-danger-muted)] border border-[color-mix(in_srgb,var(--color-danger)_30%,transparent)] rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 text-[var(--color-danger)] shrink-0" />
            <span className="text-sm text-[var(--color-danger)] font-medium">{basesError}</span>
          </div>
        )}

        {/* Table meta + toolbar */}
        {selectedTable && (
          <div className="mt-4 pt-4 border-t border-[var(--color-zto-gray-800)]">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-[var(--color-zto-white)]">{selectedTable.name}</span>
                {selectedTable.description && (
                  <span className="text-xs text-[var(--color-zto-gray-500)]">{selectedTable.description}</span>
                )}
                <span className="badge-primary">{selectedTable.fields.length} حقل</span>
                <span className="badge-success">{records.length} سجل</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowFilter(!showFilter)} className={`btn-ghost text-xs ${showFilter ? "text-[var(--color-accent)]" : ""}`}>
                  <Filter className="w-3.5 h-3.5" />
                  فلترة
                </button>
                <button onClick={() => loadRecords()} disabled={loadingRecords} className="btn-ghost text-xs">
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingRecords ? "animate-spin" : ""}`} />
                  تحديث
                </button>
                {canEdit && (
                  <button onClick={() => { setCreateFields({}); setShowCreateModal(true); }} className="btn-accent text-xs">
                    <Plus className="w-3.5 h-3.5" />
                    سجل جديد
                  </button>
                )}
              </div>
            </div>

            {showFilter && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <Search className="w-4 h-4 text-[var(--color-zto-gray-600)] shrink-0" />
                <input type="text" className="input flex-1 min-w-[200px]" placeholder='مثال: {الاسم} = "أحمد"'
                  value={filterFormula} onChange={(e) => setFilterFormula(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") loadRecords(); }} />
                <div className="relative">
                  <select className="input w-44 appearance-none" value={sortField} onChange={(e) => setSortField(e.target.value)}>
                    <option value="">ترتيب حسب...</option>
                    {selectedTable.fields.map((f) => (<option key={f.id} value={f.name}>{f.name}</option>))}
                  </select>
                  <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-zto-gray-600)] pointer-events-none" />
                </div>
                <button onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")} className="btn-ghost text-xs">
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  {sortDir === "asc" ? "تصاعدي" : "تنازلي"}
                </button>
                <button onClick={() => loadRecords()} className="btn-primary text-xs">تطبيق</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loading state */}
      {(loading || loadingRecords) && (
        <div className="card p-16 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-zto-gray-500)]" />
          <p className="text-[var(--color-zto-gray-600)] text-xs font-bold">جاري تحميل البيانات...</p>
        </div>
      )}

      {/* Records error */}
      {recordsError && !loadingRecords && (
        <div className="card p-8 text-center">
          <AlertCircle className="w-8 h-8 text-[var(--color-danger)] mx-auto mb-3" />
          <p className="text-[var(--color-danger)] text-sm font-bold mb-2">{recordsError}</p>
          <button onClick={() => loadRecords()} className="btn-secondary text-xs">
            <RefreshCw className="w-3.5 h-3.5" />
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Records table */}
      {selectedTable && !loadingRecords && !recordsError && records.length > 0 && (
        <div className="card overflow-hidden">
          <div className="table-container">
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="px-3 py-3 text-right w-10">#</th>
                  {selectedTable.fields.map((field) => {
                    const Icon = getFieldIcon(field.type);
                    return (
                      <th key={field.id} className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Icon className="w-3 h-3 text-[var(--color-zto-gray-500)]" />
                          <span>{field.name}</span>
                        </div>
                      </th>
                    );
                  })}
                  <th className="px-4 py-3 text-right w-28">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record, idx) => (
                  <tr key={record.id} className="table-row">
                    <td className="table-cell text-[var(--color-zto-gray-600)] text-[0.65rem] font-mono">{idx + 1}</td>
                    {selectedTable.fields.map((field) => (
                      <td key={field.id} className="table-cell max-w-xs">
                        {editingRecord === record.id
                          ? renderFieldInput(field, editFields[field.name], (val) => setEditFields((prev) => ({ ...prev, [field.name]: val })))
                          : renderFieldValue(record.fields[field.name], field)
                        }
                      </td>
                    ))}
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        {editingRecord === record.id ? (
                          <>
                            <button onClick={saveEdit} disabled={savingRecord} className="btn-success text-[0.65rem] px-2 py-1">
                              {savingRecord ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                            </button>
                            <button onClick={() => setEditingRecord(null)} className="btn-ghost text-[0.65rem] px-2 py-1">
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <>
                            {canEdit && (
                              <button onClick={() => startEditing(record)} className="btn-ghost text-[0.65rem] px-2 py-1 text-[var(--color-accent)]" title="تعديل">
                                <Edit3 className="w-3 h-3" />
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={() => handleDelete(record.id)}
                                disabled={deletingRecord === record.id}
                                className={`btn-ghost text-[0.65rem] px-2 py-1 ${confirmDelete === record.id ? "text-[var(--color-danger)] bg-[var(--color-danger-muted)]" : "text-[var(--color-zto-gray-500)]"}`}
                                title={confirmDelete === record.id ? "اضغط مرة أخرى للتأكيد" : "حذف"}>
                                {deletingRecord === record.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-zto-gray-800)]">
            <span className="text-[0.6875rem] text-[var(--color-zto-gray-500)] font-bold">عرض {records.length} سجل</span>
            <div className="flex items-center gap-2">
              <button disabled={prevOffsets.length === 0} className="btn-ghost text-xs"
                onClick={() => {
                  const prev = [...prevOffsets];
                  const lastOffset = prev.pop();
                  setPrevOffsets(prev);
                  loadRecords(lastOffset);
                }}>
                <ChevronRight className="w-3.5 h-3.5" />
                السابق
              </button>
              <button disabled={!offset} className="btn-ghost text-xs"
                onClick={() => {
                  if (offset) {
                    setPrevOffsets((prev) => [...prev, offset]);
                    loadRecords(offset);
                  }
                }}>
                التالي
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {selectedTable && !loadingRecords && !recordsError && records.length === 0 && (
        <div className="card p-16 text-center">
          <Database className="w-10 h-10 text-[var(--color-zto-gray-700)] mx-auto mb-3" />
          <p className="text-[var(--color-zto-gray-500)] text-sm font-bold">لا توجد سجلات</p>
          <p className="text-[var(--color-zto-gray-600)] text-xs mt-1">هذا الجدول فارغ أو لا توجد نتائج تطابق الفلتر</p>
        </div>
      )}

      {/* No table selected */}
      {!selectedTable && !loading && (
        <div className="card p-16 text-center">
          <Table2 className="w-10 h-10 text-[var(--color-zto-gray-700)] mx-auto mb-3" />
          <p className="text-[var(--color-zto-gray-500)] text-sm font-bold">اختر قاعدة وجدول</p>
          <p className="text-[var(--color-zto-gray-600)] text-xs mt-1">حدد القاعدة والجدول من الأعلى لعرض البيانات</p>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && selectedTable && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content max-w-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-[var(--color-zto-gray-800)] flex items-center justify-between">
              <h3 className="text-base font-black text-[var(--color-zto-white)] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[var(--color-accent)]" />
                سجل جديد
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-[var(--color-zto-gray-500)] hover:text-[var(--color-zto-white)]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {selectedTable.fields.map((field) => {
                const Icon = getFieldIcon(field.type);
                return (
                  <div key={field.id}>
                    <label className="label flex items-center gap-1.5">
                      <Icon className="w-3 h-3 text-[var(--color-accent)]" />
                      {field.name}
                      <span className="text-[var(--color-zto-gray-600)] font-normal text-[0.65rem]">({field.type})</span>
                    </label>
                    {renderFieldInput(field, createFields[field.name], (val) => setCreateFields((prev) => ({ ...prev, [field.name]: val })))}
                  </div>
                );
              })}
            </div>
            <div className="p-5 border-t border-[var(--color-zto-gray-800)] flex items-center gap-3 justify-end">
              <button onClick={() => setShowCreateModal(false)} className="btn-secondary">إلغاء</button>
              <button onClick={handleCreate} disabled={creatingRecord} className="btn-accent">
                {creatingRecord ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                إنشاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
