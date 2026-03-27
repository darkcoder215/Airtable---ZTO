"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import {
  Shield,
  Plus,
  Edit3,
  Trash2,
  Save,
  X,
  Loader2,
  User,
  Eye,
  Pencil,
  FilePlus,
  FileX2,
  Lock,
  Filter,
  EyeOff,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AccessRule {
  id: string;
  userId: string;
  userName: string;
  baseId: string;
  baseName: string;
  tableId: string;
  tableName: string;
  permissions: {
    canView: boolean;
    canEdit: boolean;
    canCreate: boolean;
    canDelete: boolean;
  };
  fieldRestrictions: string[];
  filterFormula?: string;
  createdAt: string;
  updatedAt: string;
}

interface TableMeta {
  id: string;
  name: string;
  fields: { id: string; name: string; type: string }[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const BASE_ID = "appIpXIFs2yxyxaUm";
const BASE_NAME = "Zero to One OS";

const AVAILABLE_USERS = [
  { id: "2", name: "أحمد الكاتب" },
  { id: "3", name: "سارة المحررة" },
  { id: "4", name: "خالد المراجع" },
];

const PERM_CONFIG = [
  { key: "canView" as const, label: "عرض", icon: Eye, desc: "مشاهدة السجلات", badge: "zto-badge-ok" },
  { key: "canEdit" as const, label: "تعديل", icon: Pencil, desc: "تعديل السجلات الموجودة", badge: "zto-badge-gold" },
  { key: "canCreate" as const, label: "إنشاء", icon: FilePlus, desc: "إنشاء سجلات جديدة", badge: "zto-badge-warn" },
  { key: "canDelete" as const, label: "حذف", icon: FileX2, desc: "حذف السجلات", badge: "zto-badge-err" },
];

const defaultFormData = {
  userId: "",
  userName: "",
  baseId: BASE_ID,
  baseName: BASE_NAME,
  tableId: "*",
  tableName: "جميع الجداول",
  permissions: { canView: true, canEdit: false, canCreate: false, canDelete: false },
  fieldRestrictions: [] as string[],
  filterFormula: "",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AccessControlPage() {
  const { user, addToast } = useAppStore();
  const [rules, setRules] = useState<AccessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AccessRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ ...defaultFormData });
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);

