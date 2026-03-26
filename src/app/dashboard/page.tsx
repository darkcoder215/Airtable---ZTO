"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/app-store";
import {
  Database,
  Table,
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
  ExternalLink,
  Image as ImageIcon,
  CheckSquare,
  Link as LinkIcon,
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

export default function DashboardPage() {
  const { user, addToast } = useAppStore();
  const [bases, setBases] = useState<Base[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [records, setRecords] = useState<AirtableRecord[]>([]);
  const [selectedBase, setSelectedBase] = useState<Base | null>(null);
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
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

  // Delete state
  const [deletingRecord, setDeletingRecord] = useState<string | null>(null);

  // Load bases
  useEffect(() => {
    setLoading(true);
    fetch("/api/airtable?action=bases")
      .then((r) => r.json())
      .then((data) => {
        if (data.bases) setBases(data.bases);
        else if (data.error) addToast(data.error, "error");
      })
      .catch(() => addToast("فشل تحميل القواعد", "error"))
      .finally(() => setLoading(false));
  }, [addToast]);

  // Load tables when base is selected
  useEffect(() => {
    if (!selectedBase) return;
    setTables([]);
    setSelectedTable(null);
    setRecords([]);
    setLoading(true);
    fetch(`/api/airtable?action=tables&baseId=${selectedBase.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.tables) setTables(data.tables);
        else if (data.error) addToast(data.error, "error");
      })
      .catch(() => addToast("فشل تحميل الجداول", "error"))
      .finally(() => setLoading(false));
  }, [selectedBase, addToast]);

  // Load records when table is selected
  const loadRecords = useCallback(
    (pageOffset?: string) => {
      if (!selectedBase || !selectedTable) return;
      setLoadingRecords(true);
      const params = new URLSearchParams({
        action: "records",
        baseId: selectedBase.id,
        tableId: selectedTable.id,
        pageSize: "50",
      });
      if (pageOffset) params.set("offset", pageOffset);
      if (filterFormula) params.set("filter", filterFormula);
      if (sortField) {
        params.set("sortField", sortField);
        params.set("sortDir", sortDir);
      }

      fetch(`/api/airtable?${params.toString()}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.records) {
            setRecords(data.records);
            setOffset(data.offset);
          } else if (data.error) {
            addToast(data.error, "error");
          }
        })
        .catch(() => addToast("فشل تحميل السجلات", "error"))
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
      const res = await fetch("/api/airtable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          baseId: selectedBase.id,
          tableId: selectedTable.id,
          recordId: editingRecord,
          fields: editFields,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRecords((prev) => prev.map((r) => (r.id === editingRecord ? data.record : r)));
        setEditingRecord(null);
        addToast("تم تحديث السجل بنجاح", "success");
      } else {
        addToast(data.error || "فشل التحديث", "error");
      }
    } catch {
      addToast("حدث خطأ أثناء الحفظ", "error");
    } finally {
      setSavingRecord(false);
    }
  };

  // Create record
  const handleCreate = async () => {
    if (!selectedBase || !selectedTable) return;
    setCreatingRecord(true);
    try {
      const res = await fetch("/api/airtable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          baseId: selectedBase.id,
          tableId: selectedTable.id,
          fields: createFields,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRecords((prev) => [data.record, ...prev]);
        setShowCreateModal(false);
        setCreateFields({});
        addToast("تم إنشاء السجل بنجاح", "success");
      } else {
        addToast(data.error || "فشل الإنشاء", "error");
      }
    } catch {
      addToast("حدث خطأ أثناء الإنشاء", "error");
    } finally {
      setCreatingRecord(false);
    }
  };

  // Delete record
  const handleDelete = async (recordId: string) => {
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
        addToast("تم حذف السجل بنجاح", "success");
      } else {
        addToast(data.error || "فشل الحذف", "error");
      }
    } catch {
      addToast("حدث خطأ أثناء الحذف", "error");
    } finally {
      setDeletingRecord(null);
    }
  };

  const renderFieldValue = (value: unknown, field: Field): React.ReactNode => {
    if (value === null || value === undefined) return <span className="text-text-tertiary">—</span>;

    if (field.type === "multipleAttachments" || field.type === "singleAttachment") {
      const attachments = Array.isArray(value) ? value : [value];
      return (
        <div className="flex gap-1 flex-wrap">
          {attachments.map((att: { url?: string; filename?: string; thumbnails?: { small?: { url: string } } }, i: number) => (
            <div key={i} className="flex items-center gap-1 bg-surface-tertiary rounded px-2 py-1 text-xs">
              <ImageIcon className="w-3 h-3" />
              <a href={att.url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline truncate max-w-[120px]">
                {att.filename || "ملف"}
              </a>
            </div>
          ))}
        </div>
      );
    }

    if (field.type === "checkbox") {
      return (
        <CheckSquare className={`w-4 h-4 ${value ? "text-accent-500" : "text-text-tertiary"}`} />
      );
    }

    if (field.type === "url") {
      return (
        <a href={String(value)} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline flex items-center gap-1 text-xs">
          <LinkIcon className="w-3 h-3" />
          <span className="truncate max-w-[150px]">{String(value)}</span>
        </a>
      );
    }

    if (field.type === "multipleSelects" && Array.isArray(value)) {
      return (
        <div className="flex gap-1 flex-wrap">
          {value.map((v: string, i: number) => (
            <span key={i} className="badge-primary">{v}</span>
          ))}
        </div>
      );
    }

    if (field.type === "singleSelect") {
      return <span className="badge-primary">{String(value)}</span>;
    }

    if (field.type === "multipleRecordLinks" && Array.isArray(value)) {
      return (
        <div className="flex gap-1 flex-wrap">
          {value.map((v: string, i: number) => (
            <span key={i} className="bg-surface-tertiary text-text-secondary rounded px-2 py-0.5 text-xs">{v}</span>
          ))}
        </div>
      );
    }

    if (typeof value === "object" && value !== null) {
      return <span className="text-xs text-text-secondary">{JSON.stringify(value)}</span>;
    }

    const strVal = String(value);
    if (strVal.length > 100) {
      return <span title={strVal}>{strVal.substring(0, 100)}...</span>;
    }

    return <span>{strVal}</span>;
  };

  const renderFieldInput = (
    field: Field,
    value: unknown,
    onChange: (val: unknown) => void
  ) => {
    const editableTypes = [
      "singleLineText", "multilineText", "richText", "email", "url", "phoneNumber",
      "number", "currency", "percent", "rating",
      "singleSelect", "multipleSelects",
      "date", "dateTime",
      "checkbox",
    ];

    if (!editableTypes.includes(field.type)) {
      return (
        <div className="text-xs text-text-tertiary bg-surface-tertiary rounded-lg px-3 py-2">
          {value ? JSON.stringify(value) : "—"} <span className="italic">(غير قابل للتعديل)</span>
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
            className="w-4 h-4 rounded border-border-strong text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm">{value ? "مفعل" : "معطل"}</span>
        </label>
      );
    }

    if (field.type === "singleSelect") {
      const choices = (field.options?.choices as { name: string }[]) || [];
      return (
        <select
          className="input"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">— اختر —</option>
          {choices.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      );
    }

    if (field.type === "multipleSelects") {
      const choices = (field.options?.choices as { name: string }[]) || [];
      const selected = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-1">
          {choices.map((c) => (
            <label key={c.name} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(c.name)}
                onChange={(e) => {
                  if (e.target.checked) {
                    onChange([...selected, c.name]);
                  } else {
                    onChange(selected.filter((s: string) => s !== c.name));
                  }
                }}
                className="w-3.5 h-3.5 rounded"
              />
              {c.name}
            </label>
          ))}
        </div>
      );
    }

    if (field.type === "number" || field.type === "currency" || field.type === "percent" || field.type === "rating") {
      return (
        <input
          type="number"
          className="input"
          value={value !== null && value !== undefined ? String(value) : ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        />
      );
    }

    if (field.type === "multilineText" || field.type === "richText") {
      return (
        <textarea
          className="input min-h-[100px] resize-y"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }

    if (field.type === "date" || field.type === "dateTime") {
      return (
        <input
          type={field.type === "dateTime" ? "datetime-local" : "date"}
          className="input"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    }

    return (
      <input
        type="text"
        className="input"
        value={String(value || "")}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Database className="w-7 h-7 text-primary-600" />
            قاعدة البيانات
          </h1>
          <p className="text-text-secondary text-sm mt-1">عرض وتعديل بيانات Airtable</p>
        </div>
      </div>

      {/* Base & Table Selection */}
      <div className="card p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Base selector */}
          <div>
            <label className="label">اختر القاعدة</label>
            <div className="relative">
              <select
                className="input appearance-none"
                value={selectedBase?.id || ""}
                onChange={(e) => {
                  const base = bases.find((b) => b.id === e.target.value);
                  setSelectedBase(base || null);
                }}
                disabled={loading}
              >
                <option value="">— اختر قاعدة —</option>
                {bases.map((base) => (
                  <option key={base.id} value={base.id}>{base.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
            </div>
          </div>

          {/* Table selector */}
          <div>
            <label className="label">اختر الجدول</label>
            <div className="relative">
              <select
                className="input appearance-none"
                value={selectedTable?.id || ""}
                onChange={(e) => {
                  const table = tables.find((t) => t.id === e.target.value);
                  setSelectedTable(table || null);
                }}
                disabled={!selectedBase || loading}
              >
                <option value="">— اختر جدول —</option>
                {tables.map((table) => (
                  <option key={table.id} value={table.id}>{table.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Table metadata */}
        {selectedTable && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Table className="w-4 h-4 text-primary-600" />
                <span className="text-sm font-medium">{selectedTable.name}</span>
                {selectedTable.description && (
                  <span className="text-xs text-text-tertiary">— {selectedTable.description}</span>
                )}
                <span className="badge-primary">{selectedTable.fields.length} حقل</span>
                <span className="badge-success">{records.length} سجل</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowFilter(!showFilter)} className="btn-ghost text-xs">
                  <Filter className="w-3.5 h-3.5" />
                  فلترة
                </button>
                <button
                  onClick={() => loadRecords()}
                  disabled={loadingRecords}
                  className="btn-ghost text-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingRecords ? "animate-spin" : ""}`} />
                  تحديث
                </button>
                {(user?.role === "admin" || user?.role === "editor") && (
                  <button onClick={() => setShowCreateModal(true)} className="btn-primary text-xs">
                    <Plus className="w-3.5 h-3.5" />
                    إضافة سجل
                  </button>
                )}
              </div>
            </div>

            {/* Filter bar */}
            {showFilter && (
              <div className="mt-3 flex items-center gap-2">
                <Search className="w-4 h-4 text-text-tertiary shrink-0" />
                <input
                  type="text"
                  className="input flex-1"
                  placeholder='صيغة الفلترة مثل: {Name} = "أحمد"'
                  value={filterFormula}
                  onChange={(e) => setFilterFormula(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") loadRecords();
                  }}
                />
                <select
                  className="input w-48"
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value)}
                >
                  <option value="">ترتيب حسب...</option>
                  {selectedTable.fields.map((f) => (
                    <option key={f.id} value={f.name}>{f.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
                  className="btn-ghost text-xs"
                  title={sortDir === "asc" ? "تصاعدي" : "تنازلي"}
                >
                  <ArrowUpDown className="w-4 h-4" />
                  {sortDir === "asc" ? "تصاعدي" : "تنازلي"}
                </button>
                <button onClick={() => loadRecords()} className="btn-primary text-xs">
                  تطبيق
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loading */}
      {(loading || loadingRecords) && (
        <div className="card p-12 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          <span className="mr-3 text-text-secondary">جاري التحميل...</span>
        </div>
      )}

      {/* Records table */}
      {selectedTable && !loadingRecords && records.length > 0 && (
        <div className="card overflow-hidden">
          <div className="table-container">
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="px-4 py-3 text-right w-12">#</th>
                  {selectedTable.fields.map((field) => (
                    <th key={field.id} className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span>{field.name}</span>
                        <span className="text-[10px] text-text-tertiary font-normal">({field.type})</span>
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right w-32">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record, idx) => (
                  <tr key={record.id} className="table-row">
                    <td className="table-cell text-text-tertiary text-xs">{idx + 1}</td>
                    {selectedTable.fields.map((field) => (
                      <td key={field.id} className="table-cell max-w-xs">
                        {editingRecord === record.id ? (
                          renderFieldInput(
                            field,
                            editFields[field.name],
                            (val) => setEditFields((prev) => ({ ...prev, [field.name]: val }))
                          )
                        ) : (
                          renderFieldValue(record.fields[field.name], field)
                        )}
                      </td>
                    ))}
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        {editingRecord === record.id ? (
                          <>
                            <button
                              onClick={saveEdit}
                              disabled={savingRecord}
                              className="btn-success text-xs px-2 py-1"
                            >
                              {savingRecord ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                            </button>
                            <button
                              onClick={() => setEditingRecord(null)}
                              className="btn-ghost text-xs px-2 py-1"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <>
                            {(user?.role === "admin" || user?.role === "editor") && (
                              <button
                                onClick={() => startEditing(record)}
                                className="btn-ghost text-xs px-2 py-1 text-primary-600"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            )}
                            {user?.role === "admin" && (
                              <button
                                onClick={() => handleDelete(record.id)}
                                disabled={deletingRecord === record.id}
                                className="btn-ghost text-xs px-2 py-1 text-red-600"
                              >
                                {deletingRecord === record.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3 h-3" />
                                )}
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
          <div className="flex items-center justify-between p-4 border-t border-border">
            <span className="text-xs text-text-tertiary">
              عرض {records.length} سجل
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (prevOffsets.length > 0) {
                    const prev = [...prevOffsets];
                    const lastOffset = prev.pop();
                    setPrevOffsets(prev);
                    loadRecords(lastOffset);
                  }
                }}
                disabled={prevOffsets.length === 0}
                className="btn-ghost text-xs"
              >
                <ChevronRight className="w-4 h-4" />
                السابق
              </button>
              <button
                onClick={() => {
                  if (offset) {
                    setPrevOffsets((prev) => [...prev, offset]);
                    loadRecords(offset);
                  }
                }}
                disabled={!offset}
                className="btn-ghost text-xs"
              >
                التالي
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {selectedTable && !loadingRecords && records.length === 0 && (
        <div className="card p-12 text-center">
          <Database className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
          <p className="text-text-secondary">لا توجد سجلات في هذا الجدول</p>
        </div>
      )}

      {/* No table selected */}
      {!selectedTable && !loading && (
        <div className="card p-12 text-center">
          <Table className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
          <p className="text-text-secondary">اختر قاعدة وجدول لعرض البيانات</p>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && selectedTable && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary-600" />
                إضافة سجل جديد
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-text-tertiary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {selectedTable.fields.map((field) => (
                <div key={field.id}>
                  <label className="label">
                    {field.name}
                    <span className="text-text-tertiary font-normal mr-1">({field.type})</span>
                  </label>
                  {renderFieldInput(
                    field,
                    createFields[field.name],
                    (val) => setCreateFields((prev) => ({ ...prev, [field.name]: val }))
                  )}
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-border flex items-center gap-3 justify-end">
              <button onClick={() => setShowCreateModal(false)} className="btn-secondary">
                إلغاء
              </button>
              <button onClick={handleCreate} disabled={creatingRecord} className="btn-primary">
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
