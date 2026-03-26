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
  ChevronDown,
} from "lucide-react";

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

const AVAILABLE_USERS = [
  { id: "2", name: "أحمد الكاتب" },
  { id: "3", name: "سارة المحررة" },
  { id: "4", name: "خالد المراجع" },
];

export default function AccessControlPage() {
  const { user, addToast } = useAppStore();
  const [rules, setRules] = useState<AccessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AccessRule | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    userId: "",
    userName: "",
    baseId: "*",
    baseName: "جميع القواعد",
    tableId: "*",
    tableName: "جميع الجداول",
    permissions: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    fieldRestrictions: [] as string[],
    filterFormula: "",
  });

  // Fetch bases for the dropdown
  const [bases, setBases] = useState<{ id: string; name: string }[]>([]);
  const [tables, setTables] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    loadRules();
    fetch("/api/airtable?action=bases")
      .then((r) => r.json())
      .then((data) => {
        if (data.bases) setBases(data.bases);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (formData.baseId && formData.baseId !== "*") {
      fetch(`/api/airtable?action=tables&baseId=${formData.baseId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.tables) setTables(data.tables);
        })
        .catch(() => {});
    } else {
      setTables([]);
    }
  }, [formData.baseId]);

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

  const handleSave = async () => {
    if (!formData.userId) {
      addToast("اختر المستخدم", "error");
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

  const handleDeleteRule = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه القاعدة؟")) return;
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

  const openEdit = (rule: AccessRule) => {
    setEditingRule(rule);
    setFormData({
      userId: rule.userId,
      userName: rule.userName,
      baseId: rule.baseId,
      baseName: rule.baseName,
      tableId: rule.tableId,
      tableName: rule.tableName,
      permissions: { ...rule.permissions },
      fieldRestrictions: [...rule.fieldRestrictions],
      filterFormula: rule.filterFormula || "",
    });
    setShowCreateModal(true);
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setEditingRule(null);
    setFormData({
      userId: "",
      userName: "",
      baseId: "*",
      baseName: "جميع القواعد",
      tableId: "*",
      tableName: "جميع الجداول",
      permissions: { canView: true, canEdit: false, canCreate: false, canDelete: false },
      fieldRestrictions: [],
      filterFormula: "",
    });
  };

  if (user?.role !== "admin") {
    return (
      <div className="card p-12 text-center">
        <Shield className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
        <p className="text-text-secondary">هذه الصفحة متاحة للمديرين فقط</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Shield className="w-7 h-7 text-primary-600" />
            إدارة الصلاحيات
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            تحكم في صلاحيات المستخدمين على القواعد والجداول
          </p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          إضافة قاعدة صلاحية
        </button>
      </div>

      {/* Rules table */}
      {loading ? (
        <div className="card p-12 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : rules.length === 0 ? (
        <div className="card p-12 text-center">
          <Shield className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
          <p className="text-text-secondary">لا توجد قواعد صلاحيات بعد</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="table-container">
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="px-4 py-3 text-right">المستخدم</th>
                  <th className="px-4 py-3 text-right">القاعدة</th>
                  <th className="px-4 py-3 text-right">الجدول</th>
                  <th className="px-4 py-3 text-right">الصلاحيات</th>
                  <th className="px-4 py-3 text-right">القيود</th>
                  <th className="px-4 py-3 text-right w-32">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="table-row">
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center">
                          <User className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-medium text-sm">{rule.userName}</span>
                      </div>
                    </td>
                    <td className="table-cell text-sm">{rule.baseName}</td>
                    <td className="table-cell text-sm">{rule.tableName}</td>
                    <td className="table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {rule.permissions.canView && (
                          <span className="badge-success flex items-center gap-1">
                            <Eye className="w-3 h-3" /> عرض
                          </span>
                        )}
                        {rule.permissions.canEdit && (
                          <span className="badge-primary flex items-center gap-1">
                            <Pencil className="w-3 h-3" /> تعديل
                          </span>
                        )}
                        {rule.permissions.canCreate && (
                          <span className="badge-warning flex items-center gap-1">
                            <FilePlus className="w-3 h-3" /> إنشاء
                          </span>
                        )}
                        {rule.permissions.canDelete && (
                          <span className="badge-danger flex items-center gap-1">
                            <FileX2 className="w-3 h-3" /> حذف
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="table-cell text-xs text-text-secondary">
                      {rule.fieldRestrictions.length > 0 && (
                        <span>{rule.fieldRestrictions.length} حقول مقيدة</span>
                      )}
                      {rule.filterFormula && <span className="block">فلتر: {rule.filterFormula}</span>}
                      {!rule.fieldRestrictions.length && !rule.filterFormula && "—"}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(rule)} className="btn-ghost text-xs px-2 py-1 text-primary-600">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteRule(rule.id)} className="btn-ghost text-xs px-2 py-1 text-red-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content max-w-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary-600" />
                {editingRule ? "تعديل قاعدة الصلاحية" : "إضافة قاعدة صلاحية جديدة"}
              </h3>
              <button onClick={closeModal} className="text-text-tertiary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* User selector */}
              <div>
                <label className="label">المستخدم</label>
                <div className="relative">
                  <select
                    className="input appearance-none"
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
                    <option value="">— اختر مستخدم —</option>
                    {AVAILABLE_USERS.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
                </div>
              </div>

              {/* Base selector */}
              <div>
                <label className="label">القاعدة</label>
                <div className="relative">
                  <select
                    className="input appearance-none"
                    value={formData.baseId}
                    onChange={(e) => {
                      const base = bases.find((b) => b.id === e.target.value);
                      setFormData((prev) => ({
                        ...prev,
                        baseId: e.target.value,
                        baseName: base?.name || "جميع القواعد",
                        tableId: "*",
                        tableName: "جميع الجداول",
                      }));
                    }}
                  >
                    <option value="*">جميع القواعد</option>
                    {bases.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
                </div>
              </div>

              {/* Table selector */}
              {formData.baseId !== "*" && (
                <div>
                  <label className="label">الجدول</label>
                  <div className="relative">
                    <select
                      className="input appearance-none"
                      value={formData.tableId}
                      onChange={(e) => {
                        const table = tables.find((t) => t.id === e.target.value);
                        setFormData((prev) => ({
                          ...prev,
                          tableId: e.target.value,
                          tableName: table?.name || "جميع الجداول",
                        }));
                      }}
                    >
                      <option value="*">جميع الجداول</option>
                      {tables.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Permissions */}
              <div>
                <label className="label">الصلاحيات</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "canView", label: "عرض", icon: Eye },
                    { key: "canEdit", label: "تعديل", icon: Pencil },
                    { key: "canCreate", label: "إنشاء", icon: FilePlus },
                    { key: "canDelete", label: "حذف", icon: FileX2 },
                  ].map(({ key, label, icon: Icon }) => (
                    <label
                      key={key}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        formData.permissions[key as keyof typeof formData.permissions]
                          ? "border-primary-300 bg-primary-50"
                          : "border-border hover:border-border-strong"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.permissions[key as keyof typeof formData.permissions]}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              [key]: e.target.checked,
                            },
                          }))
                        }
                        className="w-4 h-4 rounded"
                      />
                      <Icon className="w-4 h-4" />
                      <span className="text-sm font-medium">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Filter formula */}
              <div>
                <label className="label">صيغة الفلترة (اختياري)</label>
                <input
                  type="text"
                  className="input"
                  placeholder='مثال: {Status} = "Published"'
                  value={formData.filterFormula}
                  onChange={(e) => setFormData((prev) => ({ ...prev, filterFormula: e.target.value }))}
                />
                <p className="text-xs text-text-tertiary mt-1">
                  يمكنك تقييد السجلات التي يراها المستخدم باستخدام صيغة فلترة Airtable
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-border flex items-center gap-3 justify-end">
              <button onClick={closeModal} className="btn-secondary">إلغاء</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingRule ? "حفظ التغييرات" : "إنشاء القاعدة"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