  /* ---------- Load tables from the hardcoded base on mount ---------- */
  useEffect(() => {
    loadRules();
    loadTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTables = () => {
    setTablesLoading(true);
    fetch(`/api/airtable?action=tables&baseId=${BASE_ID}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.tables) setTables(data.tables);
      })
      .catch(() => {})
      .finally(() => setTablesLoading(false));
  };

  const loadRules = () => {
    setLoading(true);
    fetch("/api/access-control")
      .then((r) => r.json())
      .then((data) => {
        if (data.rules) setRules(data.rules);
        else if (data.error) addToast(data.error, "error");
      })
      .catch(() => addToast("فشل تحميل قواعد الصلاحيات", "error"))
      .finally(() => setLoading(false));
  };

  /* ---------- CRUD helpers ---------- */

  const handleSave = async () => {
    if (!formData.userId) {
      addToast("اختر المستخدم", "warning");
      return;
    }
    setSaving(true);
    try {
      const action = editingRule ? "update" : "create";
      const body = editingRule
        ? { action, id: editingRule.id, ...formData }
        : { action, ...formData };

      const res = await fetch("/api/access-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        addToast(editingRule ? "تم تحديث القاعدة" : "تم إنشاء القاعدة", "success");
        loadRules();
        closeModal();
      } else {
        addToast(data.error || "فشلت العملية", "error");
      }
    } catch {
      addToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch("/api/access-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (res.ok) {
        addToast("تم حذف القاعدة", "success");
        loadRules();
      } else {
        const data = await res.json();
        addToast(data.error || "فشل الحذف", "error");
      }
    } catch {
      addToast("حدث خطأ", "error");
    }
  };

  /* ---------- Modal helpers ---------- */

  const openCreate = () => {
    setEditingRule(null);
    setFormData({ ...defaultFormData });
    setShowModal(true);
  };

  const openEdit = (rule: AccessRule) => {
    setEditingRule(rule);
    setFormData({
      userId: rule.userId,
      userName: rule.userName,
      baseId: BASE_ID,
      baseName: BASE_NAME,
      tableId: rule.tableId,
      tableName: rule.tableName,
      permissions: { ...rule.permissions },
      fieldRestrictions: [...rule.fieldRestrictions],
      filterFormula: rule.filterFormula || "",
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingRule(null);
    setFormData({ ...defaultFormData });
  };

  /* ---------- Derived: fields for the selected table ---------- */
  const selectedTableMeta =
    formData.tableId !== "*"
      ? tables.find((t) => t.id === formData.tableId)
      : null;

  const toggleHiddenField = (fieldName: string) => {
    setFormData((prev) => {
      const exists = prev.fieldRestrictions.includes(fieldName);
      return {
        ...prev,
        fieldRestrictions: exists
          ? prev.fieldRestrictions.filter((f) => f !== fieldName)
          : [...prev.fieldRestrictions, fieldName],
      };
    });
  };

  /* ---------- Resolve table name from id for cards ---------- */
  const resolveTableName = (tableId: string) => {
    if (tableId === "*") return "جميع الجداول";
    const t = tables.find((t) => t.id === tableId);
    return t?.name || tableId;
  };

  /* ================================================================ */
  /*  Admin guard                                                      */
  /* ================================================================ */
  if (user?.role !== "admin") {
    return (
      <div className="zto-card p-16 text-center">
        <Lock className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
        <p className="text-neutral-400 text-sm font-bold">
          متاحة للمديرين فقط
        </p>
      </div>
    );
  }

  /* ================================================================ */
  /*  Main render                                                      */
  /* ================================================================ */
  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#c9a84c]" />
            التحكم بالصلاحيات
          </h2>
          <p className="text-neutral-500 text-sm mt-1">
            تحكم في صلاحيات المستخدمين على قاعدة{" "}
            <span className="text-[#c9a84c] font-bold">{BASE_NAME}</span>
          </p>
        </div>
        <button onClick={openCreate} className="zto-btn zto-btn-gold">
          <Plus className="w-4 h-4" />
          قاعدة جديدة
        </button>
      </div>

      {/* Rules list */}
      {loading ? (
        <div className="zto-card p-16 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
        </div>
      ) : rules.length === 0 ? (
        <div className="zto-card p-16 text-center">
          <Shield className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
          <p className="text-neutral-500 text-sm font-bold">لا توجد قواعد صلاحيات</p>
          <p className="text-neutral-600 text-xs mt-1">أنشئ قاعدة جديدة للبدء</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="zto-card p-5 hover:border-neutral-700 transition-colors"
            >
              {/* Card header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#1a1a1a] flex items-center justify-center">
                    <User className="w-4 h-4 text-[#c9a84c]" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-white">{rule.userName}</h3>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      <span className="text-[#c9a84c]">{BASE_NAME}</span>
                      {" / "}
                      <span className="text-neutral-400 font-bold">
                        {resolveTableName(rule.tableId)}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(rule)}
                    className="zto-btn zto-btn-ghost zto-btn-sm"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="zto-btn zto-btn-ghost zto-btn-sm text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Permission badges */}
              <div className="flex gap-2 flex-wrap">
                {rule.permissions.canView && (
                  <span className="zto-badge zto-badge-ok flex items-center gap-1">
                    <Eye className="w-3 h-3" /> عرض
                  </span>
                )}
                {rule.permissions.canEdit && (
                  <span className="zto-badge zto-badge-gold flex items-center gap-1">
                    <Pencil className="w-3 h-3" /> تعديل
                  </span>
                )}
                {rule.permissions.canCreate && (
                  <span className="zto-badge zto-badge-warn flex items-center gap-1">
                    <FilePlus className="w-3 h-3" /> إنشاء
                  </span>
                )}
                {rule.permissions.canDelete && (
                  <span className="zto-badge zto-badge-err flex items-center gap-1">
                    <FileX2 className="w-3 h-3" /> حذف
                  </span>
                )}
              </div>

              {/* Hidden fields + filter info */}
              {(rule.fieldRestrictions.length > 0 || rule.filterFormula) && (
                <div className="mt-3 pt-3 border-t border-neutral-800 space-y-1.5">
                  {rule.fieldRestrictions.length > 0 && (
                    <div>
                      <p className="text-[11px] text-neutral-500 flex items-center gap-1 mb-1">
                        <EyeOff className="w-3 h-3" />
                        حقول مخفية ({rule.fieldRestrictions.length})
                      </p>
                      <div className="flex gap-1.5 flex-wrap">
                        {rule.fieldRestrictions.map((f) => (
                          <span
                            key={f}
                            className="zto-badge zto-badge-default text-[10px]"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {rule.filterFormula && (
                    <p className="text-[11px] text-neutral-500 font-mono flex items-center gap-1">
                      <Filter className="w-3 h-3" />
                      {rule.filterFormula}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ============================================================ */}
      {/*  Create / Edit Modal                                          */}
      {/* ============================================================ */}
      {showModal && (
        <div className="zto-overlay" onClick={closeModal}>
          <div
            className="zto-modal w-full max-w-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#c9a84c]" />
                {editingRule ? "تعديل قاعدة الصلاحية" : "قاعدة صلاحية جديدة"}
              </h3>
              <button
                onClick={closeModal}
                className="text-neutral-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
              {/* Base info (read-only) */}
              <div>
                <label className="zto-label">القاعدة</label>
                <div className="zto-input flex items-center gap-2 opacity-70 cursor-default">
                  <Shield className="w-3.5 h-3.5 text-[#c9a84c]" />
                  <span>{BASE_NAME}</span>
                </div>
              </div>

              {/* User selector */}
              <div>
                <label className="zto-label">المستخدم</label>
                <div className="zto-select-wrap">
                  <select
                    className="zto-input"
                    value={formData.userId}
                    onChange={(e) => {
                      const u = AVAILABLE_USERS.find((u) => u.id === e.target.value);
                      setFormData((prev) => ({
                        ...prev,
                        userId: e.target.value,
                        userName: u?.name || "",
                      }));
                    }}
                  >
                    <option value="">-- اختر مستخدم --</option>
                    {AVAILABLE_USERS.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Table selector */}
              <div>
                <label className="zto-label">الجدول</label>
                <div className="zto-select-wrap">
                  <select
                    className="zto-input"
                    value={formData.tableId}
                    disabled={tablesLoading}
                    onChange={(e) => {
                      const table = tables.find((t) => t.id === e.target.value);
                      setFormData((prev) => ({
                        ...prev,
                        tableId: e.target.value,
                        tableName: table?.name || "جميع الجداول",
                        fieldRestrictions: [],
                      }));
                    }}
                  >
                    <option value="*">جميع الجداول</option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                {tablesLoading && (
                  <p className="text-[11px] text-neutral-600 mt-1 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    جاري تحميل الجداول...
                  </p>
                )}
              </div>

              {/* Permission checkboxes */}
              <div>
                <label className="zto-label">الصلاحيات</label>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  {PERM_CONFIG.map(({ key, label, icon: Icon, desc }) => (
                    <label
                      key={key}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        formData.permissions[key]
                          ? "border-[#c9a84c]/40 bg-[#c9a84c]/5"
                          : "border-neutral-800 hover:border-neutral-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.permissions[key]}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              [key]: e.target.checked,
                            },
                          }))
                        }
                        className="w-4 h-4 rounded accent-[#c9a84c]"
                      />
                      <div>
                        <div className="flex items-center gap-1.5 text-white">
                          <Icon className="w-3.5 h-3.5" />
                          <span className="text-sm font-bold">{label}</span>
                        </div>
                        <p className="text-[11px] text-neutral-500 mt-0.5">{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Filter formula */}
              <div>
                <label className="zto-label">صيغة الفلترة (اختياري)</label>
                <input
                  type="text"
                  className="zto-input"
                  placeholder='مثال: {الحالة} = "منشور"'
                  value={formData.filterFormula}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      filterFormula: e.target.value,
                    }))
                  }
                />
                <p className="text-[11px] text-neutral-600 mt-1.5">
                  تقييد السجلات التي يراها المستخدم
                </p>
              </div>

              {/* Hidden fields section */}
              {selectedTableMeta && selectedTableMeta.fields.length > 0 && (
                <div>
                  <label className="zto-label flex items-center gap-1.5">
                    <EyeOff className="w-3.5 h-3.5" />
                    الحقول المخفية
                  </label>
                  <p className="text-[11px] text-neutral-600 mb-2">
                    حدد الحقول التي تريد إخفاءها عن المستخدم في جدول{" "}
                    <span className="text-neutral-400 font-bold">
                      {selectedTableMeta.name}
                    </span>
                  </p>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto rounded-xl border border-neutral-800 p-3">
                    {selectedTableMeta.fields.map((field) => {
                      const isHidden = formData.fieldRestrictions.includes(field.name);
                      return (
                        <label
                          key={field.id}
                          className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all text-sm ${
                            isHidden
                              ? "border-red-500/30 bg-red-500/5 text-red-300"
                              : "border-neutral-800 hover:border-neutral-700 text-neutral-400"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isHidden}
                            onChange={() => toggleHiddenField(field.name)}
                            className="w-3.5 h-3.5 rounded accent-red-500"
                          />
                          <span className="truncate text-[12px]">{field.name}</span>
                          <span className="text-[10px] text-neutral-600 mr-auto">
                            {field.type}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {formData.fieldRestrictions.length > 0 && (
                    <p className="text-[11px] text-red-400/70 mt-1.5">
                      {formData.fieldRestrictions.length} حقل سيتم إخفاؤه
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="p-5 border-t border-neutral-800 flex items-center gap-3 justify-end">
              <button onClick={closeModal} className="zto-btn zto-btn-ghost">
                إلغاء
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="zto-btn zto-btn-gold"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {editingRule ? "حفظ التغييرات" : "إنشاء القاعدة"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
