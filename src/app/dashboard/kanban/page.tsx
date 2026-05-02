"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/app-store";
import {
  RefreshCw,
  Search,
  Loader2,
  AlertCircle,
  Layers,
  GripVertical,
  Trash2,
  Edit3,
  Save,
  X,
  Settings2,
  ArrowLeftRight,
  ArrowUpDown,
  CheckSquare,
  Square,
  Star,
} from "lucide-react";

/* ────────── Types ────────── */

interface Base {
  id: string;
  name: string;
  permissionLevel: string;
}

interface Field {
  id: string;
  name: string;
  type: string;
  description?: string;
  options?: Record<string, unknown>;
}

interface TableInfo {
  id: string;
  name: string;
  description?: string;
  fields: Field[];
  primaryFieldId: string;
}

interface AirtableRecord {
  id: string;
  fields: { [key: string]: unknown };
  createdTime: string;
}

const GROUPABLE_TYPES = ["singleSelect", "checkbox", "multipleSelects"];
const NO_VALUE_KEY = "__none__";

/* ────────── Component ────────── */

export default function KanbanPage() {
  const { user, addToast } = useAppStore();

  /* data */
  const [bases, setBases] = useState<Base[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [records, setRecords] = useState<AirtableRecord[]>([]);
  const [selectedBase, setSelectedBase] = useState<Base | null>(null);
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);

  /* loading */
  const [loading, setLoading] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordsError, setRecordsError] = useState<string | null>(null);

  /* kanban state */
  const [groupField, setGroupField] = useState<string>("");
  const [titleField, setTitleField] = useState<string>("");
  const [visibleFieldIds, setVisibleFieldIds] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");

  /* drag state */
  const [draggingRecord, setDraggingRecord] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [updatingRecord, setUpdatingRecord] = useState<string | null>(null);

  /* dimensions (per-column width, per-card height) */
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});

  /* card editor */
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Record<string, unknown>>({});
  const [savingCard, setSavingCard] = useState(false);

  /* per-field per-record local manual ordering: column => record id list */
  const [orderByColumn, setOrderByColumn] = useState<Record<string, string[]>>({});

  /* ──── Fetch bases ──── */
  useEffect(() => {
    setLoading(true);
    fetch("/api/airtable?action=bases")
      .then((r) => r.json())
      .then((data) => {
        if (data.bases) {
          setBases(data.bases);
          const ztoBase = data.bases.find(
            (b: Base) => b.id === "appIpXIFs2yxyxaUm" || b.name === "Zero to One OS"
          );
          setSelectedBase(ztoBase || data.bases[0]);
        }
      })
      .catch(() => addToast("فشل تحميل القواعد", "error"))
      .finally(() => setLoading(false));
  }, [addToast]);

  /* ──── Fetch tables ──── */
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
      })
      .catch(() => addToast("فشل تحميل الجداول", "error"))
      .finally(() => setLoading(false));
  }, [selectedBase, addToast]);

  /* ──── On table change, pick sensible defaults ──── */
  useEffect(() => {
    if (!selectedTable) return;
    const groupable = selectedTable.fields.find((f) => GROUPABLE_TYPES.includes(f.type));
    const primary = selectedTable.fields.find((f) => f.id === selectedTable.primaryFieldId);
    setGroupField(groupable?.name || "");
    setTitleField(primary?.name || selectedTable.fields[0]?.name || "");
    setVisibleFieldIds(new Set(selectedTable.fields.slice(0, 4).map((f) => f.id)));
  }, [selectedTable]);

  /* ──── Fetch records ──── */
  const loadRecords = useCallback(() => {
    if (!selectedBase || !selectedTable) return;
    setLoadingRecords(true);
    setRecordsError(null);
    fetch(
      `/api/airtable?action=records&baseId=${selectedBase.id}&tableId=${selectedTable.id}&pageSize=100`
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setRecordsError(data.error);
        } else if (data.records) {
          setRecords(data.records);
        }
      })
      .catch(() => setRecordsError("فشل تحميل السجلات"))
      .finally(() => setLoadingRecords(false));
  }, [selectedBase, selectedTable]);

  useEffect(() => {
    if (selectedTable) loadRecords();
  }, [selectedTable, loadRecords]);

  /* ──── Helpers ──── */

  const groupFieldDef = selectedTable?.fields.find((f) => f.name === groupField);

  const getColumnsForField = (): { key: string; label: string; color?: string }[] => {
    if (!groupFieldDef) return [];
    if (groupFieldDef.type === "checkbox") {
      return [
        { key: "true", label: "✓ مفعل", color: "#34d399" },
        { key: "false", label: "غير مفعل", color: "#666" },
      ];
    }
    if (groupFieldDef.type === "singleSelect" || groupFieldDef.type === "multipleSelects") {
      const choices = (groupFieldDef.options?.choices as { name: string; color?: string }[]) || [];
      const cols: { key: string; label: string; color?: string }[] = choices.map((c) => ({
        key: c.name,
        label: c.name,
      }));
      cols.push({ key: NO_VALUE_KEY, label: "بدون", color: "#444" });
      return cols;
    }
    return [];
  };

  const columns = getColumnsForField();

  const getCardColumnKey = (record: AirtableRecord): string => {
    if (!groupFieldDef) return NO_VALUE_KEY;
    const value = record.fields[groupField];
    if (groupFieldDef.type === "checkbox") return value ? "true" : "false";
    if (groupFieldDef.type === "singleSelect") {
      return value ? String(value) : NO_VALUE_KEY;
    }
    if (groupFieldDef.type === "multipleSelects") {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return arr.length > 0 ? arr[0] : NO_VALUE_KEY;
    }
    return NO_VALUE_KEY;
  };

  const filteredRecords = quickSearch.trim()
    ? records.filter((r) =>
        Object.values(r.fields).some((v) => {
          if (v === null || v === undefined) return false;
          return String(v).toLowerCase().includes(quickSearch.toLowerCase());
        })
      )
    : records;

  const recordsByColumn: Record<string, AirtableRecord[]> = {};
  columns.forEach((c) => (recordsByColumn[c.key] = []));
  filteredRecords.forEach((r) => {
    const key = getCardColumnKey(r);
    if (!recordsByColumn[key]) recordsByColumn[key] = [];
    recordsByColumn[key].push(r);
  });

  // apply manual ordering when present
  for (const col of Object.keys(recordsByColumn)) {
    const order = orderByColumn[col];
    if (order && order.length) {
      const idToRec = new Map(recordsByColumn[col].map((r) => [r.id, r]));
      const ordered: AirtableRecord[] = [];
      for (const id of order) {
        const r = idToRec.get(id);
        if (r) {
          ordered.push(r);
          idToRec.delete(id);
        }
      }
      // append any new items not in saved order
      idToRec.forEach((r) => ordered.push(r));
      recordsByColumn[col] = ordered;
    }
  }

  /* ──── Drag handlers ──── */

  const onDragStart = (e: React.DragEvent, recordId: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", recordId);
    setDraggingRecord(recordId);
  };

  const onDragEnd = () => {
    setDraggingRecord(null);
    setDragOverColumn(null);
    setDropTargetIndex(null);
  };

  const onDragOverColumn = (e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColumn !== columnKey) setDragOverColumn(columnKey);
  };

  const onDragOverCard = (e: React.DragEvent, columnKey: string, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragOverColumn !== columnKey) setDragOverColumn(columnKey);
    if (dropTargetIndex !== index) setDropTargetIndex(index);
  };

  const onDropColumn = async (e: React.DragEvent, targetColumnKey: string) => {
    e.preventDefault();
    const recordId = e.dataTransfer.getData("text/plain") || draggingRecord;
    if (!recordId || !selectedBase || !selectedTable || !groupFieldDef) {
      onDragEnd();
      return;
    }
    const record = records.find((r) => r.id === recordId);
    if (!record) {
      onDragEnd();
      return;
    }

    const currentColumn = getCardColumnKey(record);
    const targetIndex = dropTargetIndex;

    // update manual order in target column
    setOrderByColumn((prev) => {
      const next = { ...prev };
      // remove from any column that has it
      for (const col of Object.keys(next)) {
        next[col] = next[col].filter((id) => id !== recordId);
      }
      const targetList = next[targetColumnKey]
        ? [...next[targetColumnKey]]
        : (recordsByColumn[targetColumnKey] || []).map((r) => r.id).filter((id) => id !== recordId);
      const insertAt = targetIndex == null ? targetList.length : targetIndex;
      targetList.splice(insertAt, 0, recordId);
      next[targetColumnKey] = targetList;
      return next;
    });

    // if same column, no airtable update needed
    if (currentColumn === targetColumnKey) {
      onDragEnd();
      return;
    }

    // figure out the new value
    let newValue: unknown = null;
    if (groupFieldDef.type === "checkbox") {
      newValue = targetColumnKey === "true";
    } else if (groupFieldDef.type === "singleSelect") {
      newValue = targetColumnKey === NO_VALUE_KEY ? null : targetColumnKey;
    } else if (groupFieldDef.type === "multipleSelects") {
      const existing = Array.isArray(record.fields[groupField])
        ? (record.fields[groupField] as string[])
        : [];
      // remove the source column tag, add target
      const filtered = existing.filter((v) => v !== currentColumn);
      newValue =
        targetColumnKey === NO_VALUE_KEY ? filtered : [...filtered, targetColumnKey];
    }

    // optimistic update
    setRecords((prev) =>
      prev.map((r) => (r.id === recordId ? { ...r, fields: { ...r.fields, [groupField]: newValue } } : r))
    );
    setUpdatingRecord(recordId);
    onDragEnd();

    try {
      const res = await fetch("/api/airtable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          baseId: selectedBase.id,
          tableId: selectedTable.id,
          recordId,
          fields: { [groupField]: newValue },
        }),
      });
      const data = await res.json();
      if (res.ok && data.record) {
        setRecords((prev) => prev.map((r) => (r.id === recordId ? data.record : r)));
        addToast("تم نقل البطاقة", "success");
      } else {
        addToast(data.error || "فشل تحديث البطاقة", "error");
        loadRecords();
      }
    } catch {
      addToast("فشل الاتصال أثناء نقل البطاقة", "error");
      loadRecords();
    } finally {
      setUpdatingRecord(null);
    }
  };

  /* ──── Column resize ──── */

  const startColumnResize = (e: React.MouseEvent, columnKey: string) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = columnWidths[columnKey] ?? 280;
    const onMove = (ev: MouseEvent) => {
      // RTL: dragging right shrinks; we still want intuitive: drag handle along width
      const delta = startX - ev.clientX;
      const next = Math.max(200, Math.min(640, startW + delta));
      setColumnWidths((prev) => ({ ...prev, [columnKey]: next }));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  /* ──── Card resize ──── */

  const startCardResize = (e: React.MouseEvent, recordId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startH = cardHeights[recordId] ?? 0;
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - startY;
      const base = startH || 120;
      const next = Math.max(80, Math.min(800, base + delta));
      setCardHeights((prev) => ({ ...prev, [recordId]: next }));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ns-resize";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  /* ──── Card edit ──── */

  const openCardEditor = (record: AirtableRecord) => {
    setEditingCard(record.id);
    setEditFields({ ...record.fields });
  };

  const saveCard = async () => {
    if (!editingCard || !selectedBase || !selectedTable) return;
    setSavingCard(true);
    try {
      const original = records.find((r) => r.id === editingCard);
      const diff: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(editFields)) {
        if (JSON.stringify(v) !== JSON.stringify(original?.fields[k])) diff[k] = v;
      }
      if (Object.keys(diff).length === 0) {
        setEditingCard(null);
        return;
      }
      const res = await fetch("/api/airtable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          baseId: selectedBase.id,
          tableId: selectedTable.id,
          recordId: editingCard,
          fields: diff,
        }),
      });
      const data = await res.json();
      if (res.ok && data.record) {
        setRecords((prev) => prev.map((r) => (r.id === editingCard ? data.record : r)));
        addToast("تم الحفظ", "success");
        setEditingCard(null);
      } else {
        addToast(data.error || "فشل الحفظ", "error");
      }
    } catch {
      addToast("فشل الاتصال", "error");
    } finally {
      setSavingCard(false);
    }
  };

  const deleteCard = async (recordId: string) => {
    if (!selectedBase || !selectedTable) return;
    if (!confirm("هل تريد حذف هذه البطاقة؟")) return;
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
        addToast("تم الحذف", "success");
      } else {
        addToast(data.error || "فشل الحذف", "error");
      }
    } catch {
      addToast("فشل الاتصال", "error");
    }
  };

  /* ──── Render value (compact) ──── */

  const renderCompactValue = (field: Field, value: unknown): React.ReactNode => {
    if (value === null || value === undefined || value === "")
      return <span className="text-neutral-600">—</span>;
    if (field.type === "checkbox") {
      return value ? (
        <CheckSquare className="w-3.5 h-3.5 text-emerald-400 inline" />
      ) : (
        <Square className="w-3.5 h-3.5 text-neutral-600 inline" />
      );
    }
    if (field.type === "rating") {
      const rating = Number(value) || 0;
      return (
        <span className="inline-flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`w-3 h-3 ${
                i < rating ? "text-amber-400 fill-amber-400" : "text-neutral-700"
              }`}
            />
          ))}
        </span>
      );
    }
    if (field.type === "singleSelect")
      return <span className="zto-badge zto-badge-gold">{String(value)}</span>;
    if (field.type === "multipleSelects" && Array.isArray(value))
      return (
        <span className="flex flex-wrap gap-1">
          {(value as string[]).map((v, i) => (
            <span key={i} className="zto-badge zto-badge-default">
              {v}
            </span>
          ))}
        </span>
      );
    if (Array.isArray(value)) return <span>{value.length} عنصر</span>;
    if (typeof value === "object") return <span className="text-neutral-500">{JSON.stringify(value).slice(0, 40)}</span>;
    const str = String(value);
    return str.length > 80 ? str.slice(0, 80) + "…" : str;
  };

  const renderEditorInput = (field: Field, value: unknown, onChange: (v: unknown) => void) => {
    if (field.type === "checkbox")
      return (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4"
        />
      );
    if (field.type === "singleSelect") {
      const choices = (field.options?.choices as { name: string }[]) || [];
      return (
        <div className="zto-select-wrap">
          <select
            className="zto-input text-[12px]"
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
        <div className="space-y-1 max-h-28 overflow-auto">
          {choices.map((c) => (
            <label key={c.name} className="flex items-center gap-2 text-[12px] text-neutral-300">
              <input
                type="checkbox"
                checked={selected.includes(c.name)}
                onChange={(e) =>
                  onChange(
                    e.target.checked ? [...selected, c.name] : selected.filter((s) => s !== c.name)
                  )
                }
                className="w-3.5 h-3.5"
              />
              {c.name}
            </label>
          ))}
        </div>
      );
    }
    if (["number", "currency", "percent", "rating"].includes(field.type)) {
      return (
        <input
          type="number"
          className="zto-input text-[12px]"
          value={value !== null && value !== undefined ? String(value) : ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        />
      );
    }
    if (field.type === "multilineText" || field.type === "richText") {
      return (
        <textarea
          className="zto-input text-[12px] min-h-[80px]"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }
    if (field.type === "date" || field.type === "dateTime") {
      return (
        <input
          type={field.type === "dateTime" ? "datetime-local" : "date"}
          className="zto-input text-[12px]"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    }
    return (
      <input
        type="text"
        className="zto-input text-[12px]"
        value={String(value || "")}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  };

  const canEdit = user?.role === "admin" || user?.role === "editor";
  const canDelete = user?.role === "admin";
  const groupableFields = selectedTable?.fields.filter((f) => GROUPABLE_TYPES.includes(f.type)) || [];

  /* ──────────────────── JSX ──────────────────── */

  return (
    <div className="space-y-3 max-w-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <Layers className="w-5 h-5 text-amber-400 shrink-0" />
        <h2 className="text-[15px] font-black text-white">عرض كانبان</h2>
        {selectedBase && (
          <>
            <span className="text-neutral-700">/</span>
            <span className="text-[13px] text-neutral-400 font-bold">{selectedBase.name}</span>
          </>
        )}
        {(loading || loadingRecords) && <Loader2 className="w-4 h-4 animate-spin text-amber-400" />}
      </div>

      {/* Table tabs */}
      {selectedBase && tables.length > 0 && (
        <div className="flex items-center gap-0 border-b-2 border-neutral-800 overflow-x-auto">
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

      {/* Toolbar */}
      {selectedTable && (
        <div className="bg-[#141414] border border-neutral-800 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                className="zto-input pr-9 text-[13px]"
                placeholder="بحث في البطاقات..."
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
              />
            </div>

            {/* Group by */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-neutral-500 font-bold">تجميع حسب:</span>
              <div className="zto-select-wrap w-44">
                <select
                  className="zto-input text-[12px]"
                  value={groupField}
                  onChange={(e) => setGroupField(e.target.value)}
                >
                  <option value="">— حقل —</option>
                  {groupableFields.map((f) => (
                    <option key={f.id} value={f.name}>
                      {f.name} ({f.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Title field */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-neutral-500 font-bold">العنوان:</span>
              <div className="zto-select-wrap w-40">
                <select
                  className="zto-input text-[12px]"
                  value={titleField}
                  onChange={(e) => setTitleField(e.target.value)}
                >
                  {selectedTable.fields.map((f) => (
                    <option key={f.id} value={f.name}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`zto-btn zto-btn-ghost zto-btn-sm ${showSettings ? "text-amber-400" : ""}`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              حقول البطاقة
            </button>
            <button
              onClick={() => {
                setColumnWidths({});
                setCardHeights({});
                setOrderByColumn({});
                addToast("تم إعادة الضبط", "info");
              }}
              className="zto-btn zto-btn-ghost zto-btn-sm"
              title="إعادة ضبط الأبعاد والترتيب"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              إعادة الضبط
            </button>
            <span className="text-[11px] text-neutral-500 font-bold">{filteredRecords.length} بطاقة</span>
            <button onClick={loadRecords} disabled={loadingRecords} className="zto-btn zto-btn-ghost zto-btn-sm">
              <RefreshCw className={`w-3.5 h-3.5 ${loadingRecords ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && selectedTable && (
        <div className="bg-[#111] border border-neutral-800 rounded-xl px-4 py-3">
          <p className="text-[11px] text-neutral-500 font-bold mb-2">حقول معروضة في البطاقة</p>
          <div className="flex flex-wrap gap-2">
            {selectedTable.fields.map((f) => {
              const checked = visibleFieldIds.has(f.id);
              return (
                <label
                  key={f.id}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer border ${
                    checked
                      ? "bg-amber-400/10 border-amber-400/40 text-amber-400"
                      : "bg-[#1a1a1a] border-neutral-800 text-neutral-400"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setVisibleFieldIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(f.id)) next.delete(f.id);
                        else next.add(f.id);
                        return next;
                      })
                    }
                    className="w-3 h-3"
                  />
                  {f.name}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Errors */}
      {recordsError && (
        <div className="zto-alert zto-alert-err">
          <AlertCircle className="w-4 h-4" />
          <span>{recordsError}</span>
          <button onClick={loadRecords} className="zto-btn zto-btn-ghost zto-btn-sm mr-auto">
            <RefreshCw className="w-3.5 h-3.5" /> إعادة المحاولة
          </button>
        </div>
      )}

      {/* No groupable field */}
      {selectedTable && !loadingRecords && !groupField && (
        <div className="zto-card p-12 flex flex-col items-center text-center gap-3">
          <Layers className="w-10 h-10 text-neutral-700" />
          <p className="text-neutral-400 text-[14px] font-bold">اختر حقلاً للتجميع</p>
          <p className="text-neutral-600 text-[12px] max-w-md">
            عرض الكانبان يحتاج حقل من نوع <code className="text-amber-400">singleSelect</code> أو{" "}
            <code className="text-amber-400">checkbox</code> أو{" "}
            <code className="text-amber-400">multipleSelects</code> ليعمل كأعمدة.
          </p>
          {groupableFields.length === 0 && (
            <p className="text-neutral-600 text-[11px]">لا توجد حقول مناسبة في هذا الجدول.</p>
          )}
        </div>
      )}

      {/* Board */}
      {selectedTable && groupField && !loadingRecords && (
        <div className="overflow-x-auto pb-4">
          <div className="flex items-stretch gap-3 min-w-max">
            {columns.map((column) => {
              const cards = recordsByColumn[column.key] || [];
              const colWidth = columnWidths[column.key] ?? 300;
              const isDragOverHere = dragOverColumn === column.key;
              return (
                <div
                  key={column.key}
                  className="relative shrink-0"
                  style={{ width: colWidth }}
                >
                  <div
                    onDragOver={(e) => onDragOverColumn(e, column.key)}
                    onDrop={(e) => onDropColumn(e, column.key)}
                    onDragLeave={(e) => {
                      // only clear if leaving column entirely
                      const rt = e.relatedTarget as Node | null;
                      if (rt && (e.currentTarget as Node).contains(rt)) return;
                      if (dragOverColumn === column.key) setDragOverColumn(null);
                    }}
                    className={`bg-[#101010] border rounded-xl flex flex-col min-h-[200px] transition-colors ${
                      isDragOverHere
                        ? "border-amber-400 bg-amber-400/5 ring-2 ring-amber-400/30"
                        : "border-neutral-800"
                    }`}
                  >
                    {/* column header */}
                    <div className="px-3 py-2.5 border-b border-neutral-800 flex items-center justify-between sticky top-0 bg-[#101010] rounded-t-xl z-[1]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: column.color || "#c9a84c" }}
                        />
                        <span className="text-[12px] font-bold text-neutral-200 truncate">
                          {column.label}
                        </span>
                        <span className="text-[10px] font-bold text-neutral-500 bg-[#1a1a1a] rounded px-1.5 py-0.5">
                          {cards.length}
                        </span>
                      </div>
                    </div>

                    {/* cards */}
                    <div className="p-2 space-y-2 flex-1">
                      {cards.length === 0 && (
                        <div
                          className={`flex items-center justify-center text-[11px] font-bold py-8 rounded-lg border-2 border-dashed transition-colors ${
                            isDragOverHere
                              ? "border-amber-400 text-amber-400 bg-amber-400/5"
                              : "border-neutral-800 text-neutral-700"
                          }`}
                        >
                          {isDragOverHere ? "أفلت هنا" : "اسحب البطاقات هنا"}
                        </div>
                      )}
                      {cards.map((record, idx) => {
                        const isDragging = draggingRecord === record.id;
                        const isUpdating = updatingRecord === record.id;
                        const cardHeight = cardHeights[record.id];
                        const showDropIndicator =
                          isDragOverHere && dropTargetIndex === idx && draggingRecord !== record.id;
                        const title = String(record.fields[titleField] ?? "(بدون عنوان)");
                        return (
                          <div key={record.id}>
                            {showDropIndicator && (
                              <div className="h-1 bg-amber-400 rounded-full mb-2 animate-pulse" />
                            )}
                            <div
                              draggable
                              onDragStart={(e) => onDragStart(e, record.id)}
                              onDragEnd={onDragEnd}
                              onDragOver={(e) => onDragOverCard(e, column.key, idx)}
                              className={`group relative bg-[#1a1a1a] border rounded-xl p-3 cursor-grab active:cursor-grabbing transition-all ${
                                isDragging
                                  ? "opacity-30 border-amber-400"
                                  : "border-neutral-800 hover:border-neutral-700 hover:shadow-lg"
                              }`}
                              style={cardHeight ? { height: cardHeight, overflow: "auto" } : undefined}
                            >
                              {/* drag handle visual */}
                              <div className="absolute top-2 left-2 text-neutral-600 group-hover:text-amber-400 transition-colors pointer-events-none">
                                <GripVertical className="w-3.5 h-3.5" />
                              </div>

                              {/* updating spinner */}
                              {isUpdating && (
                                <div className="absolute top-2 right-2">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                                </div>
                              )}

                              <div className="pr-5">
                                <div className="text-[13px] font-bold text-white mb-1.5 line-clamp-2">
                                  {title}
                                </div>
                                <div className="space-y-1">
                                  {selectedTable.fields
                                    .filter((f) => visibleFieldIds.has(f.id) && f.name !== titleField)
                                    .map((f) => (
                                      <div key={f.id} className="text-[11px] flex gap-1.5 items-start">
                                        <span className="text-neutral-500 font-bold shrink-0">
                                          {f.name}:
                                        </span>
                                        <span className="text-neutral-300 min-w-0">
                                          {renderCompactValue(f, record.fields[f.name])}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              </div>

                              {/* card actions */}
                              <div className="absolute bottom-1.5 left-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {canEdit && (
                                  <button
                                    onClick={() => openCardEditor(record)}
                                    className="p-1 rounded bg-[#0d0d0d] border border-neutral-800 text-amber-400 hover:bg-amber-400/10"
                                    title="تعديل"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    onClick={() => deleteCard(record.id)}
                                    className="p-1 rounded bg-[#0d0d0d] border border-neutral-800 text-red-400 hover:bg-red-400/10"
                                    title="حذف"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>

                              {/* card resize handle (bottom edge) */}
                              <div
                                onMouseDown={(e) => startCardResize(e, record.id)}
                                className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize bg-transparent hover:bg-amber-400/40 rounded-b-xl"
                                title="اسحب لتغيير الارتفاع"
                              >
                                <div className="absolute left-1/2 -translate-x-1/2 bottom-0.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-50">
                                  <ArrowUpDown className="w-2.5 h-2.5 text-amber-400" />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {/* trailing drop zone (drop at end) */}
                      {isDragOverHere && dropTargetIndex === null && cards.length > 0 && (
                        <div className="h-1 bg-amber-400 rounded-full animate-pulse" />
                      )}
                    </div>
                  </div>

                  {/* column resize handle (right edge in RTL = left side visually... we put on left) */}
                  <div
                    onMouseDown={(e) => startColumnResize(e, column.key)}
                    className="absolute top-0 bottom-0 -left-1.5 w-3 cursor-col-resize z-10 group/handle"
                    title="اسحب لتغيير العرض"
                  >
                    <div className="h-full w-0.5 mx-auto bg-transparent group-hover/handle:bg-amber-400/60 transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Card editor modal */}
      {editingCard && selectedTable && (
        <div className="zto-overlay" onClick={() => setEditingCard(null)}>
          <div className="zto-modal max-w-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-[#3a3a3a] flex items-center justify-between">
              <h3 className="text-[14px] font-bold text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-amber-400" />
                تعديل البطاقة
              </h3>
              <button onClick={() => setEditingCard(null)} className="text-neutral-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
              {selectedTable.fields.map((field) => (
                <div key={field.id}>
                  <label className="zto-label">{field.name}</label>
                  {renderEditorInput(field, editFields[field.name], (val) =>
                    setEditFields((prev) => ({ ...prev, [field.name]: val }))
                  )}
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-[#3a3a3a] flex gap-3">
              <button onClick={saveCard} disabled={savingCard} className="zto-btn zto-btn-gold">
                {savingCard ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                حفظ
              </button>
              <button onClick={() => setEditingCard(null)} className="zto-btn zto-btn-outline">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
