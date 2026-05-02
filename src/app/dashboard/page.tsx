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
  ChevronDown,
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
  Maximize2,
  Eye,
  EyeOff,
  Rows3,
  LayoutGrid,
  Columns,
  GripVertical,
  GripHorizontal,
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

function renderCellPreview(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (v == null) return "";
        if (typeof v === "string" || typeof v === "number") return String(v);
        if (typeof v === "object" && v !== null) {
          const o = v as Record<string, unknown>;
          if (typeof o.name === "string") return o.name;
          if (typeof o.url === "string") return o.url;
        }
        return "";
      })
      .filter(Boolean)
      .join("، ");
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.name === "string") return o.name;
    if (typeof o.url === "string") return o.url;
    if (typeof o.text === "string") return o.text;
  }
  return "";
}

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

  /* visual filter */
  interface FilterRule {
    field: string;
    operator: string;
    value: string;
  }
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);
  const [showFilter, setShowFilter] = useState(false);
  const [sortField, setSortField] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [quickSearch, setQuickSearch] = useState("");

  /* expanded cells (resizable) */
  const [expandedCell, setExpandedCell] = useState<string | null>(null); // "recordId:fieldName"

  /* build Airtable formula from visual filter rules */
  const buildFilterFormula = useCallback((rules: FilterRule[]): string => {
    const parts = rules
      .filter((r) => r.field && r.value)
      .map((r) => {
        switch (r.operator) {
          case "=": return `{${r.field}} = "${r.value}"`;
          case "!=": return `{${r.field}} != "${r.value}"`;
          case "contains": return `FIND("${r.value}", {${r.field}})`;
          case "not_contains": return `NOT(FIND("${r.value}", {${r.field}}))`;
          case ">": return `{${r.field}} > ${r.value}`;
          case "<": return `{${r.field}} < ${r.value}`;
          case "empty": return `{${r.field}} = BLANK()`;
          case "not_empty": return `{${r.field}} != BLANK()`;
          default: return "";
        }
      })
      .filter(Boolean);
    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0];
    return `AND(${parts.join(", ")})`;
  }, []);

  const filterFormula = buildFilterFormula(filterRules);

  /* per-cell edit: tracks which cell is being edited */
  const [editingCell, setEditingCell] = useState<{ recordId: string; fieldName: string } | null>(null);
  const [editCellValue, setEditCellValue] = useState<unknown>(null);
  const [savingCell, setSavingCell] = useState(false);

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

  /* expanded rows */
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleRowExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* column visibility */
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const toggleColumn = (fieldId: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) next.delete(fieldId);
      else next.add(fieldId);
      return next;
    });
  };
  const visibleFields = selectedTable?.fields.filter((f) => !hiddenColumns.has(f.id)) || [];

  /* row height */
  const [rowSize, setRowSize] = useState<"compact" | "normal" | "tall">("normal");
  const rowPadding = rowSize === "compact" ? "py-1.5" : rowSize === "tall" ? "py-5" : "py-3";

  /* view mode */
  const [view, setView] = useState<"grid" | "kanban">("grid");
  const [kanbanGroupField, setKanbanGroupField] = useState<string | null>(null);
  const [kanbanMoving, setKanbanMoving] = useState<string | null>(null);
  const [kanbanDensity, setKanbanDensity] = useState<"compact" | "normal" | "comfy">("normal");
  // Per-column persisted width. Key = `${baseId}:${tableId}:${groupField}:${columnKey}`.
  const [kanbanColWidth, setKanbanColWidth] = useState<Record<string, number>>({});
  const [kanbanDragOver, setKanbanDragOver] = useState<string | null>(null);
  const [kanbanDraggingId, setKanbanDraggingId] = useState<string | null>(null);

  // Hydrate persisted Kanban prefs once.
  useEffect(() => {
    try {
      const w = localStorage.getItem("zto-kanban-col-width");
      if (w) setKanbanColWidth(JSON.parse(w));
      const d = localStorage.getItem("zto-kanban-density");
      if (d === "compact" || d === "normal" || d === "comfy") setKanbanDensity(d);
    } catch {
      // localStorage may be unavailable — non-fatal
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("zto-kanban-col-width", JSON.stringify(kanbanColWidth));
    } catch {}
  }, [kanbanColWidth]);

  useEffect(() => {
    try {
      localStorage.setItem("zto-kanban-density", kanbanDensity);
    } catch {}
  }, [kanbanDensity]);

  // Reset kanban grouping when the table changes; auto-pick first singleSelect.
  useEffect(() => {
    if (!selectedTable) {
      setKanbanGroupField(null);
      return;
    }
    const firstSingleSelect = selectedTable.fields.find((f) => f.type === "singleSelect");
    setKanbanGroupField(firstSingleSelect ? firstSingleSelect.name : null);
  }, [selectedTable]);

  const singleSelectFields = selectedTable?.fields.filter((f) => f.type === "singleSelect") || [];

  type ChoiceOption = { name: string; color?: string };
  function readChoices(field: Field | undefined): ChoiceOption[] {
    if (!field || field.type !== "singleSelect") return [];
    const opts = field.options as { choices?: ChoiceOption[] } | undefined;
    return Array.isArray(opts?.choices) ? opts.choices : [];
  }

  // Update a single field on a record (used by Kanban "move card" buttons).
  const updateRecordField = async (recordId: string, fieldName: string, value: unknown) => {
    if (!selectedBase || !selectedTable) return;
    setKanbanMoving(recordId);
    try {
      const res = await fetch("/api/airtable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          baseId: selectedBase.id,
          tableId: selectedTable.id,
          recordId,
          fields: { [fieldName]: value },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRecords((prev) => prev.map((r) => (r.id === recordId ? data.record : r)));
        addToast("تم النقل", "success");
      } else {
        addToast(data.error || "فشل النقل", "error");
      }
    } catch {
      addToast("حدث خطأ أثناء النقل", "error");
    } finally {
      setKanbanMoving(null);
    }
  };

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
          } else {
            // Auto-select Zero to One OS base
            const ztoBase = data.bases.find(
              (b: Base) => b.id === "appIpXIFs2yxyxaUm" || b.name === "Zero to One OS"
            );
            setSelectedBase(ztoBase || data.bases[0]);
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

  /* ──── Per-cell Edit ──── */
  const startCellEdit = (recordId: string, fieldName: string, currentValue: unknown) => {
    setEditingCell({ recordId, fieldName });
    setEditCellValue(currentValue);
  };

  const cancelCellEdit = () => {
    setEditingCell(null);
    setEditCellValue(null);
  };

  const saveCellEdit = async () => {
    if (!selectedBase || !selectedTable || !editingCell) return;
    const { recordId, fieldName } = editingCell;
    const originalRecord = records.find((r) => r.id === recordId);
    if (originalRecord && JSON.stringify(editCellValue) === JSON.stringify(originalRecord.fields[fieldName])) {
      cancelCellEdit();
      return;
    }
    setSavingCell(true);
    try {
      const res = await fetch("/api/airtable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          baseId: selectedBase.id,
          tableId: selectedTable.id,
          recordId,
          fields: { [fieldName]: editCellValue },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRecords((prev) => prev.map((r) => (r.id === recordId ? data.record : r)));
        cancelCellEdit();
        addToast("تم الحفظ", "success");
      } else {
        addToast(data.error || "فشل الحفظ", "error");
      }
    } catch {
      addToast("حدث خطأ أثناء الحفظ", "error");
    } finally {
      setSavingCell(false);
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
      {/* ── Header ── */}
      {selectedBase && (
        <div className="flex items-center gap-3 mb-1">
          <Database className="w-5 h-5 text-amber-400 shrink-0" />
          <h2 className="text-[15px] font-black text-white">{selectedBase.name}</h2>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-amber-400" />}
        </div>
      )}

      {/* Loading bases */}
      {!selectedBase && loading && (
        <div className="flex items-center gap-3 mb-4">
          <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
          <span className="text-neutral-500 text-[13px]">جاري تحميل القاعدة...</span>
        </div>
      )}

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
                showFilter || filterRules.length > 0 ? "text-amber-400" : ""
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
            {/* Column visibility toggle */}
            <div className="relative">
              <button
                onClick={() => setShowColumnPicker(!showColumnPicker)}
                className={`zto-btn zto-btn-ghost zto-btn-sm ${
                  hiddenColumns.size > 0 ? "text-amber-400" : ""
                }`}
              >
                {hiddenColumns.size > 0 ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                أعمدة
                {hiddenColumns.size > 0 && (
                  <span className="text-[10px] bg-amber-400/20 text-amber-400 rounded px-1">
                    {hiddenColumns.size} مخفي
                  </span>
                )}
              </button>
              {showColumnPicker && selectedTable && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-[#1a1a1a] border border-neutral-700 rounded-xl p-3 w-64 max-h-72 overflow-y-auto shadow-2xl">
                  <p className="text-[11px] text-neutral-500 font-bold mb-2">إظهار / إخفاء الأعمدة</p>
                  {selectedTable.fields.map((field) => {
                    const Icon = getFieldIcon(field.type);
                    const typeColor = getFieldTypeColor(field.type);
                    const isHidden = hiddenColumns.has(field.id);
                    return (
                      <label
                        key={field.id}
                        className={`flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer text-[12px] transition-colors ${
                          isHidden ? "text-neutral-600" : "text-neutral-300"
                        } hover:bg-white/[0.03]`}
                      >
                        <input
                          type="checkbox"
                          checked={!isHidden}
                          onChange={() => toggleColumn(field.id)}
                          className="w-3.5 h-3.5 rounded accent-amber-400"
                        />
                        <Icon className={`w-3 h-3 ${isHidden ? "text-neutral-700" : typeColor} shrink-0`} />
                        <span className={isHidden ? "line-through" : ""}>{field.name}</span>
                      </label>
                    );
                  })}
                  {hiddenColumns.size > 0 && (
                    <button
                      onClick={() => setHiddenColumns(new Set())}
                      className="text-[11px] text-amber-400 mt-2 hover:underline"
                    >
                      إظهار الكل
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* View switcher */}
            <div className="flex items-center bg-[#1a1a1a] border border-neutral-800 rounded-lg overflow-hidden">
              <button
                onClick={() => setView("grid")}
                className={`px-2.5 py-1 text-[10px] font-bold transition-colors flex items-center gap-1 ${
                  view === "grid" ? "bg-white text-black" : "text-neutral-500 hover:text-neutral-300"
                }`}
                title="عرض الجدول"
              >
                <LayoutGrid className="w-3 h-3" />
                جدول
              </button>
              <button
                onClick={() => setView("kanban")}
                disabled={singleSelectFields.length === 0}
                className={`px-2.5 py-1 text-[10px] font-bold transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed ${
                  view === "kanban" ? "bg-white text-black" : "text-neutral-500 hover:text-neutral-300"
                }`}
                title={singleSelectFields.length === 0 ? "لا يوجد حقل اختيار واحد للتجميع" : "عرض كانبان"}
              >
                <Columns className="w-3 h-3" />
                كانبان
              </button>
            </div>

            {/* Kanban group-by selector */}
            {view === "kanban" && singleSelectFields.length > 1 && (
              <div className="zto-select-wrap">
                <select
                  className="zto-input text-[11px] !py-1 !pr-2 !pl-7 w-36"
                  value={kanbanGroupField ?? ""}
                  onChange={(e) => setKanbanGroupField(e.target.value || null)}
                >
                  {singleSelectFields.map((f) => (
                    <option key={f.id} value={f.name}>
                      التجميع حسب: {f.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Kanban card density (kanban view only) */}
            {view === "kanban" && (
              <div className="flex items-center bg-[#1a1a1a] border border-neutral-800 rounded-lg overflow-hidden" title="حجم البطاقات">
                {(["compact", "normal", "comfy"] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => setKanbanDensity(size)}
                    className={`px-2 py-1 text-[10px] font-bold transition-colors ${
                      kanbanDensity === size ? "bg-white text-black" : "text-neutral-500 hover:text-neutral-300"
                    }`}
                    title={size === "compact" ? "مضغوط" : size === "normal" ? "عادي" : "مريح"}
                  >
                    <Rows3 className={`w-3 h-3 ${size === "compact" ? "scale-75" : size === "comfy" ? "scale-125" : ""}`} />
                  </button>
                ))}
              </div>
            )}

            {/* Row height (grid view only) */}
            {view === "grid" && (
              <div className="flex items-center bg-[#1a1a1a] border border-neutral-800 rounded-lg overflow-hidden">
                {(["compact", "normal", "tall"] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => setRowSize(size)}
                    className={`px-2 py-1 text-[10px] font-bold transition-colors ${
                      rowSize === size ? "bg-white text-black" : "text-neutral-500 hover:text-neutral-300"
                    }`}
                    title={size === "compact" ? "مضغوط" : size === "normal" ? "عادي" : "واسع"}
                  >
                    <Rows3 className={`w-3 h-3 ${size === "compact" ? "scale-75" : size === "tall" ? "scale-125" : ""}`} />
                  </button>
                ))}
              </div>
            )}

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

      {/* ── Visual filter builder ── */}
      {showFilter && selectedTable && (
        <div className="bg-[#111] border border-neutral-800 border-t-0 px-4 py-3 space-y-2">
          {filterRules.map((rule, idx) => (
            <div key={idx} className="flex items-center gap-2 flex-wrap">
              {idx > 0 && <span className="text-[10px] text-amber-400 font-bold w-8">AND</span>}
              {idx === 0 && <span className="text-[10px] text-neutral-500 font-bold w-8">أين</span>}
              <div className="zto-select-wrap w-40">
                <select
                  className="zto-input text-[12px]"
                  value={rule.field}
                  onChange={(e) => {
                    const updated = [...filterRules];
                    updated[idx] = { ...rule, field: e.target.value };
                    setFilterRules(updated);
                  }}
                >
                  <option value="">-- حقل --</option>
                  {selectedTable.fields.map((f) => (
                    <option key={f.id} value={f.name}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div className="zto-select-wrap w-32">
                <select
                  className="zto-input text-[12px]"
                  value={rule.operator}
                  onChange={(e) => {
                    const updated = [...filterRules];
                    updated[idx] = { ...rule, operator: e.target.value };
                    setFilterRules(updated);
                  }}
                >
                  <option value="=">يساوي</option>
                  <option value="!=">لا يساوي</option>
                  <option value="contains">يحتوي على</option>
                  <option value="not_contains">لا يحتوي</option>
                  <option value=">">أكبر من</option>
                  <option value="<">أصغر من</option>
                  <option value="empty">فارغ</option>
                  <option value="not_empty">غير فارغ</option>
                </select>
              </div>
              {rule.operator !== "empty" && rule.operator !== "not_empty" && (
                <input
                  type="text"
                  className="zto-input text-[12px] flex-1 min-w-[120px] max-w-[200px]"
                  placeholder="القيمة..."
                  value={rule.value}
                  onChange={(e) => {
                    const updated = [...filterRules];
                    updated[idx] = { ...rule, value: e.target.value };
                    setFilterRules(updated);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") loadRecords(); }}
                />
              )}
              <button
                onClick={() => setFilterRules(filterRules.filter((_, i) => i !== idx))}
                className="text-red-400 hover:text-red-300 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => setFilterRules([...filterRules, { field: "", operator: "=", value: "" }])}
              className="zto-btn zto-btn-ghost zto-btn-sm text-amber-400"
            >
              <Plus className="w-3 h-3" />
              إضافة شرط
            </button>
            {filterRules.length > 0 && (
              <>
                <button onClick={() => loadRecords()} className="zto-btn zto-btn-gold zto-btn-sm">
                  <Filter className="w-3 h-3" />
                  تطبيق
                </button>
                <button
                  onClick={() => { setFilterRules([]); loadRecords(); }}
                  className="zto-btn zto-btn-ghost zto-btn-sm text-red-400"
                >
                  <X className="w-3 h-3" />
                  مسح الكل
                </button>
              </>
            )}
          </div>
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

      {/* ── Records table (grid view) ── */}
      {view === "grid" && selectedTable && !loadingRecords && !recordsError && filteredRecords.length > 0 && (
        <div className="border border-neutral-800 border-t-0 rounded-b-xl overflow-hidden bg-[#0d0d0d]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#161616]">
                  <th className="px-2 py-3 text-[11px] font-bold text-neutral-400 text-right border-b-2 border-neutral-700 border-r-2 border-r-neutral-700 w-14">
                    #
                  </th>
                  {visibleFields.map((field) => {
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
                {filteredRecords.map((record, idx) => {
                  const isExpanded = expandedRows.has(record.id);
                  return (
                    <tr
                      key={record.id}
                      className="border-b-2 border-neutral-700 hover:bg-white/[0.02] transition-colors group"
                    >
                      {/* Row number + expand */}
                      <td className={`px-2 ${rowPadding} border-r-2 border-neutral-700 align-top`}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggleRowExpand(record.id)}
                            className="text-neutral-600 hover:text-amber-400 transition-colors"
                            title={isExpanded ? "طي" : "توسيع"}
                          >
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                            />
                          </button>
                          <span className="text-neutral-600 text-[11px] font-mono">{idx + 1}</span>
                        </div>
                      </td>
                      {/* Data cells — per-cell editing + expandable */}
                      {visibleFields.map((field) => {
                        const cellKey = `${record.id}:${field.name}`;
                        const isCellEditing =
                          editingCell?.recordId === record.id &&
                          editingCell?.fieldName === field.name;
                        const isCellExpanded = expandedCell === cellKey;
                        const isReadOnly = READ_ONLY_TYPES.includes(field.type);
                        const cellEditable = canEdit && !isReadOnly;
                        return (
                          <td
                            key={field.id}
                            className={`px-4 ${rowPadding} text-[13px] border-r border-neutral-700/50 align-top ${
                              isExpanded || isCellExpanded ? "" : "max-w-[200px]"
                            } ${cellEditable && !isCellEditing ? "cursor-pointer hover:bg-amber-400/5" : ""}`}
                            onDoubleClick={() => {
                              if (cellEditable && !isCellEditing) {
                                startCellEdit(record.id, field.name, record.fields[field.name]);
                              }
                            }}
                          >
                            {isCellEditing ? (
                              <div className="space-y-1.5">
                                {renderFieldInput(field, editCellValue, (val) =>
                                  setEditCellValue(val)
                                )}
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={saveCellEdit}
                                    disabled={savingCell}
                                    className="zto-btn zto-btn-ok zto-btn-sm"
                                    style={{ padding: "3px 6px" }}
                                  >
                                    {savingCell ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Save className="w-3 h-3" />
                                    )}
                                  </button>
                                  <button
                                    onClick={cancelCellEdit}
                                    className="zto-btn zto-btn-ghost zto-btn-sm"
                                    style={{ padding: "3px 6px" }}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                className={`relative group/cell ${
                                  isCellExpanded
                                    ? "overflow-auto border border-neutral-700 rounded-lg bg-[#1a1a1a] p-2"
                                    : isExpanded
                                    ? ""
                                    : "line-clamp-2 overflow-hidden"
                                }`}
                                style={
                                  isCellExpanded
                                    ? { resize: "both", minWidth: 180, minHeight: 60, maxWidth: 600, maxHeight: 400 }
                                    : undefined
                                }
                              >
                                {renderFieldValue(record.fields[field.name], field)}
                                <div className="absolute top-0 left-0 flex gap-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                  {cellEditable && (
                                    <button
                                      onClick={() =>
                                        startCellEdit(record.id, field.name, record.fields[field.name])
                                      }
                                      className="p-0.5 rounded bg-[#1a1a1a] border border-neutral-700 text-amber-400"
                                      title="تعديل"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setExpandedCell(isCellExpanded ? null : cellKey)}
                                    className="p-0.5 rounded bg-[#1a1a1a] border border-neutral-700 text-neutral-400 hover:text-amber-400"
                                    title={isCellExpanded ? "طي الخلية" : "توسيع الخلية"}
                                  >
                                    <Maximize2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>
                        );
                      })}
                      {/* Actions */}
                      {(canEdit || canDelete) && (
                        <td className={`px-3 ${rowPadding} align-top`}>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => toggleRowExpand(record.id)}
                              className="zto-btn zto-btn-ghost zto-btn-sm text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ padding: "4px 8px" }}
                              title={isExpanded ? "طي" : "توسيع"}
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </button>
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
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
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

      {/* ── Records kanban (kanban view) ── */}
      {view === "kanban" && selectedTable && !loadingRecords && !recordsError && filteredRecords.length > 0 && (() => {
        const groupField = selectedTable.fields.find((f) => f.name === kanbanGroupField);
        if (!groupField || groupField.type !== "singleSelect") {
          return (
            <div className="border border-neutral-800 border-t-0 rounded-b-xl p-12 flex flex-col items-center justify-center text-center bg-[#0d0d0d]">
              <Columns className="w-10 h-10 text-neutral-700 mb-3" />
              <p className="text-neutral-400 text-[14px] font-bold">اختر حقل تجميع</p>
              <p className="text-neutral-600 text-[12px] mt-1">يتطلب عرض كانبان حقلاً من نوع &quot;اختيار واحد&quot;.</p>
            </div>
          );
        }
        const choices = readChoices(groupField);
        const noneKey = "__none__";
        const groups: Record<string, AirtableRecord[]> = { [noneKey]: [] };
        choices.forEach((c) => { groups[c.name] = []; });
        for (const rec of filteredRecords) {
          const v = rec.fields[groupField.name];
          const key = typeof v === "string" && v in groups ? v : (typeof v === "string" ? v : noneKey);
          if (!groups[key]) groups[key] = [];
          groups[key].push(rec);
        }
        const orderedKeys = [...choices.map((c) => c.name).filter((k) => k in groups), ...Object.keys(groups).filter((k) => k !== noneKey && !choices.some((c) => c.name === k)), noneKey];
        const primary = selectedTable.fields.find((f) => f.id === selectedTable.primaryFieldId);
        const cardFields = visibleFields.filter((f) => f.id !== selectedTable.primaryFieldId && f.name !== groupField.name).slice(0, 3);

        const colorMap: Record<string, string> = {
          redLight2: "#7f1d1d", orangeLight2: "#7c2d12", yellowLight2: "#713f12",
          greenLight2: "#14532d", tealLight2: "#134e4a", cyanLight2: "#155e75",
          blueLight2: "#1e3a8a", purpleLight2: "#581c87", pinkLight2: "#831843",
          grayLight2: "#374151",
          redBright: "#ef4444", orangeBright: "#f97316", yellowBright: "#eab308",
          greenBright: "#22c55e", tealBright: "#14b8a6", cyanBright: "#06b6d4",
          blueBright: "#3b82f6", purpleBright: "#a855f7", pinkBright: "#ec4899",
          grayBright: "#6b7280",
        };
        const choiceColor = (name: string) => {
          const c = choices.find((x) => x.name === name);
          return (c?.color && colorMap[c.color]) || "var(--c-brand-lighter)";
        };

        const colKeyPrefix = `${selectedBase?.id ?? "?"}:${selectedTable.id}:${groupField.name}`;
        const widthFor = (k: string) => kanbanColWidth[`${colKeyPrefix}:${k}`] ?? 280;
        const setWidthFor = (k: string, w: number) =>
          setKanbanColWidth((p) => ({ ...p, [`${colKeyPrefix}:${k}`]: w }));

        // Drag column resize: pointer events so it works on touch + mouse,
        // and we can pin/release pointer capture to keep tracking even if
        // the cursor leaves the handle while dragging.
        const onResizeStart = (
          e: React.PointerEvent<HTMLDivElement>,
          colKey: string
        ) => {
          e.preventDefault();
          const el = e.currentTarget;
          const startX = e.clientX;
          const startW = widthFor(colKey);
          el.setPointerCapture(e.pointerId);
          const onMove = (ev: PointerEvent) => {
            // RTL layout: dragging left increases width.
            const delta = startX - ev.clientX;
            const next = Math.max(220, Math.min(640, startW + delta));
            setWidthFor(colKey, next);
          };
          const onUp = (ev: PointerEvent) => {
            try { el.releasePointerCapture(ev.pointerId); } catch {}
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        };

        const densityCard =
          kanbanDensity === "compact" ? "p-2 text-[11px]" : kanbanDensity === "comfy" ? "p-3.5 text-[13px]" : "p-2.5 text-[12px]";
        const densityCardSpacing =
          kanbanDensity === "compact" ? "space-y-1.5" : kanbanDensity === "comfy" ? "space-y-3" : "space-y-2";

        const onCardDragStart = (e: React.DragEvent, recordId: string) => {
          e.dataTransfer.setData("text/zto-record-id", recordId);
          e.dataTransfer.effectAllowed = "move";
          setKanbanDraggingId(recordId);
        };
        const onCardDragEnd = () => {
          setKanbanDraggingId(null);
          setKanbanDragOver(null);
        };
        const onColumnDragOver = (e: React.DragEvent, key: string) => {
          // Only accept drops if a Kanban card is being dragged.
          if (!e.dataTransfer.types.includes("text/zto-record-id")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (kanbanDragOver !== key) setKanbanDragOver(key);
        };
        const onColumnDrop = (e: React.DragEvent, key: string) => {
          const recId = e.dataTransfer.getData("text/zto-record-id");
          setKanbanDragOver(null);
          setKanbanDraggingId(null);
          if (!recId || !canEdit) return;
          const newValue = key === noneKey ? null : key;
          // Find current record value; skip the API call if nothing changed.
          const rec = filteredRecords.find((r) => r.id === recId);
          const current = rec?.fields[groupField.name];
          if ((current ?? null) === newValue) return;
          e.preventDefault();
          updateRecordField(recId, groupField.name, newValue);
        };

        return (
          <div className="border border-neutral-800 border-t-0 rounded-b-xl p-3 bg-[#0d0d0d]">
            {canEdit && (
              <p className="text-[10px] text-neutral-500 mb-2 px-1">
                اسحب البطاقات بين الأعمدة لتغيير الحالة. اسحب الحد الأيسر للعمود لضبط عرضه.
              </p>
            )}
            <div className="flex gap-3 overflow-x-auto pb-2" dir="rtl">
              {orderedKeys.map((key) => {
                const list = groups[key] || [];
                const isNone = key === noneKey;
                const isDragOver = kanbanDragOver === key;
                const colW = widthFor(key);
                return (
                  <div
                    key={key}
                    className={`shrink-0 bg-[#161616] border rounded-xl flex flex-col max-h-[calc(100vh-280px)] relative transition-colors ${
                      isDragOver
                        ? "border-amber-400 ring-2 ring-amber-400/30"
                        : "border-neutral-800"
                    }`}
                    style={{ width: colW }}
                    onDragOver={(e) => onColumnDragOver(e, key)}
                    onDragLeave={() => kanbanDragOver === key && setKanbanDragOver(null)}
                    onDrop={(e) => onColumnDrop(e, key)}
                  >
                    <div className="px-3 py-2.5 border-b border-neutral-800 flex items-center justify-between gap-2 sticky top-0 bg-[#161616] rounded-t-xl z-10">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ background: isNone ? "var(--c-txt-faint)" : choiceColor(key) }}
                        />
                        <span className="text-[12px] font-bold text-white truncate">
                          {isNone ? "بدون قيمة" : key}
                        </span>
                      </div>
                      <span className="text-[10px] text-neutral-500 font-bold bg-[#1f1f1f] rounded px-1.5 py-0.5">
                        {list.length}
                      </span>
                    </div>
                    <div className={`flex-1 overflow-y-auto p-2 ${densityCardSpacing}`}>
                      {list.length === 0 && (
                        <p
                          className={`text-[11px] text-center py-4 ${
                            isDragOver ? "text-amber-400 font-bold" : "text-neutral-600"
                          }`}
                        >
                          {isDragOver ? "أفلت هنا" : "لا سجلات"}
                        </p>
                      )}
                      {list.map((rec) => {
                        const titleVal = primary ? rec.fields[primary.name] : null;
                        const title = renderCellPreview(titleVal) || rec.id;
                        const isDragging = kanbanDraggingId === rec.id;
                        const isMoving = kanbanMoving === rec.id;
                        return (
                          <div
                            key={rec.id}
                            draggable={canEdit && !isMoving}
                            onDragStart={(e) => onCardDragStart(e, rec.id)}
                            onDragEnd={onCardDragEnd}
                            className={`bg-[#1a1a1a] border rounded-lg ${densityCard} hover:border-neutral-700 transition-all group relative ${
                              isDragging ? "opacity-40 scale-95" : ""
                            } ${isMoving ? "opacity-60" : ""} ${
                              canEdit ? "cursor-grab active:cursor-grabbing" : ""
                            }`}
                            title={canEdit ? "اسحب لتغيير الحالة" : undefined}
                          >
                            {canEdit && (
                              <GripVertical className="w-3.5 h-3.5 text-neutral-600 absolute top-2 left-2 opacity-0 group-hover:opacity-100 pointer-events-none" />
                            )}
                            <p
                              className={`font-bold text-white leading-snug line-clamp-2 break-words ${
                                kanbanDensity === "compact" ? "text-[11px]" : kanbanDensity === "comfy" ? "text-[13px]" : "text-[12px]"
                              }`}
                            >
                              {title}
                            </p>
                            {cardFields.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {cardFields.map((f) => {
                                  const v = rec.fields[f.name];
                                  if (v == null || v === "") return null;
                                  const preview = renderCellPreview(v);
                                  if (!preview) return null;
                                  return (
                                    <div key={f.id} className="flex items-start gap-1.5">
                                      <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wide shrink-0 mt-[2px]">
                                        {f.name}
                                      </span>
                                      <span
                                        className={`text-neutral-300 break-words ${
                                          kanbanDensity === "compact"
                                            ? "text-[10px] line-clamp-1"
                                            : kanbanDensity === "comfy"
                                              ? "text-[12px] line-clamp-3"
                                              : "text-[11px] line-clamp-2"
                                        }`}
                                      >
                                        {preview}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {canEdit && choices.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-neutral-800 opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="zto-select-wrap">
                                  <select
                                    className="zto-input text-[10px] !py-1 !pr-2 !pl-7"
                                    value={isNone ? "" : key}
                                    disabled={isMoving}
                                    onChange={(e) => updateRecordField(rec.id, groupField.name, e.target.value || null)}
                                    onMouseDown={(e) => e.stopPropagation()}
                                  >
                                    <option value="">— بدون —</option>
                                    {choices.map((c) => (
                                      <option key={c.name} value={c.name}>{c.name}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* Vertical resize handle on the left edge (RTL). */}
                    <div
                      onPointerDown={(e) => onResizeStart(e, key)}
                      className="absolute top-0 bottom-0 -left-1.5 w-3 cursor-col-resize flex items-center justify-center group/resize"
                      title="اسحب لضبط عرض العمود"
                    >
                      <div className="w-px h-full bg-neutral-800 group-hover/resize:bg-amber-400 transition-colors" />
                      <GripHorizontal className="w-3 h-3 text-neutral-600 group-hover/resize:text-amber-400 transition-colors absolute" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

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

      {!selectedBase && !loading && basesError && null}

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
