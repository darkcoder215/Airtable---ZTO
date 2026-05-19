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
  RotateCcw,
  Wand2,
  Bot,
  Sparkles,
  Settings,
  Sliders,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import PageGuide from "@/components/PageGuide";

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

// Relative-time label in Arabic for kanban date cells. Returns the
// label string plus the parsed direction (past vs future) and a rough
// day-distance so callers can drive urgency colors.
function relativeTimeAr(iso: string): { label: string; isPast: boolean; daysAgo: number } {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return { label: iso, isPast: false, daysAgo: 0 };
  const now = Date.now();
  const diffMs = t - now; // negative if past
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const months = Math.round(days / 30);
  let unit: string;
  if (mins < 60) unit = mins <= 1 ? "دقيقة" : `${mins} دقيقة`;
  else if (hours < 24) unit = hours <= 1 ? "ساعة" : `${hours} ساعة`;
  else if (days < 30) unit = days <= 1 ? "يوم" : `${days} أيام`;
  else if (months < 12) unit = months <= 1 ? "شهر" : `${months} أشهر`;
  else {
    const yrs = Math.round(days / 365);
    unit = yrs <= 1 ? "سنة" : `${yrs} سنوات`;
  }
  const label = diffMs < 0 ? `منذ ${unit}` : `بعد ${unit}`;
  return { label, isPast: diffMs < 0, daysAgo: diffMs < 0 ? days : 0 };
}

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

  /* per-column width (grid view) — px, persisted in localStorage keyed by
     {baseId}:{tableId}:{fieldId}. Each column gets a default width and a
     pair of widen/narrow arrows in the header so users can shape the grid
     to fit the content they care about most. */
  const COL_DEFAULT = 220;
  const COL_MIN = 80;
  const COL_MAX = 720;
  const COL_STEP = 60;
  const [gridColWidth, setGridColWidth] = useState<Record<string, number>>({});

  // Hydrate once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("zto-grid-col-width");
      if (raw) setGridColWidth(JSON.parse(raw));
    } catch {
      // localStorage may be unavailable — non-fatal
    }
  }, []);
  // Persist on every change.
  useEffect(() => {
    try {
      localStorage.setItem("zto-grid-col-width", JSON.stringify(gridColWidth));
    } catch {}
  }, [gridColWidth]);

  const colKey = (fieldId: string) =>
    `${selectedBase?.id ?? "_"}:${selectedTable?.id ?? "_"}:${fieldId}`;
  const colWidthOf = (fieldId: string) =>
    gridColWidth[colKey(fieldId)] ?? COL_DEFAULT;
  const setColWidth = (fieldId: string, w: number) => {
    const clamped = Math.max(COL_MIN, Math.min(COL_MAX, w));
    setGridColWidth((cur) => ({ ...cur, [colKey(fieldId)]: clamped }));
  };
  const widenColumn = (fieldId: string) => setColWidth(fieldId, colWidthOf(fieldId) + COL_STEP);
  const narrowColumn = (fieldId: string) => setColWidth(fieldId, colWidthOf(fieldId) - COL_STEP);
  const resetAllColumnWidths = () => {
    if (!selectedBase || !selectedTable) return;
    const prefix = `${selectedBase.id}:${selectedTable.id}:`;
    setGridColWidth((cur) => {
      const next: Record<string, number> = {};
      for (const [k, v] of Object.entries(cur)) {
        if (!k.startsWith(prefix)) next[k] = v;
      }
      return next;
    });
  };


  /* view mode */
  // Per-user kanban card configuration. The user can pick which fields
  // appear on the card and mark them as bold. Keyed by base:table so a
  // single user can have a different layout per table.
  const [kanbanCardFieldIds, setKanbanCardFieldIds] = useState<string[]>([]);
  const [kanbanCardBold, setKanbanCardBold] = useState<Record<string, boolean>>({});
  const [showCardConfig, setShowCardConfig] = useState(false);

  const cardCfgKey = `zto-kanban-card:${selectedBase?.id ?? "_"}:${selectedTable?.id ?? "_"}`;
  // Hydrate when the table changes.
  useEffect(() => {
    if (!selectedBase || !selectedTable) {
      setKanbanCardFieldIds([]);
      setKanbanCardBold({});
      return;
    }
    try {
      const raw = localStorage.getItem(cardCfgKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { fieldIds?: string[]; bold?: Record<string, boolean> };
        setKanbanCardFieldIds(Array.isArray(parsed.fieldIds) ? parsed.fieldIds : []);
        setKanbanCardBold(parsed.bold && typeof parsed.bold === "object" ? parsed.bold : {});
      } else {
        setKanbanCardFieldIds([]);
        setKanbanCardBold({});
      }
    } catch {
      setKanbanCardFieldIds([]);
      setKanbanCardBold({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBase?.id, selectedTable?.id]);

  const saveCardCfg = (fieldIds: string[], bold: Record<string, boolean>) => {
    setKanbanCardFieldIds(fieldIds);
    setKanbanCardBold(bold);
    try {
      localStorage.setItem(cardCfgKey, JSON.stringify({ fieldIds, bold }));
    } catch {}
  };

  // Kanban is the default — most users grok cards faster than a wide
  // grid, and the writer-role workflow always lands in kanban. The
  // last-chosen view is restored from localStorage on mount.
  const [view, setView] = useState<"grid" | "kanban">("kanban");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("zto-dashboard-view");
      if (saved === "grid" || saved === "kanban") setView(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("zto-dashboard-view", view);
    } catch {}
  }, [view]);
  const [kanbanGroupField, setKanbanGroupField] = useState<string | null>(null);
  const [kanbanMoving, setKanbanMoving] = useState<string | null>(null);

  /* Record-detail drawer (opened by clicking a Kanban card or the
     "expand row" arrow in grid view). Pulls full record + comments from
     Airtable and renders all fields + a threaded comments timeline plus a
     compose box. */
  interface RecordComment {
    id: string;
    text: string;
    createdTime: string;
    lastUpdatedTime?: string;
    author?: { id: string; email?: string; name?: string };
    parentCommentId?: string | null;
  }
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  // Inline edit state for the expanded record card. We only track one
  // active edit at a time (the field the writer just clicked); the
  // input is hosted right inside the field's tile and saves via the
  // existing updateRecordField -> /api/airtable PATCH path.
  const [modalEditField, setModalEditField] = useState<string | null>(null);
  const [modalEditValue, setModalEditValue] = useState<unknown>(null);
  const [modalEditSaving, setModalEditSaving] = useState(false);
  const [comments, setComments] = useState<RecordComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  // Per-user preferences for which sections of the expanded record card
  // should be visible. Persisted to localStorage so the user's choices
  // survive reloads. Defaults: everything on, except empty fields which
  // start collapsed (their disclosure tag still flips them open ad-hoc).
  type CardSectionKey =
    | "aiTools"
    | "gallery"
    | "fields"
    | "emptyFields"
    | "comments"
    | "writer"
    | "imageGenerator";
  type CardSectionPrefs = Record<CardSectionKey, boolean>;
  const DEFAULT_CARD_PREFS: CardSectionPrefs = {
    aiTools: true,
    gallery: true,
    fields: true,
    emptyFields: false,
    comments: true,
    writer: true,
    imageGenerator: true,
  };
  const [cardPrefs, setCardPrefs] = useState<CardSectionPrefs>(DEFAULT_CARD_PREFS);
  const [showCardPrefs, setShowCardPrefs] = useState(false);
  // Inline image-generator embed — when true the section expands to an
  // iframe of /dashboard/image-generator?embed=1 so writers don't have
  // to leave the card to make a post image.
  const [imgGenEmbedded, setImgGenEmbedded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("zto-card-prefs");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<CardSectionPrefs>;
      setCardPrefs((prev) => ({ ...prev, ...parsed }));
    } catch {
      // ignore — corrupt prefs just fall back to defaults
    }
  }, []);

  const updateCardPref = (key: CardSectionKey, val: boolean) => {
    setCardPrefs((prev) => {
      const next = { ...prev, [key]: val };
      try {
        localStorage.setItem("zto-card-prefs", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const resetCardPrefs = () => {
    setCardPrefs(DEFAULT_CARD_PREFS);
    try {
      localStorage.setItem("zto-card-prefs", JSON.stringify(DEFAULT_CARD_PREFS));
    } catch {}
  };

  const detailRecord = detailRecordId
    ? records.find((r) => r.id === detailRecordId) ?? null
    : null;

  const loadComments = async (recId: string) => {
    if (!selectedBase || !selectedTable) return;
    setCommentsLoading(true);
    setCommentsError(null);
    try {
      const params = new URLSearchParams({
        action: "comments",
        baseId: selectedBase.id,
        tableId: selectedTable.id,
        recordId: recId,
      });
      const res = await fetch(`/api/airtable?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل جلب التعليقات");
      setComments(Array.isArray(data.comments) ? data.comments : []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "فشل جلب التعليقات";
      setCommentsError(msg);
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  };

  useEffect(() => {
    if (!detailRecordId) {
      setComments([]);
      setCommentsError(null);
      setNewComment("");
      return;
    }
    void loadComments(detailRecordId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailRecordId]);

  const submitComment = async () => {
    if (!detailRecordId || !selectedBase || !selectedTable) return;
    const text = newComment.trim();
    if (!text) return;
    setPostingComment(true);
    try {
      const res = await fetch("/api/airtable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add-comment",
          baseId: selectedBase.id,
          tableId: selectedTable.id,
          recordId: detailRecordId,
          text,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || "فشل إضافة التعليق", "error");
        return;
      }
      // Optimistic-feeling: prepend the returned comment so the user sees
      // their addition without waiting for a refetch.
      if (data.comment) {
        setComments((cur) => [data.comment, ...cur]);
      }
      setNewComment("");
      addToast("تمّ إضافة التعليق", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "خطأ في الشبكة", "error");
    } finally {
      setPostingComment(false);
    }
  };

  const deleteCommentOnRecord = async (commentId: string) => {
    if (!detailRecordId || !selectedBase || !selectedTable) return;
    if (!confirm("حذف التعليق؟")) return;
    try {
      const res = await fetch("/api/airtable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete-comment",
          baseId: selectedBase.id,
          tableId: selectedTable.id,
          recordId: detailRecordId,
          commentId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || "فشل الحذف", "error");
        return;
      }
      setComments((cur) => cur.filter((c) => c.id !== commentId));
      addToast("تمّ الحذف", "success");
    } catch {
      addToast("خطأ في الشبكة", "error");
    }
  };

  // ESC closes the drawer; arrow/swipe behaviours can come later.
  useEffect(() => {
    if (!detailRecordId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetailRecordId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailRecordId]);
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
  // In kanban view we auto-paginate every page so newly-added
  // records — which Airtable appends at the bottom — show up
  // without the writer having to discover the small "next page"
  // arrow. In grid view we keep the per-page model (still 100
  // now, up from 50) so very large tables stay responsive.
  const loadRecords = useCallback(
    (pageOffset?: string, opts?: { drainAll?: boolean }) => {
      if (!selectedBase || !selectedTable) return;
      setLoadingRecords(true);
      setRecordsError(null);

      const buildParams = (off?: string) => {
        const p = new URLSearchParams({
          action: "records",
          baseId: selectedBase.id,
          tableId: selectedTable.id,
          pageSize: "100",
        });
        if (off) p.set("offset", off);
        if (filterFormula.trim()) p.set("filter", filterFormula.trim());
        if (sortField) {
          p.set("sortField", sortField);
          p.set("sortDir", sortDir);
        }
        return p;
      };

      const drain = opts?.drainAll === true;

      (async () => {
        try {
          if (!drain) {
            const params = buildParams(pageOffset);
            const r = await fetch(`/api/airtable?${params.toString()}`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            if (data.error) {
              setRecordsError(data.error);
              addToast(data.error, "error");
              return;
            }
            if (data.records) {
              setRecords(data.records);
              setOffset(data.offset);
              if (data.linkedRecordNames) {
                setLinkedNames((prev) => ({ ...prev, ...data.linkedRecordNames }));
              }
            }
            return;
          }

          // Drain mode: keep pulling until Airtable stops returning
          // an offset. Cap at 20 pages (2k records) so a misconfig
          // can't lock up the UI for minutes.
          const acc: AirtableRecord[] = [];
          let nextOffset: string | undefined;
          for (let i = 0; i < 20; i++) {
            const params = buildParams(i === 0 ? undefined : nextOffset);
            const r = await fetch(`/api/airtable?${params.toString()}`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            if (data.error) {
              setRecordsError(data.error);
              addToast(data.error, "error");
              return;
            }
            if (Array.isArray(data.records)) acc.push(...data.records);
            if (data.linkedRecordNames) {
              setLinkedNames((prev) => ({ ...prev, ...data.linkedRecordNames }));
            }
            nextOffset = data.offset;
            if (!nextOffset) break;
          }
          setRecords(acc);
          setOffset(undefined);
        } catch {
          const msg =
            "فشل تحميل السجلات. تحقق من صيغة الفلترة إذا كنت تستخدمها.";
          setRecordsError(msg);
          addToast(msg, "error");
        } finally {
          setLoadingRecords(false);
        }
      })();
    },
    [selectedBase, selectedTable, filterFormula, sortField, sortDir, addToast]
  );

  useEffect(() => {
    if (selectedTable) {
      setPrevOffsets([]);
      // Kanban defaults to "show me everything"; grid keeps paging.
      loadRecords(undefined, { drainAll: view === "kanban" });
    }
  }, [selectedTable, loadRecords, view]);

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
    field: Field,
    opts?: { full?: boolean }
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
      // In the expanded card we have room to render objects
      // intelligibly (user records, agent outputs, generic
      // key/value blobs). Grid view keeps the compact JSON.
      if (opts?.full) {
        return <ParsedJsonValue value={value} />;
      }
      return (
        <span className="text-[11px] text-neutral-500 font-mono break-all">
          {JSON.stringify(value)}
        </span>
      );
    }

    const strVal = String(value);
    // JSON-string detection. Some fields land in Airtable as the
    // serialised output of upstream agents (e.g. `{"state":"error",
    // "errorType":"emptyDependency","value":null,"isStale":false}`).
    // Showing the raw JSON is hostile — the user wants to know "what
    // went wrong" or "what's the value", not parse code. We try a
    // strict parse, and if it succeeds, hand it to a friendly renderer.
    if (opts?.full && /^\s*[{\[]/.test(strVal)) {
      try {
        const parsed = JSON.parse(strVal);
        return <ParsedJsonValue value={parsed} />;
      } catch {
        // not valid JSON — fall through to the regular text path
      }
    }
    // Expanded-card path (opts.full): hand the full string to the
    // ExpandableText component which auto-collapses very long values
    // behind a «اقرأ المزيد» button while staying selectable. Grid view
    // (default) preserves the legacy 80-char preview with a title
    // tooltip — the grid cell layer handles its own clamp so the
    // string returned here doesn't fight CSS.
    if (opts?.full) {
      return <ExpandableText text={strVal} />;
    }
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

  // Edit gate: admin, editor, and content_writer can write. The
  // server-side access-control layer (lib/access-control.ts) does
  // the real authorisation per-table for content_writer accounts
  // via their allowed_table_ids, so unbounded UI here is safe — a
  // writer attempting to edit a table outside their allowlist still
  // gets rejected by /api/airtable. Viewer remains read-only.
  const canEdit =
    user?.role === "admin" || user?.role === "editor" || user?.role === "content_writer";
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

  // Bulk expand/collapse all rows — quick toggle for "show me everything"
  // vs "show me a clean overview" without manually clicking each chevron.
  const allRowsExpanded =
    filteredRecords.length > 0 && filteredRecords.every((r) => expandedRows.has(r.id));
  const toggleExpandAll = () => {
    if (allRowsExpanded) setExpandedRows(new Set());
    else setExpandedRows(new Set(filteredRecords.map((r) => r.id)));
  };

  /* ──────────────────── JSX ──────────────────── */

  return (
    <div className="space-y-0 max-w-full">
      {/* Welcome guide — tailored copy for content_writer accounts so
          they understand the per-table allowlist and where to find the
          writing utilities. Defaults to open on their first visit. */}
      {user?.role === "content_writer" && (
        <div className="mb-4">
          <PageGuide
            pageName="مساحة العمل"
            accent="purple"
            defaultOpen
            storageKey="dashboard-writer"
            intro={
              <>
                مرحباً بك في مساحة عملك. هنا تجد فقط الجداول التي خصّصها لك المدير من قاعدة بيانات Airtable —
                أيّ جدول لا تراه هنا هو خارج صلاحيتك. كل ما تكتبه أو تعدّله يُحفظ مباشرةً في Airtable ويظهر لباقي الفريق فوراً.
              </>
            }
            tips={[
              {
                title: "تنقّل بين الجداول",
                body: <>تبويبات أعلى الجدول تعرض كل الجداول المُتاحة لك. اضغط أيّ تبويب لفتح سجلاته.</>,
              },
              {
                title: "افتح أيّ سجلّ بالتفصيل",
                body: <>اضغط أيقونة العين بجانب أيّ سجل لعرض كل الحقول وتحريرها بسهولة، أو استخدم زرّ التحرير المباشر داخل الخلية.</>,
              },
              {
                title: "أدوات الكتابة جاهزة",
                body: <>من القائمة الجانبية اختر <span className="text-amber-300 font-bold">«وكلاء الكتابة»</span> لاستخدام مساعدي الذكاء الاصطناعي، و<span className="text-amber-300 font-bold">«مولّد الصور»</span> لتوليد صور مرافقة للمقالات.</>,
              },
              {
                title: "تابع مهامك من «المهام»",
                body: <>أيّ مهمّة يكلّفك بها المدير تظهر في تبويب <span className="text-amber-300 font-bold">«المهام»</span> مع جرس إشعار أعلى الصفحة. عدّل الحالة هناك حتى نعرف أين وصلت.</>,
              },
              {
                title: "البحث والفلترة",
                body: <>استخدم خانة البحث أعلى الجدول لإيجاد سجل بسرعة، وفلتر العمود لاستهداف حقول معيّنة.</>,
              },
              {
                title: "لا تقلق من الحذف",
                body: <>صلاحيتك تشمل التحرير والإضافة فقط. الحذف محجوب لحمايتك من الأخطاء — لو احتجت حذف سجل، تواصل مع المدير.</>,
              },
            ]}
          />
        </div>
      )}

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
                className="zto-input text-[13px]" style={{ paddingInlineStart: "2.5rem" }}
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
                  loadRecords(undefined, { drainAll: view === "kanban" });
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

            {/* Card configuration — opens a panel where the user picks
                which fields appear on every card and which to bold.
                Saved per user × table. */}
            {view === "kanban" && selectedTable && (
              <button
                onClick={() => setShowCardConfig((v) => !v)}
                className={`zto-btn zto-btn-sm ${showCardConfig ? "zto-btn-outline" : "zto-btn-ghost"}`}
                title="تخصيص حقول البطاقة"
              >
                <Settings className="w-3.5 h-3.5" />
                حقول البطاقة
              </button>
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

            {/* Bulk row expand + reset column widths (grid view only) */}
            {view === "grid" && filteredRecords.length > 0 && (
              <>
                <button
                  onClick={toggleExpandAll}
                  className="zto-btn zto-btn-ghost zto-btn-sm text-[10px]"
                  title={allRowsExpanded ? "طي كل الصفوف" : "توسيع كل الصفوف"}
                >
                  <Maximize2 className="w-3 h-3" />
                  {allRowsExpanded ? "طي الكل" : "توسيع الكل"}
                </button>
                <button
                  onClick={resetAllColumnWidths}
                  className="zto-btn zto-btn-ghost zto-btn-sm text-[10px]"
                  title="إعادة ضبط عرض الأعمدة"
                >
                  <RotateCcw className="w-3 h-3" />
                  ضبط الأعمدة
                </button>
              </>
            )}

            <span className="text-[11px] text-neutral-500 font-bold">
              {filteredRecords.length} سجل
            </span>
            <button
              onClick={() => loadRecords(undefined, { drainAll: view === "kanban" })}
              disabled={loadingRecords}
              className="zto-btn zto-btn-ghost zto-btn-sm"
              title={view === "kanban" ? "تحديث كل السجلات" : "تحديث الصفحة"}
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
                  onKeyDown={(e) => { if (e.key === "Enter") loadRecords(undefined, { drainAll: view === "kanban" }); }}
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
                <button onClick={() => loadRecords(undefined, { drainAll: view === "kanban" })} className="zto-btn zto-btn-gold zto-btn-sm">
                  <Filter className="w-3 h-3" />
                  تطبيق
                </button>
                <button
                  onClick={() => { setFilterRules([]); loadRecords(undefined, { drainAll: view === "kanban" }); }}
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
                    const w = colWidthOf(field.id);
                    return (
                      <th
                        key={field.id}
                        className="px-4 py-3 text-[11px] font-bold text-neutral-400 text-right border-b-2 border-neutral-700 border-r border-neutral-800"
                        style={{ width: w, minWidth: w, maxWidth: w }}
                      >
                        <div className="flex items-center gap-1.5">
                          <Icon className={`w-3.5 h-3.5 ${typeColor} shrink-0`} />
                          <span className="truncate flex-1">{field.name}</span>
                          {/* Resize controls — small, subtle, click to step */}
                          <div className="flex items-center opacity-50 hover:opacity-100 transition-opacity shrink-0">
                            <button
                              onClick={() => narrowColumn(field.id)}
                              disabled={w <= COL_MIN}
                              className="p-0.5 text-neutral-500 hover:text-amber-400 disabled:opacity-30 disabled:hover:text-neutral-500"
                              title="تصغير العمود"
                            >
                              <ChevronRight className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => widenColumn(field.id)}
                              disabled={w >= COL_MAX}
                              className="p-0.5 text-neutral-500 hover:text-amber-400 disabled:opacity-30 disabled:hover:text-neutral-500"
                              title="توسيع العمود"
                            >
                              <ChevronLeft className="w-3 h-3" />
                            </button>
                          </div>
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
                        const cellWidth = colWidthOf(field.id);
                        return (
                          <td
                            key={field.id}
                            className={`px-4 ${rowPadding} text-[13px] border-r border-neutral-700/50 align-top ${
                              cellEditable && !isCellEditing ? "cursor-pointer hover:bg-amber-400/5" : ""
                            }`}
                            style={
                              isCellExpanded
                                ? undefined
                                : { width: cellWidth, minWidth: cellWidth, maxWidth: cellWidth }
                            }
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
                              onClick={() => setDetailRecordId(record.id)}
                              className="zto-btn zto-btn-ghost zto-btn-sm text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity hover:!text-amber-400"
                              style={{ padding: "4px 8px" }}
                              title="فتح بطاقة التفاصيل + التعليقات"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
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
      {/* Kanban card configuration panel — opens above the kanban grid
          when the user clicks the Settings button in the toolbar. Lets
          them choose which fields show on every card, reorder them,
          and mark per-field bold. Saved per user × table to
          localStorage so it survives reloads. */}
      {view === "kanban" && showCardConfig && selectedTable && (() => {
        const candidate = visibleFields.filter((f) => f.id !== selectedTable.primaryFieldId);
        const orderedSelected = kanbanCardFieldIds
          .map((id) => candidate.find((f) => f.id === id))
          .filter((f): f is Field => !!f);
        const remaining = candidate.filter((f) => !kanbanCardFieldIds.includes(f.id));
        const move = (idx: number, delta: number) => {
          const next = [...kanbanCardFieldIds];
          const j = idx + delta;
          if (j < 0 || j >= next.length) return;
          [next[idx], next[j]] = [next[j], next[idx]];
          saveCardCfg(next, kanbanCardBold);
        };
        const toggleField = (id: string) => {
          if (kanbanCardFieldIds.includes(id)) {
            saveCardCfg(kanbanCardFieldIds.filter((x) => x !== id), kanbanCardBold);
          } else {
            saveCardCfg([...kanbanCardFieldIds, id], kanbanCardBold);
          }
        };
        const toggleBold = (id: string) => {
          saveCardCfg(kanbanCardFieldIds, { ...kanbanCardBold, [id]: !kanbanCardBold[id] });
        };
        const resetCfg = () => {
          saveCardCfg([], {});
        };
        return (
          <div className="border border-amber-400/30 border-t-0 rounded-b-xl p-4 bg-amber-400/[0.03] mb-3">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div>
                <p className="text-sm font-black text-white flex items-center gap-2">
                  <Settings className="w-4 h-4 text-amber-300" />
                  حقول البطاقة
                </p>
                <p className="text-[0.65rem] text-neutral-400 font-bold mt-0.5">
                  اختر الحقول التي تظهر على بطاقات Kanban، ورتّبها، وعلّم ما تريد إبرازه بالخط الغامق. تُحفظ في متصفّحك.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={resetCfg} className="zto-btn zto-btn-ghost zto-btn-sm" title="إعادة إلى الافتراضي">
                  <RotateCcw className="w-3.5 h-3.5" />
                  افتراضي
                </button>
                <button onClick={() => setShowCardConfig(false)} className="zto-btn zto-btn-outline zto-btn-sm">
                  <X className="w-3.5 h-3.5" />
                  إغلاق
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <p className="text-[0.6rem] font-black text-neutral-500 uppercase tracking-widest mb-1.5">
                  الحقول المعروضة ({orderedSelected.length})
                </p>
                <div className="bg-[#0d0d0d] border border-neutral-800 rounded space-y-1 p-1.5 max-h-64 overflow-y-auto">
                  {orderedSelected.length === 0 ? (
                    <p className="text-[0.65rem] text-neutral-500 text-center py-3 font-bold">
                      لم تختر بعد — الافتراضي = أول 3 حقول
                    </p>
                  ) : (
                    orderedSelected.map((f, idx) => (
                      <div key={f.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-amber-400/5 text-amber-200">
                        <span className="text-[0.55rem] font-mono text-neutral-500 w-4">{idx + 1}</span>
                        <span className="text-xs font-bold flex-1 truncate">{f.name}</span>
                        <button
                          onClick={() => toggleBold(f.id)}
                          className={`text-[0.55rem] font-black rounded px-1.5 py-0.5 border ${
                            kanbanCardBold[f.id] ? "border-amber-400/60 text-amber-200 bg-amber-400/10" : "border-neutral-700 text-neutral-500"
                          }`}
                          title="غامق"
                        >
                          B
                        </button>
                        <button
                          onClick={() => move(idx, -1)}
                          disabled={idx === 0}
                          className="text-neutral-500 hover:text-amber-300 disabled:opacity-30"
                          title="أعلى"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => move(idx, 1)}
                          disabled={idx === orderedSelected.length - 1}
                          className="text-neutral-500 hover:text-amber-300 disabled:opacity-30"
                          title="أسفل"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button onClick={() => toggleField(f.id)} className="text-neutral-500 hover:text-red-400" title="إزالة">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="text-[0.6rem] font-black text-neutral-500 uppercase tracking-widest mb-1.5">
                  الحقول المتاحة ({remaining.length})
                </p>
                <div className="bg-[#0d0d0d] border border-neutral-800 rounded space-y-1 p-1.5 max-h-64 overflow-y-auto">
                  {remaining.length === 0 ? (
                    <p className="text-[0.65rem] text-neutral-500 text-center py-3 font-bold">— الكل مختار —</p>
                  ) : (
                    remaining.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => toggleField(f.id)}
                        className="w-full text-right flex items-center gap-2 px-2 py-1.5 rounded hover:bg-amber-400/5 text-neutral-300 hover:text-amber-200 transition-colors"
                      >
                        <Plus className="w-3 h-3 shrink-0" />
                        <span className="text-xs font-bold flex-1 truncate">{f.name}</span>
                        <code className="text-[0.55rem] text-neutral-600 font-mono">{f.type}</code>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
        // Card fields: prefer the user's saved preference (per-user, keyed by
        // base:table) when present, otherwise the first 3 visible non-primary
        // non-group fields. Per-field 'bold' state is also stored on the same
        // map and applied at render time.
        const cardFields = (kanbanCardFieldIds.length > 0
          ? (kanbanCardFieldIds
              .map((id) => visibleFields.find((f) => f.id === id))
              .filter((f): f is Field => !!f && f.id !== selectedTable.primaryFieldId && f.name !== groupField.name)
            )
          : visibleFields.filter((f) => f.id !== selectedTable.primaryFieldId && f.name !== groupField.name).slice(0, 3));

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
                            onClick={(e) => {
                              // Don't open the drawer if the click came
                              // from one of the inline controls (the
                              // status select, the grip, etc.).
                              const target = e.target as HTMLElement;
                              if (target.closest("select, button, .zto-select-wrap, [data-no-open]")) return;
                              setDetailRecordId(rec.id);
                            }}
                            className={`bg-[#1a1a1a] border rounded-lg ${densityCard} hover:border-amber-400/40 hover:-translate-y-0.5 transition-all duration-150 group relative ${
                              isDragging ? "opacity-40 scale-95" : ""
                            } ${isMoving ? "opacity-60" : ""} ${
                              canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                            }`}
                            title={canEdit ? "انقر للتفاصيل، اسحب لتغيير الحالة" : "انقر للتفاصيل"}
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
                              <div className="mt-2 space-y-1.5">
                                {cardFields.map((f) => {
                                  const v = rec.fields[f.name];
                                  const isBold = kanbanCardBold[f.id] === true;
                                  const isEmpty = v == null || v === "" || (Array.isArray(v) && v.length === 0);
                                  // Date fields get a "since X" relative
                                  // rendering so the writer sees urgency
                                  // at a glance. Past dates render red
                                  // (overdue), recent ones amber-ish,
                                  // others stay neutral.
                                  const isDate =
                                    f.type === "date" ||
                                    f.type === "dateTime" ||
                                    f.type === "createdTime" ||
                                    f.type === "lastModifiedTime";
                                  let display: string;
                                  let urgencyTone = "";
                                  if (isEmpty) {
                                    display = "—";
                                  } else if (isDate && typeof v === "string") {
                                    const ago = relativeTimeAr(v);
                                    display = ago.label;
                                    if (ago.isPast && ago.daysAgo >= 7) urgencyTone = "text-red-300";
                                    else if (ago.isPast && ago.daysAgo >= 2) urgencyTone = "text-amber-300";
                                  } else {
                                    display = renderCellPreview(v) || "—";
                                  }
                                  // URL fields (or any string value that
                                  // happens to be an http(s) link) get
                                  // rendered as a click-to-open anchor so
                                  // the writer can jump to the source
                                  // straight from the kanban without
                                  // opening the detail card.
                                  const isUrl =
                                    f.type === "url" ||
                                    (typeof v === "string" && /^https?:\/\//i.test(v));
                                  const sizeCls =
                                    kanbanDensity === "compact" ? "text-[10px]" :
                                    kanbanDensity === "comfy"  ? "text-[12px]" :
                                                                 "text-[11px]";
                                  const toneCls = isEmpty
                                    ? "text-neutral-600 italic"
                                    : urgencyTone
                                      ? `${urgencyTone} font-bold`
                                      : isBold
                                        ? "text-white font-black"
                                        : "text-neutral-300";
                                  return (
                                    <div key={f.id} className="flex items-start gap-1.5">
                                      <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wide shrink-0 mt-[2px]">
                                        {f.name}
                                      </span>
                                      {isUrl && !isEmpty && typeof v === "string" ? (
                                        <a
                                          href={v}
                                          target="_blank"
                                          rel="noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          data-no-open
                                          className={`text-amber-400 hover:text-amber-300 underline decoration-amber-400/30 hover:decoration-amber-300 break-all ${sizeCls}`}
                                          title={v}
                                        >
                                          {v.replace(/^https?:\/\//, "").slice(0, 80)}
                                        </a>
                                      ) : (
                                        <span
                                          className={`break-words whitespace-pre-wrap leading-snug ${toneCls} ${sizeCls}`}
                                        >
                                          {display}
                                        </span>
                                      )}
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

      {/* Record-detail drawer — opened by clicking a Kanban card */}
      {detailRecord && selectedTable && (() => {
        // Collect every image URL across attachment / url-image / textfield
        // sources. We skip the gallery section entirely when this is empty
        // so non-visual records don't waste vertical space, and we omit
        // the image-bearing fields from the field list since they're
        // already rendered up top.
        type Img = { url: string; filename?: string; fieldName: string };
        const images: Img[] = [];
        const imageFieldIds = new Set<string>();
        const isImageUrl = (s: string) =>
          /^https?:\/\/.+\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?.*)?$/i.test(s) ||
          /pbs\.twimg\.com|licdn\.com|googleusercontent\.com|imgur\.com/i.test(s);
        for (const f of visibleFields) {
          const v = detailRecord.fields[f.name];
          if (f.type === "multipleAttachments" && Array.isArray(v)) {
            const list = v as Array<{ url?: string; filename?: string; type?: string }>;
            const pictures = list.filter((a) =>
              a?.url && (a.type?.startsWith("image/") || isImageUrl(a.url))
            );
            if (pictures.length > 0) {
              imageFieldIds.add(f.id);
              for (const a of pictures) {
                images.push({ url: a.url!, filename: a.filename, fieldName: f.name });
              }
            }
          } else if ((f.type === "url" || f.type === "singleLineText") && typeof v === "string" && isImageUrl(v)) {
            imageFieldIds.add(f.id);
            images.push({ url: v, fieldName: f.name });
          }
        }
        const hasImages = images.length > 0;
        // Field list excludes the image-bearing fields (already shown).
        const nonImageFields = visibleFields.filter((f) => !imageFieldIds.has(f.id));
        const populated = nonImageFields.filter((f) => {
          const v = detailRecord.fields[f.name];
          return !(v == null || v === "" || (Array.isArray(v) && v.length === 0));
        });
        const empty = nonImageFields.filter((f) => !populated.includes(f));
        const primary = selectedTable.fields.find((f) => f.id === selectedTable.primaryFieldId);
        const primaryV = primary ? detailRecord.fields[primary.name] : null;
        const recordTitle = renderCellPreview(primaryV) || detailRecord.id;

        return (
        <div
          className="fixed inset-0 z-50 zto-fade-in"
          dir="rtl"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setDetailRecordId(null)}
          />
          {/* Centered modal — replaces the side drawer. Cap width on
              very wide screens; otherwise stretch with safe margins
              so the content has real breathing room. */}
          <div
            className="absolute inset-0 flex items-center justify-center p-4 sm:p-8 pointer-events-none"
          >
            <aside
              className="pointer-events-auto bg-[#0a0a0a] border border-neutral-800 rounded-2xl shadow-2xl shadow-black/70 flex flex-col zto-slide-up w-full max-w-[1080px] max-h-[calc(100vh-64px)] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
            {/* Sticky header */}
            <header className="sticky top-0 z-10 px-6 py-4 bg-[#0a0a0a]/95 backdrop-blur border-b border-neutral-800 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[0.6rem] text-amber-400 font-black uppercase tracking-widest mb-1.5">
                  {selectedTable.name}
                </p>
                <h2 className="text-xl font-black text-white tracking-tight break-words leading-snug">
                  {recordTitle}
                </h2>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-[0.55rem] text-neutral-600 font-mono">{detailRecord.id}</span>
                  {hasImages && (
                    <span className="zto-badge text-[0.55rem] !py-0.5 border border-amber-400/30 !text-amber-300">
                      {images.length} صورة
                    </span>
                  )}
                  {comments.length > 0 && (
                    <span className="zto-badge text-[0.55rem] !py-0.5 border border-blue-400/30 !text-blue-300">
                      {comments.length} تعليق
                    </span>
                  )}
                </div>
              </div>
              {/* Customize view — controls which sections of this card
                  render. Persists to localStorage so the writer's
                  choices stick across records and sessions. */}
              <div className="relative shrink-0">
                <button
                  onClick={() => setShowCardPrefs((v) => !v)}
                  className="text-neutral-500 hover:text-white p-1.5 rounded-md hover:bg-neutral-800 transition-colors"
                  title="تخصيص العرض"
                >
                  <Sliders className="w-4 h-4" />
                </button>
                {showCardPrefs && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setShowCardPrefs(false)} />
                    <div className="absolute left-0 mt-2 w-64 bg-[#111] border border-neutral-800 rounded-xl shadow-2xl z-30 p-3 zto-fade-in">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[0.7rem] font-black text-white">عرض البطاقة</p>
                        <button
                          onClick={resetCardPrefs}
                          className="text-[0.6rem] text-neutral-500 hover:text-amber-300 font-bold"
                          title="إعادة الإعدادات الافتراضية"
                        >
                          استعادة
                        </button>
                      </div>
                      <p className="text-[0.6rem] text-neutral-500 mb-3 leading-snug">
                        أزل القسمين اللذين لا تستخدمهما — الإعدادات تُحفَظ تلقائياً.
                      </p>
                      <div className="space-y-1.5">
                        {([
                          ["aiTools", "شريط أدوات الذكاء الاصطناعي"],
                          ["gallery", "معرض الصور"],
                          ["fields", "حقول السجل"],
                          ["emptyFields", "إظهار الحقول الفارغة"],
                          ["comments", "التعليقات"],
                          ["writer", "كاتب AI"],
                          ["imageGenerator", "مولّد الصور"],
                        ] as Array<[CardSectionKey, string]>).map(([key, label]) => {
                          const checked = cardPrefs[key];
                          return (
                            <label
                              key={key}
                              className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-neutral-800/40 transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => updateCardPref(key, e.target.checked)}
                                className="shrink-0"
                              />
                              <span className="text-[0.7rem] text-neutral-200 font-bold flex-1">{label}</span>
                              {checked ? (
                                <Eye className="w-3 h-3 text-amber-300" />
                              ) : (
                                <EyeOff className="w-3 h-3 text-neutral-600" />
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={() => setDetailRecordId(null)}
                className="text-neutral-500 hover:text-white p-1.5 rounded-md hover:bg-neutral-800 transition-colors shrink-0"
                title="إغلاق (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* AI quick-access strip — surfaces the writing + image
                  generator tools at the top of the card so writers see
                  them before scrolling through fields and comments.
                  Each chip jumps the scroll to the matching panel. */}
              {cardPrefs.aiTools && (cardPrefs.writer || cardPrefs.imageGenerator) && (
                <section className="zto-fade-in">
                  <div className="bg-gradient-to-br from-purple-500/[0.06] via-amber-400/[0.04] to-transparent border border-amber-400/20 rounded-xl p-3">
                    <p className="text-[0.6rem] font-black text-amber-300 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3" />
                      أدوات الذكاء الاصطناعي
                    </p>
                    <p className="text-[0.65rem] text-neutral-400 mb-3 leading-snug">
                      اكتب منشوراً جاهزاً أو ولّد صورة لهذا السجل دون مغادرة هذه البطاقة.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {cardPrefs.writer && (
                        <button
                          type="button"
                          onClick={() => {
                            document
                              .getElementById("zto-card-writer")
                              ?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }}
                          className="flex items-start gap-2.5 p-3 rounded-lg bg-[#0d0d0d] border border-neutral-800 hover:border-purple-400/40 transition-colors text-right"
                        >
                          <div className="w-8 h-8 rounded-md bg-purple-400/10 border border-purple-400/30 flex items-center justify-center shrink-0">
                            <Bot className="w-4 h-4 text-purple-300" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[0.75rem] font-black text-white">كاتب AI</p>
                            <p className="text-[0.6rem] text-neutral-500 mt-0.5 leading-snug">
                              ولّد منشوراً جاهزاً للنشر مع عدّاد حروف لكل منصّة.
                            </p>
                          </div>
                        </button>
                      )}
                      {cardPrefs.imageGenerator && (
                        <button
                          type="button"
                          onClick={() => {
                            setImgGenEmbedded(true);
                            setTimeout(() => {
                              document
                                .getElementById("zto-card-imggen")
                                ?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }, 60);
                          }}
                          className="flex items-start gap-2.5 p-3 rounded-lg bg-[#0d0d0d] border border-neutral-800 hover:border-amber-400/40 transition-colors text-right"
                        >
                          <div className="w-8 h-8 rounded-md bg-amber-400/10 border border-amber-400/30 flex items-center justify-center shrink-0">
                            <ImageIcon className="w-4 h-4 text-amber-300" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[0.75rem] font-black text-white">مولّد الصور</p>
                            <p className="text-[0.6rem] text-neutral-500 mt-0.5 leading-snug">
                              صمّم صورة منشور مع عنوان ومنطقة شعار جاهزة.
                            </p>
                          </div>
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {/* Hero gallery — only rendered when at least one image
                  field has a value. First image is large; remaining
                  thumbs sit in a strip underneath. Click any thumb to
                  promote it to the hero slot. */}
              {cardPrefs.gallery && hasImages && (
                <section className="zto-fade-in">
                  <DrawerImageGallery images={images} />
                </section>
              )}

              {/* Fields — populated first (visible, normal), empty ones
                  collapsed inside an inline disclosure so they don't
                  visually crowd the populated set. */}
              {cardPrefs.fields && (
              <section>
                <div className="mb-3">
                  <h3 className="text-[0.7rem] font-black text-neutral-300 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-1 h-3 rounded-full bg-amber-400" />
                    الحقول
                    <span className="text-[0.55rem] text-neutral-600 font-mono mr-1">
                      {populated.length}/{nonImageFields.length}
                    </span>
                  </h3>
                  <p className="text-[0.6rem] text-neutral-500 mt-1 leading-snug">
                    كل أعمدة هذا السجل كما هي في Airtable. الحقول الفارغة مطوية في الأسفل. يمكنك توسيع النصوص الطويلة بزرّ «اقرأ المزيد».
                  </p>
                </div>
                {populated.length === 0 ? (
                  <p className="text-[0.7rem] text-neutral-500 italic font-bold">— لا حقول مُعبَّأة —</p>
                ) : (
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {populated.map((field) => {
                      const Icon = getFieldIcon(field.type);
                      const typeColor = getFieldTypeColor(field.type);
                      const v = detailRecord.fields[field.name];
                      const wide =
                        field.type === "multilineText" ||
                        (typeof v === "string" && v.length > 120);
                      const isFieldEditable = canEdit && !READ_ONLY_TYPES.includes(field.type);
                      const isThisEditing = modalEditField === field.name;
                      const saveThisEdit = async () => {
                        if (!detailRecord) return;
                        setModalEditSaving(true);
                        try {
                          await updateRecordField(detailRecord.id, field.name, modalEditValue);
                          setModalEditField(null);
                        } finally {
                          setModalEditSaving(false);
                        }
                      };
                      return (
                        <div
                          key={field.id}
                          className={`bg-[#0d0d0d] border rounded-lg p-3.5 transition-colors group/field ${
                            isThisEditing
                              ? "border-amber-400/60"
                              : "border-neutral-800 hover:border-neutral-700"
                          } ${wide ? "md:col-span-2" : ""}`}
                        >
                          <dt className="flex items-center gap-1.5 text-[0.55rem] uppercase tracking-widest text-neutral-500 font-black mb-2">
                            <Icon className={`w-3 h-3 ${typeColor}`} />
                            <span className="flex-1">{field.name}</span>
                            {isFieldEditable && !isThisEditing && (
                              <button
                                onClick={() => {
                                  setModalEditField(field.name);
                                  setModalEditValue(v);
                                }}
                                className="opacity-0 group-hover/field:opacity-100 text-[0.6rem] text-amber-400 hover:text-amber-300 font-bold transition-opacity"
                                title="تحرير"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            )}
                          </dt>
                          {isThisEditing ? (
                            <div className="space-y-2">
                              {renderFieldInput(field, modalEditValue, setModalEditValue)}
                              <div className="flex items-center gap-2 justify-end">
                                <button
                                  onClick={() => setModalEditField(null)}
                                  className="zto-btn zto-btn-ghost zto-btn-sm"
                                  disabled={modalEditSaving}
                                >
                                  إلغاء
                                </button>
                                <button
                                  onClick={saveThisEdit}
                                  className="zto-btn zto-btn-gold zto-btn-sm"
                                  disabled={modalEditSaving}
                                >
                                  {modalEditSaving ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Save className="w-3.5 h-3.5" />
                                  )}
                                  حفظ
                                </button>
                              </div>
                            </div>
                          ) : (
                            <dd className="text-[13px] text-white font-bold break-words leading-relaxed">
                              {renderFieldValue(v, field, { full: true })}
                            </dd>
                          )}
                        </div>
                      );
                    })}
                  </dl>
                )}

                {cardPrefs.emptyFields && empty.length > 0 && (
                  <details className="mt-3 group" open>
                    <summary className="cursor-pointer text-[0.65rem] text-neutral-500 hover:text-neutral-300 font-bold flex items-center gap-1.5 transition-colors">
                      <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
                      حقول فارغة
                      <span className="text-neutral-700 font-mono">({empty.length})</span>
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {empty.map((f) => {
                        const Icon = getFieldIcon(f.type);
                        return (
                          <span
                            key={f.id}
                            className="inline-flex items-center gap-1 text-[0.6rem] bg-[#0d0d0d] border border-neutral-800 rounded px-2 py-1 text-neutral-500 font-bold"
                          >
                            <Icon className="w-2.5 h-2.5" />
                            {f.name}
                          </span>
                        );
                      })}
                    </div>
                  </details>
                )}
              </section>
              )}

              {/* Comments — Airtable-native record comments */}
              {cardPrefs.comments && (
              <section>
                <div className="mb-3">
                  <h3 className="text-[0.7rem] font-black text-neutral-300 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-1 h-3 rounded-full bg-blue-400" />
                    التعليقات
                    {comments.length > 0 && (
                      <span className="text-[0.65rem] tabular-nums bg-blue-400/15 text-blue-300 border border-blue-400/30 rounded-full px-2 py-0.5 font-black">
                        {comments.length}
                      </span>
                    )}
                  </h3>
                  <p className="text-[0.6rem] text-neutral-500 mt-1 leading-snug">
                    تعليقات Airtable الأصلية على هذا السجل — مرئية لكل فريق العمل ومحفوظة مباشرة في Airtable.
                  </p>
                </div>

                {/* Compose box */}
                <div className="mb-4 bg-[#0d0d0d] border border-neutral-800 rounded-lg p-3 transition-colors focus-within:border-amber-400/40">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      // Cmd/Ctrl + Enter submits — keeps multi-line
                      // editing intuitive while still allowing quick send.
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                        e.preventDefault();
                        void submitComment();
                      }
                    }}
                    placeholder="أضف تعليقاً... (⌘/Ctrl + Enter للإرسال)"
                    className="w-full bg-transparent text-[13px] text-white font-bold placeholder:text-neutral-600 placeholder:font-normal outline-none resize-y min-h-[64px]"
                    maxLength={10000}
                  />
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <span className="text-[0.55rem] text-neutral-600 font-mono tabular-nums">
                      {newComment.length}/10000
                    </span>
                    <button
                      onClick={submitComment}
                      disabled={postingComment || !newComment.trim()}
                      className="zto-btn zto-btn-gold zto-btn-sm"
                    >
                      {postingComment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      نشر
                    </button>
                  </div>
                </div>

                {/* Timeline */}
                {commentsLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-neutral-500" />
                  </div>
                ) : commentsError ? (
                  <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 text-[0.7rem] text-red-300 font-bold">
                    ⚠ {commentsError}
                  </div>
                ) : comments.length === 0 ? (
                  <p className="text-center py-6 text-[0.7rem] text-neutral-500 font-bold">
                    لا تعليقات بعد — كن أوّل من يعلّق.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {comments.map((c, idx) => {
                      const authorName = c.author?.name || c.author?.email || "—";
                      const initial = authorName.trim().slice(0, 1).toUpperCase();
                      const date = new Date(c.createdTime);
                      const dateStr = isNaN(date.getTime())
                        ? c.createdTime
                        : date.toLocaleString("ar-SA", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          });
                      return (
                        <li
                          key={c.id}
                          className="bg-[#0d0d0d] border border-neutral-800 rounded-lg p-3 hover:border-neutral-700 transition-colors zto-stagger-in"
                          style={{ animationDelay: `${idx * 30}ms` }}
                        >
                          <div className="flex items-start gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400/40 to-purple-500/40 border border-neutral-700 flex items-center justify-center text-[0.65rem] font-black text-white shrink-0">
                              {initial || "؟"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-[0.7rem] font-black text-white truncate">
                                  {authorName}
                                </p>
                                <span className="text-[0.55rem] text-neutral-500 font-mono">{dateStr}</span>
                                {canEdit && (
                                  <button
                                    onClick={() => deleteCommentOnRecord(c.id)}
                                    className="mr-auto text-neutral-600 hover:text-red-400 transition-colors"
                                    title="حذف"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                              <p className="text-[13px] text-neutral-200 font-bold whitespace-pre-line break-words leading-relaxed">
                                {c.text}
                              </p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              )}

              {/* AI writer panel — drafts post copy from the article
                  text using a writing-type scraper agent. Lazy-loads
                  the agents list once. The output panel surfaces char,
                  word, and social-channel-fit indicators so writers
                  know whether their copy will be cut on X/LinkedIn. */}
              {cardPrefs.writer && (
                <div id="zto-card-writer">
                  <CardAgentsPanel
                    articleText={detailRecord.fields[primary?.name ?? ""] != null ? renderCellPreview(detailRecord.fields[primary?.name ?? ""]) : ""}
                    fields={detailRecord.fields}
                  />
                </div>
              )}

              {/* Image generator — embedded inline via an iframe in
                  embed mode (?embed=1) so writers can design a post
                  image without leaving the record. Collapsed by default
                  to keep initial load fast. */}
              {cardPrefs.imageGenerator && (() => {
                const titleText = renderCellPreview(primaryV) || "";
                const heroImage = images[0]?.url ?? null;
                const params = new URLSearchParams();
                if (titleText) params.set("text", titleText.slice(0, 800));
                if (heroImage) params.set("image", heroImage);
                params.set("recordId", detailRecord.id);
                params.set("embed", "1");
                const embedUrl = `/dashboard/image-generator?${params.toString()}`;
                const newTabUrl = `/dashboard/image-generator?${(() => {
                  const p = new URLSearchParams(params);
                  p.delete("embed");
                  return p.toString();
                })()}`;
                return (
                  <section
                    id="zto-card-imggen"
                    className="border border-neutral-800 rounded-xl bg-[#0d0d0d] overflow-hidden"
                  >
                    <div className="flex items-center gap-3 flex-wrap p-4">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-9 h-9 rounded-md bg-amber-400/10 border border-amber-400/30 flex items-center justify-center shrink-0">
                          <Wand2 className="w-4 h-4 text-amber-300" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-[0.85rem] font-black text-white">مولّد الصور</h3>
                          <p className="text-[0.65rem] text-neutral-400 font-bold mt-0.5">
                            صمّم صورة المنشور هنا — العنوان + الصورة محمّلان مسبقاً من هذا السجل.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setImgGenEmbedded((v) => !v)}
                          className="zto-btn zto-btn-gold zto-btn-sm"
                        >
                          <Wand2 className="w-3.5 h-3.5" />
                          {imgGenEmbedded ? "إخفاء" : "افتح هنا"}
                        </button>
                        <a
                          href={newTabUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="zto-btn zto-btn-ghost zto-btn-sm"
                          title="فتح في صفحة كاملة"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                    {imgGenEmbedded && (
                      <div className="border-t border-neutral-800 bg-black">
                        <iframe
                          src={embedUrl}
                          title="مولّد الصور"
                          className="w-full h-[720px] border-0 zto-fade-in"
                          loading="lazy"
                        />
                      </div>
                    )}
                  </section>
                );
              })()}
            </div>
            </aside>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

/* ───────── Drawer image gallery ─────────
   Hero + thumbnail strip rendered at the top of the record-detail
   drawer. Promoted image fills a 16:9 frame with object-contain so
   logos / portraits / wide hero shots all display fully. Thumbs
   underneath let the admin flip between every image attached to
   the record. Self-contained — needs no parent state.
*/
/* ─────────────── ParsedJsonValue ───────────────
   Render a JSON value (object / array / scalar) as a readable Arabic
   summary instead of raw `{"state":"error",...}`. Recognises common
   shapes that ship from upstream agents:
     • { state:"error", errorType, ... } → "خطأ: <type>"
     • { value, ... } where value is the only meaningful key → show that
     • everything else → labelled key/value rows
   The component still offers a "إظهار JSON الأصلي" toggle for debugging.
*/
function ParsedJsonValue({ value }: { value: unknown }) {
  const [showRaw, setShowRaw] = useState(false);

  // Friendly summary for the most common shape (an upstream agent
  // returning `{ state: "error" | "ok", value, errorType, ... }`).
  const summary = (() => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const o = value as Record<string, unknown>;
      if (o.state === "error" || o.errorType) {
        const t = (o.errorType ?? "خطأ غير معروف") as string;
        return (
          <span className="inline-flex items-center gap-2">
            <span className="text-red-300 font-bold">⚠ خطأ:</span>
            <code className="text-[0.7rem] text-red-200 font-mono">{String(t)}</code>
          </span>
        );
      }
      if (o.state === "ok" && o.value != null) {
        return <ParsedJsonValue value={o.value} />;
      }
      // Airtable collaborator / user record. Created-by, last-modified-by
      // and any user-link field returns `{ id, email, name, profilePicUrl? }`.
      // Render as a friendly chip instead of raw JSON.
      if (typeof o.name === "string" && typeof o.email === "string") {
        const initial = String(o.name).trim().slice(0, 1).toUpperCase() || "?";
        return (
          <span className="inline-flex items-center gap-2 bg-neutral-900/40 border border-neutral-800 rounded-full pl-3 pr-1.5 py-1">
            <span className="w-6 h-6 rounded-full bg-amber-400/20 text-amber-200 text-[0.7rem] font-black flex items-center justify-center">
              {initial}
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[0.75rem] text-white font-bold">{String(o.name)}</span>
              <span className="text-[0.6rem] text-neutral-500 font-mono">{String(o.email)}</span>
            </span>
          </span>
        );
      }
      // Array of collaborators (multi-user fields).
    }
    if (Array.isArray(value) && value.length > 0 && value.every((v) =>
      v && typeof v === "object" &&
      typeof (v as { name?: unknown }).name === "string"
    )) {
      return (
        <div className="flex flex-wrap gap-1.5">
          {(value as Array<{ name: string; email?: string }>).slice(0, 8).map((u, i) => {
            const initial = u.name.trim().slice(0, 1).toUpperCase() || "?";
            return (
              <span key={i} className="inline-flex items-center gap-1.5 bg-neutral-900/40 border border-neutral-800 rounded-full pl-2 pr-1 py-0.5">
                <span className="w-4 h-4 rounded-full bg-amber-400/20 text-amber-200 text-[0.55rem] font-black flex items-center justify-center">
                  {initial}
                </span>
                <span className="text-[0.7rem] text-neutral-200 font-bold">{u.name}</span>
              </span>
            );
          })}
        </div>
      );
    }
    return null;
  })();

  const raw = JSON.stringify(value, null, 2);

  return (
    <div className="space-y-2">
      {summary}
      {!summary && (
        <RenderJsonInline value={value} />
      )}
      <button
        type="button"
        onClick={() => setShowRaw((v) => !v)}
        className="text-[0.6rem] text-neutral-500 hover:text-amber-300 font-bold"
      >
        {showRaw ? "إخفاء JSON الأصلي" : "إظهار JSON الأصلي"}
      </button>
      {showRaw && (
        <pre className="text-[0.7rem] text-neutral-400 bg-black/40 border border-neutral-800 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all" dir="ltr">
          {raw}
        </pre>
      )}
    </div>
  );
}

// Compact key/value renderer used inside ParsedJsonValue when no
// specific shape is recognised. Strings render inline, objects nest
// once with a small indent, arrays are joined with bullets. Caps depth
// at 2 so a deeply nested blob doesn't blow up the card.
function RenderJsonInline({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null) return <span className="text-neutral-500">—</span>;
  if (typeof value === "string") return <span className="text-neutral-200 whitespace-pre-wrap">{value}</span>;
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="text-emerald-300 font-mono text-[0.75rem]">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-neutral-500">قائمة فارغة</span>;
    return (
      <ul className="space-y-1 pr-3">
        {value.slice(0, 12).map((v, i) => (
          <li key={i} className="text-[0.75rem] text-neutral-300">
            <span className="text-neutral-600 mr-1">·</span>
            <RenderJsonInline value={v} depth={depth + 1} />
          </li>
        ))}
        {value.length > 12 && (
          <li className="text-[0.65rem] text-neutral-500">+ {value.length - 12} عناصر</li>
        )}
      </ul>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-neutral-500">{`{ }`}</span>;
    if (depth >= 2) {
      return <span className="text-neutral-400 font-mono text-[0.7rem]">{`{ ${entries.length} حقل }`}</span>;
    }
    return (
      <dl className="space-y-1">
        {entries.slice(0, 10).map(([k, v]) => (
          <div key={k} className="flex items-start gap-2">
            <dt className="text-[0.65rem] text-amber-300 font-mono shrink-0">{k}:</dt>
            <dd className="text-[0.75rem] text-neutral-200 break-words flex-1 min-w-0">
              <RenderJsonInline value={v} depth={depth + 1} />
            </dd>
          </div>
        ))}
        {entries.length > 10 && (
          <p className="text-[0.65rem] text-neutral-500">+ {entries.length - 10} مفاتيح</p>
        )}
      </dl>
    );
  }
  return <span className="text-neutral-200">{String(value)}</span>;
}

/* ─────────────── ExpandableText ───────────────
   Renders a string fully in the expanded record card. Strings up to
   ~600 chars display as-is so the reader doesn't need a click; longer
   ones collapse behind a clamp + "اقرأ المزيد" button so the card
   doesn't grow into a wall of text. Text stays selectable in both
   states — copying a paragraph still works. */
const EXPANDABLE_THRESHOLD = 600;
function ExpandableText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const isLong = text.length > EXPANDABLE_THRESHOLD;
  if (!isLong) {
    return <span className="text-neutral-200 whitespace-pre-wrap">{text}</span>;
  }
  return (
    <div className="space-y-1.5">
      <div
        className={`text-neutral-200 whitespace-pre-wrap ${
          open ? "" : "max-h-[8.4em] overflow-hidden relative"
        }`}
      >
        {open ? text : text.slice(0, EXPANDABLE_THRESHOLD).trimEnd() + "…"}
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[0.65rem] font-bold text-amber-300 hover:text-amber-200 transition-colors"
      >
        {open ? "طيّ" : `اقرأ المزيد · ${text.length.toLocaleString("ar")} حرف`}
      </button>
    </div>
  );
}

function DrawerImageGallery({
  images,
}: {
  images: { url: string; filename?: string; fieldName: string }[];
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = images[activeIdx] ?? images[0];
  if (!active) return null;
  return (
    <div>
      <div className="bg-[#0d0d0d] border border-neutral-800 rounded-lg overflow-hidden">
        <div className="aspect-video bg-black flex items-center justify-center max-h-[420px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={active.url}
            alt={active.filename ?? active.fieldName}
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0.4";
            }}
          />
        </div>
        <div className="px-3 py-2 border-t border-neutral-800 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-[0.6rem] text-amber-400 font-black uppercase tracking-widest shrink-0">
              {active.fieldName}
            </p>
            {active.filename && (
              <p className="text-[0.6rem] text-neutral-500 font-mono truncate" dir="ltr">
                {active.filename}
              </p>
            )}
          </div>
          <a
            href={active.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[0.6rem] font-bold text-neutral-400 hover:text-amber-300 inline-flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            فتح بحجم كامل
          </a>
        </div>
      </div>
      {images.length > 1 && (
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {images.map((img, i) => {
            const isActive = i === activeIdx;
            return (
              <button
                key={`${img.url}-${i}`}
                onClick={() => setActiveIdx(i)}
                className={`relative w-14 h-14 rounded border overflow-hidden transition-all ${
                  isActive
                    ? "border-amber-400 ring-2 ring-amber-400/30"
                    : "border-neutral-800 hover:border-neutral-600"
                }`}
                title={img.filename ?? img.fieldName}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────── Card agents panel ───────────────
   In-card writer that hands the article text to a writing-style
   scraper agent and shows the draft alongside live counters (chars,
   words, X-friendly + LinkedIn-friendly fits). Collapsed by default
   so the card stays compact for non-writers; the writer role can
   one-click expand and iterate. */

interface CardAgentsPanelProps {
  articleText: string;
  fields: Record<string, unknown>;
}

interface ListedAgent {
  id: string;
  name: string;
  description?: string;
  modelName: string;
  agentType: "writing" | "filtering" | "editing" | "summarizing";
  isActive: boolean;
}

// Twitter/X cap = 280; LinkedIn truncates the feed preview around 210
// chars on web, then shows a "see more" link. We use 280 / 1300 / 2200
// as the three thresholds and grade against them.
const LIMITS = {
  x: 280,
  linkedin_preview: 210,
  linkedin_full: 3000,
  instagram: 2200,
  facebook: 63206,
} as const;

function CardAgentsPanel({ articleText, fields }: CardAgentsPanelProps) {
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<ListedAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState("");
  const [extraPrompt, setExtraPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState("");
  const [runError, setRunError] = useState<string | null>(null);

  // Lazy-load the agents list the first time the panel opens.
  useEffect(() => {
    if (!open || agents.length > 0 || agentsLoading) return;
    let cancelled = false;
    (async () => {
      try {
        setAgentsLoading(true);
        setAgentsError(null);
        const res = await fetch("/api/agents", { cache: "no-store" });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "فشل تحميل الوكلاء");
        if (cancelled) return;
        const all = (Array.isArray(d.agents) ? d.agents : []) as ListedAgent[];
        // Only writing/editing/summarizing agents make sense here —
        // a filtering agent would just return yes/no on the article.
        const usable = all.filter(
          (a) => a.isActive && (a.agentType === "writing" || a.agentType === "editing" || a.agentType === "summarizing")
        );
        setAgents(usable);
        if (usable.length > 0 && !agentId) setAgentId(usable[0].id);
      } catch (err) {
        if (!cancelled) setAgentsError(err instanceof Error ? err.message : "خطأ");
      } finally {
        if (!cancelled) setAgentsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Assemble the article context. We use the title + the long-text
  // fields as the source. The extra prompt is appended so the agent
  // gets both the raw input + the writer's intent in one turn.
  const buildInput = () => {
    const longText = Object.entries(fields)
      .filter(([, v]) => typeof v === "string" && (v as string).length > 60)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n\n");
    const parts: string[] = [];
    if (articleText) parts.push(`العنوان: ${articleText}`);
    if (longText) parts.push(longText);
    if (extraPrompt.trim()) parts.push(`تعليمات إضافية: ${extraPrompt.trim()}`);
    return parts.join("\n\n").slice(0, 8000);
  };

  const run = async () => {
    if (!agentId) return;
    setRunning(true);
    setRunError(null);
    setOutput("");
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", agentId, input: buildInput() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "فشل الاستدعاء");
      setOutput(typeof d.preview === "string" ? d.preview : "");
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setRunning(false);
    }
  };

  // Char/word counters use Intl.Segmenter when available for accurate
  // Arabic word counts; fall back to whitespace splitting otherwise.
  const chars = output.length;
  const words = output.trim().length === 0
    ? 0
    : (() => {
        try {
          const seg = new Intl.Segmenter("ar", { granularity: "word" });
          return Array.from(seg.segment(output)).filter((s) => s.isWordLike).length;
        } catch {
          return output.trim().split(/\s+/).filter(Boolean).length;
        }
      })();

  const fitChip = (label: string, used: number, limit: number) => {
    const pct = (used / limit) * 100;
    const tone =
      used <= limit ? "border-emerald-500/30 text-emerald-300 bg-emerald-500/5"
      : "border-red-500/40 text-red-300 bg-red-500/10";
    return (
      <span
        key={label}
        className={`text-[0.6rem] font-bold rounded-full px-2 py-1 border ${tone} flex items-center gap-1`}
        title={`${used.toLocaleString("ar")} / ${limit.toLocaleString("ar")} حرف (${pct.toFixed(0)}%)`}
      >
        {used <= limit ? "✓" : "✗"} {label}
      </span>
    );
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(output);
    } catch {
      // clipboard may be blocked in private mode — silently ignore
    }
  };

  return (
    <section className="border border-neutral-800 rounded-xl overflow-hidden bg-[#0d0d0d]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-right hover:bg-white/[0.02] transition-colors"
      >
        <div className="w-9 h-9 rounded-md bg-purple-400/10 border border-purple-400/30 flex items-center justify-center shrink-0">
          <Bot className="w-4 h-4 text-purple-300" />
        </div>
        <div className="flex-1 min-w-0 text-right">
          <h3 className="text-[0.85rem] font-black text-white">كاتب AI</h3>
          <p className="text-[0.65rem] text-neutral-400 font-bold mt-0.5">
            ولّد منشوراً جاهزاً من هذا السجل عبر أحد وكلاء الكتابة.
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-neutral-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-neutral-800 p-4 space-y-3 zto-fade-in">
          {agentsError ? (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2 font-bold">
              ⚠ {agentsError}
            </p>
          ) : agentsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />
            </div>
          ) : agents.length === 0 ? (
            <p className="text-xs text-neutral-500 bg-neutral-800/30 rounded p-3 font-bold text-center">
              لا يوجد وكيل كتابة مفعّل. اطلب من المدير إنشاء واحد من صفحة الوكلاء.
            </p>
          ) : (
            <>
              <div>
                <label className="zto-label text-[0.65rem]">اختر الوكيل</label>
                <select
                  className="zto-input text-xs"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.agentType === "writing" ? "كتابة" : a.agentType === "editing" ? "تحرير" : "تلخيص"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="zto-label text-[0.65rem]">تعليمات إضافية (اختياري)</label>
                <textarea
                  value={extraPrompt}
                  onChange={(e) => setExtraPrompt(e.target.value.slice(0, 2000))}
                  placeholder="مثلاً: اجعل التغريدة قصيرة وحماسية، أضف هاشتاجات..."
                  className="zto-input text-xs min-h-[60px]"
                />
                <p className="text-[0.55rem] text-neutral-600 font-mono text-left mt-1">{extraPrompt.length}/2000</p>
              </div>
              <button
                onClick={run}
                disabled={running || !agentId}
                className="zto-btn zto-btn-gold zto-btn-sm w-full"
              >
                {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {running ? "جاري الكتابة..." : "ولّد المنشور"}
              </button>

              {runError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2 font-bold">
                  ⚠ {runError}
                </p>
              )}

              {output && (
                <div className="space-y-2 zto-fade-in">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[0.6rem] text-neutral-400 font-bold">
                      {chars.toLocaleString("ar")} حرف · {words.toLocaleString("ar")} كلمة
                    </span>
                    <span className="text-neutral-700">·</span>
                    {fitChip("X", chars, LIMITS.x)}
                    {fitChip("LinkedIn معاينة", chars, LIMITS.linkedin_preview)}
                    {fitChip("LinkedIn كامل", chars, LIMITS.linkedin_full)}
                    {fitChip("Instagram", chars, LIMITS.instagram)}
                  </div>
                  <textarea
                    readOnly
                    value={output}
                    className="zto-input text-xs min-h-[140px] font-bold"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={copy}
                      className="zto-btn zto-btn-ghost zto-btn-sm"
                      title="نسخ"
                    >
                      <Save className="w-3.5 h-3.5" />
                      نسخ
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
