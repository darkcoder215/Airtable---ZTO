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
  AlertCircle,
  Lock,
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
  { id: "2", name: "أحمد الكاتب", role: "محرر" },
  { id: "3", name: "سارة المحررة", role: "محرر" },
  { id: "4", name: "خالد المراجع", role: "مراجع" },
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

  const [bases, setBases] = useState<{ id: string; name: string }[]>([]);
  const [tables, setTables] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    loadRules();
    fetch("/api/airtable?action=bases")
      .then((r) => r.json())
      .then((data) => { if (data.bases) setBases(data.bases); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (formData.baseId && formData.baseId !== "*") {
      fetch(`/api/airtable?action=tables&baseId=${formData.baseId}`)
        .then((r) => r.json())
        .then((data) => { if (data.tables) setTables(data.tables); })
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
    if (!formData.userId) { addToast("اختر المستخدم", "warning"); return; }
    setSaving(true);
    try {
      const action = editingRule ? "update" : "create";
      const body = editingRule ? { action, id: editingRule.id, ...formData } : { action, ...formData };

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
    try {
      const res = await fetch("/api/access-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (res.ok) { addToast("تم حذف القاعدة", "success"); loadRules(); }
      else { const data = await res.json(); addToast(data.error || "فشل الحذف", "error"); }
    } catch { addToast("حدث خطأ", "error"); }
  };

  const openEdit = (rule: AccessRule) => {
    setEditingRule(rule);
    setFormData({
      userId: rule.userId, userName: rule.userName, baseId: rule.baseId, baseName: rule.baseName,
      tableId: rule.tableId, tableName: rule.tableName, permissions: { ...rule.permissions },
      fieldRestrictions: [...rule.fieldRestrictions], filterFormula: rule.filterFormula || "",
    });
    setShowCreateModal(true);
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setEditingRule(null);
    setFormData({
      userId: "", userName: "", baseId: "*", baseName: "جميع القواعد",
      tableId: "*", tableName: "جميع الجداول",
      permissions: { canView: true, canEdit: false, canCreate: false, canDelete: false },
      fieldRestrictions: [], filterFormula: "",
    });
  };

  if (user?.role !== "admin") {
    return (
      <div className="card p-16 text-center">
        <Lock className="w-10 h-10 text-[var(--color-zto-gray-700)] mx-auto mb-3" />
        <p className="text-[var(--color-zto-gray-400)] text-sm font-bold">هذه الصفحة متاحة للمديرين فقط</p>
      </div>
    );
  }

  const PERM_CONFIG = [
    { key: "canView" as const, label: "عرض", icon: Eye, desc: "مشاهدة السجلات" },
    { key: "canEdit" as const, label: "تعديل", icon: Pencil, desc: "تعديل السجلات الموجودة" },
    { key: "canCreate" as const, label: "إنشاء", icon: FilePlus, desc: "إنشاء سجلات جديدة" },
    { key: "canDelete" as const, label: "حذف", icon: FileX2, desc: "حذف السجلات" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[var(--color-zto-gray-500)] text-sm mt-1">تحكم في صلاحيات كل مستخدم على القواعد والجداول</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-accent">
          <Plus className="w-4 h-4" />
          قاعدة جديدة
        </button>
      </div>

      {/* Rules */}
      {loading ? (
        <div className="card p-16 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-zto-gray-500)]" />
        </div>
      ) : rules.length === 0 ? (
        <div className="card p-16 text-center">
          <Shield className="w-10 h-10 text-[var(--color-zto-gray-700)] mx-auto mb-3" />
          <p className="text-[var(--color-zto-gray-500)] text-sm font-bold">لا توجد قواعد صلاحيات</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rules.map((rule) => (
            <div key={rule.id} className="card p-5 hover:border-[var(--color-zto-gray-700)] transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--color-zto-gray-800)] flex items-center justify-center">
                    <User className="w-4 h-4 text-[var(--color-accent)]" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[var(--color-zto-white)]">{rule.userName}</h3>
                    <p className="text-[0.65rem] text-[var(--color-zto-gray-500)]">{rule.baseName} / {rule.tableName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(rule)} className="btn-ghost text-xs px-2 py-1">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDeleteRule(rule.id)} className="btn-ghost text-xs px-2 py-1 text-[var(--color-danger)]">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                {rule.permissions.canView && <span className="badge-success flex items-center gap-1"><Eye className="w-3 h-3" /> عرض</span>}
                {rule.permissions.canEdit && <span className="badge-accent flex items-center gap-1"><Pencil className="w-3 h-3" /> تعديل</span>}
                {rule.permissions.canCreate && <span className="badge-warning flex items-center gap-1"><FilePlus className="w-3 h-3" /> إنشاء</span>}
                {rule.permissions.canDelete && <span className="badge-danger flex items-center gap-1"><FileX2 className="w-3 h-3" /> حذف</span>}
              </div>

              {(rule.fieldRestrictions.length > 0 || rule.filterFormula) && (
                <div className="mt-3 pt-3 border-t border-[var(--color-zto-gray-800)] text-[0.65rem] text-[var(--color-zto-gray-500)]">
                  {rule.fieldRestrictions.length > 0 && <p>{rule.fieldRestrictions.length} حقول مقيدة</p>}
                  {rule.filterFormula && <p className="font-mono mt-0.5">فلتر: {rule.filterFormula}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content max-w-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-[var(--color-zto-gray-800)] flex items-center justify-between">
              <h3 className="text-base font-black text-[var(--color-zto-white)] flex items-center gap-2">
                <Shield className="w-4 h-4 text-[var(--color-accent)]" />
                {editingRule ? "تعديل قاعدة الصلاحية" : "قاعدة صلاحية جديدة"}
              </h3>
              <button onClick={closeModal} className="text-[var(--color-zto-gray-500)] hover:text-[var(--color-zto-white)]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
              {/* User */}
              <div>
                <label className="label">المستخدم</label>
                <div className="relative">
                  <select className="input appearance-none" value={formData.userId}
                    onChange={(e) => {
                      const u = AVAILABLE_USERS.find((u) => u.id === e.target.value);
                      setFormData((prev) => ({ ...prev, userId: e.target.value, userName: u?.name || "" }));
                    }}>
                    <option value="">— اختر مستخدم —</option>
                    {AVAILABLE_USERS.map((u) => (<option key={u.id} value={u.id}>{u.name} ({u.role})</option>))}
                  </select>
                  <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-zto-gray-600)] pointer-events-none" />
                </div>
              </div>

              {/* Base */}
              <div>
                <label className="label">القاعدة</label>
                <div className="relative">
                  <select className="input appearance-none" value={formData.baseId}
                    onChange={(e) => {
                      const base = bases.find((b) => b.id === e.target.value);
                      setFormData((prev) => ({ ...prev, baseId: e.target.value, baseName: base?.name || "جميع القواعد", tableId: "*", tableName: "جميع الجداول" }));
                    }}>
                    <option value="*">جميع القواعد</option>
                    {bases.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                  </select>
                  <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-zto-gray-600)] pointer-events-none" />
                </div>
              </div>

              {/* Table */}
              {formData.baseId !== "*" && (
                <div>
                  <label className="label">الجدول</label>
                  <div className="relative">
                    <select className="input appearance-none" value={formData.tableId}
                      onChange={(e) => {
                        const table = tables.find((t) => t.id === e.target.value);
                        setFormData((prev) => ({ ...prev, tableId: e.target.value, tableName: table?.name || "جميع الجداول" }));
                      }}>
                      <option value="*">جميع الجداول</option>
                      {tables.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
                    </select>
                    <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-zto-gray-600)] pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Permissions */}
              <div>
                <label className="label">الصلاحيات</label>
                <div className="grid grid-cols-2 gap-3">
                  {PERM_CONFIG.map(({ key, label, icon: Icon, desc }) => (
                    <label key={key}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        formData.permissions[key]
                          ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)]"
                          : "border-[var(--color-zto-gray-800)] hover:border-[var(--color-zto-gray-700)]"
                      }`}>
                      <input type="checkbox" checked={formData.permissions[key]}
                        onChange={(e) => setFormData((prev) => ({ ...prev, permissions: { ...prev.permissions, [key]: e.target.checked } }))}
                        className="w-4 h-4 rounded" />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5" />
                          <span className="text-sm font-bold">{label}</span>
                        </div>
                        <p className="text-[0.6rem] text-[var(--color-zto-gray-500)] mt-0.5">{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Filter */}
              <div>
                <label className="label">صيغة الفلترة (اختياري)</label>
                <input type="text" className="input" placeholder='مثال: {الحالة} = "منشور"'
                  value={formData.filterFormula}
                  onChange={(e) => setFormData((prev) => ({ ...prev, filterFormula: e.target.value }))} />
                <p className="text-[0.6rem] text-[var(--color-zto-gray-600)] mt-1.5">تقييد السجلات التي يراها المستخدم</p>
              </div>
            </div>
            <div className="p-5 border-t border-[var(--color-zto-gray-800)] flex items-center gap-3 justify-end">
              <button onClick={closeModal} className="btn-secondary">إلغاء</button>
              <button onClick={handleSave} disabled={saving} className="btn-accent">
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
