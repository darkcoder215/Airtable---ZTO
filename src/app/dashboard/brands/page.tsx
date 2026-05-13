"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/app-store";
import PageGuide from "@/components/PageGuide";
import {
  Building2,
  Plus,
  Trash2,
  Save,
  X,
  Loader2,
  Rss,
  Bird,
  Share2,
  Globe,
  Zap,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Info,
} from "lucide-react";

interface Brand {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  is_active: boolean;
  airtable_base_id: string | null;
  airtable_table_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Source {
  id: string;
  brand_id: string;
  name: string;
  type: "rss" | "twitter" | "linkedin" | "apify" | "custom";
  url: string;
  category: "startups" | "investment" | "tech" | "general";
  topic?: "news" | "insights" | "real_estate" | null;
  is_active: boolean;
  fetch_interval_minutes: number;
  last_fetched_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  consecutive_errors: number;
  created_at: string;
}

// Lightweight shape of the resolved destination mapping for a source.
// Stored in component state keyed by source id so we don't fetch the
// per-type mapping once per row.
interface EffectiveRule {
  scope: "brand" | "topic" | "type" | "builtin";
  tableName: string;
  columnCount: number;
}

const SCOPE_LABEL: Record<EffectiveRule["scope"], string> = {
  brand: "علامة",
  topic: "موضوع",
  type: "افتراضي",
  builtin: "افتراضي",
};
const SCOPE_TONE: Record<EffectiveRule["scope"], string> = {
  brand: "border-amber-400/40 text-amber-300 bg-amber-400/10",
  topic: "border-purple-400/40 text-purple-300 bg-purple-400/10",
  type: "border-neutral-700 text-neutral-400",
  builtin: "border-neutral-700 text-neutral-500",
};

const TYPE_META: Record<Source["type"], { label: string; icon: typeof Rss; color: string }> = {
  rss: { label: "موقع (RSS)", icon: Rss, color: "text-orange-400" },
  twitter: { label: "X (تويتر سابقاً)", icon: Bird, color: "text-sky-400" },
  linkedin: { label: "LinkedIn", icon: Share2, color: "text-blue-400" },
  apify: { label: "—", icon: Zap, color: "text-neutral-500" },
  custom: { label: "—", icon: Globe, color: "text-neutral-500" },
};

const SELECTABLE_TYPES: Source["type"][] = ["rss", "twitter", "linkedin"];

const CATEGORIES: Source["category"][] = ["startups", "investment", "tech", "general"];

const INTERVAL_PRESETS = [
  { v: 5, l: "5 د" },
  { v: 15, l: "15 د" },
  { v: 30, l: "30 د" },
  { v: 60, l: "1 س" },
  { v: 180, l: "3 س" },
  { v: 360, l: "6 س" },
  { v: 720, l: "12 س" },
  { v: 1440, l: "يوم" },
];

export default function BrandsPage() {
  const { user, addToast } = useAppStore();
  const isAdmin = user?.role === "admin";

  const [brands, setBrands] = useState<Brand[]>([]);
  const [sourcesByBrand, setSourcesByBrand] = useState<Record<string, Source[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  // Per-type mapping snapshot from /api/data-sources?action=destination-mapping.
  // Used to resolve the effective rule (brand override > topic override >
  // type default) for each source row so the admin sees where data ends up.
  interface MappingSnapshot {
    rss?: { tableName?: string; columns?: Record<string, unknown>; byBrand?: Record<string, { tableName?: string; columns?: Record<string, unknown> }>; byTopic?: Record<string, { tableName?: string; columns?: Record<string, unknown> }> };
    twitter?: MappingSnapshot["rss"];
    linkedin?: MappingSnapshot["rss"];
  }
  const [mappingSnapshot, setMappingSnapshot] = useState<MappingSnapshot | null>(null);

  useEffect(() => {
    fetch("/api/data-sources?action=destination-mapping")
      .then((r) => r.json())
      .then((d) => {
        if (d?.mapping) setMappingSnapshot(d.mapping as MappingSnapshot);
      })
      .catch(() => {
        // Non-fatal — the rule chip silently degrades to "افتراضي".
      });
  }, []);

  // Resolve the effective mapping rule for a source. Mirrors the
  // server-side resolveMappingScope() so the admin sees what will
  // actually fire at fetch time. Brand override wins over topic.
  const resolveRule = (s: Source): EffectiveRule => {
    const typeKey = (s.type === "rss" || s.type === "twitter" || s.type === "linkedin")
      ? s.type
      : "rss";
    const m = mappingSnapshot?.[typeKey];
    const brandOv = m?.byBrand?.[s.brand_id];
    if (brandOv && brandOv.tableName) {
      return {
        scope: "brand",
        tableName: String(brandOv.tableName),
        columnCount: Object.keys(brandOv.columns ?? {}).length,
      };
    }
    if (s.topic) {
      const topicOv = m?.byTopic?.[s.topic];
      if (topicOv && topicOv.tableName) {
        return {
          scope: "topic",
          tableName: String(topicOv.tableName),
          columnCount: Object.keys(topicOv.columns ?? {}).length,
        };
      }
    }
    if (m?.tableName) {
      return {
        scope: "type",
        tableName: String(m.tableName),
        columnCount: Object.keys(m.columns ?? {}).length,
      };
    }
    return { scope: "builtin", tableName: "—", columnCount: 0 };
  };

  const [showNewBrand, setShowNewBrand] = useState(false);
  const [newBrand, setNewBrand] = useState({ slug: "", name: "", description: "" });
  const [savingBrand, setSavingBrand] = useState(false);

  const [newSourceFor, setNewSourceFor] = useState<string | null>(null);
  const [newSource, setNewSource] = useState({
    name: "",
    url: "",
    type: "rss" as Source["type"],
    category: "general" as Source["category"],
    fetch_interval_minutes: 60,
  });
  const [savingSource, setSavingSource] = useState(false);

  async function loadBrands() {
    setLoading(true);
    setConfigError(null);
    try {
      const res = await fetch("/api/brands");
      const data = await res.json();
      if (res.status === 503) {
        setConfigError(data.error);
        setBrands([]);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Failed");
      setBrands(data.brands || []);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "خطأ", "error");
    } finally {
      setLoading(false);
    }
  }

  async function loadSources(brandId: string) {
    try {
      const res = await fetch(`/api/scraper-sources?brandId=${brandId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setSourcesByBrand((s) => ({ ...s, [brandId]: data.sources || [] }));
    } catch (err) {
      addToast(err instanceof Error ? err.message : "خطأ", "error");
    }
  }

  useEffect(() => { loadBrands(); }, []);

  function toggleExpand(brandId: string) {
    const next = new Set(expanded);
    if (next.has(brandId)) {
      next.delete(brandId);
    } else {
      next.add(brandId);
      if (!sourcesByBrand[brandId]) loadSources(brandId);
    }
    setExpanded(next);
  }

  async function handleCreateBrand() {
    if (!newBrand.slug || !newBrand.name) {
      addToast("الاسم والمعرّف مطلوبان", "warning");
      return;
    }
    setSavingBrand(true);
    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(newBrand),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      addToast("تم إنشاء العلامة", "success");
      setShowNewBrand(false);
      setNewBrand({ slug: "", name: "", description: "" });
      loadBrands();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "خطأ", "error");
    } finally {
      setSavingBrand(false);
    }
  }

  async function handleDeleteBrand(id: string) {
    if (!confirm("حذف العلامة وجميع مصادرها؟")) return;
    try {
      const res = await fetch(`/api/brands/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      addToast("تم الحذف", "success");
      loadBrands();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "خطأ", "error");
    }
  }

  async function handleToggleBrand(b: Brand) {
    try {
      const res = await fetch(`/api/brands/${b.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_active: !b.is_active }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      loadBrands();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "خطأ", "error");
    }
  }

  async function handleCreateSource() {
    if (!newSourceFor) return;
    if (!newSource.name || !newSource.url) {
      addToast("الاسم والرابط مطلوبان", "warning");
      return;
    }
    setSavingSource(true);
    try {
      const res = await fetch("/api/scraper-sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...newSource, brand_id: newSourceFor }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      addToast("تمت إضافة المصدر", "success");
      setNewSource({ name: "", url: "", type: "rss", category: "general", fetch_interval_minutes: 60 });
      setNewSourceFor(null);
      loadSources(newSourceFor);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "خطأ", "error");
    } finally {
      setSavingSource(false);
    }
  }

  async function handleUpdateSource(s: Source, patch: Partial<Source>) {
    try {
      const res = await fetch(`/api/scraper-sources/${s.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      loadSources(s.brand_id);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "خطأ", "error");
    }
  }

  async function handleDeleteSource(s: Source) {
    if (!confirm("حذف المصدر؟")) return;
    try {
      const res = await fetch(`/api/scraper-sources/${s.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      loadSources(s.brand_id);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "خطأ", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
      </div>
    );
  }

  if (configError) {
    return (
      <div className="max-w-2xl mx-auto mt-10 p-6 rounded-2xl bg-amber-400/5 border border-amber-400/30">
        <div className="flex items-center gap-3 mb-3">
          <AlertCircle className="w-5 h-5 text-amber-400" />
          <h3 className="text-amber-400 font-bold">Supabase غير مهيّأ</h3>
        </div>
        <p className="text-[13px] text-neutral-300 leading-relaxed mb-3">{configError}</p>
        <p className="text-[12px] text-neutral-500">
          أضف <code className="text-amber-400">NEXT_PUBLIC_SUPABASE_URL</code> و
          <code className="text-amber-400"> SUPABASE_SERVICE_ROLE_KEY</code> ثم أعد التشغيل.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6 text-amber-400" />
            <h1 className="text-2xl font-black text-white">العلامات التجارية</h1>
          </div>
          <p className="text-[13px] text-neutral-500 mt-1">
            أنشئ علامة، ثم أضف لها مصادر مع تكرار الفحص الخاص بكل مصدر.
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowNewBrand(true)} className="zto-btn zto-btn-primary">
            <Plus className="w-4 h-4" /> علامة جديدة
          </button>
        )}
      </div>

      <PageGuide
        pageName="العلامات التجارية"
        accent="amber"
        storageKey="brands"
        intro={
          <>
            العلامة هي «المظلّة» التي تجمع كل المصادر التابعة لعميل واحد. أنشئ علامة هنا أوّلاً، ثم في صفحة المصادر اربط كل مصدر بالعلامة المناسبة. اسم العلامة يظهر تلقائياً في عمود
            <code className="text-amber-400 mx-1 font-mono">Brand</code>
            داخل Airtable، ويُستخدم لفلترة كل لوحة في النظام لاحقاً.
          </>
        }
        tips={[
          { title: "إنشاء علامة", body: <>اضغط <span className="text-amber-300 font-bold">«علامة جديدة»</span> ثم أدخل الاسم وSlug قصير (يُستخدم في الروابط). يمكنك ربط جدول Airtable معيّن بالعلامة لاحقاً إن أردت تصدير كل علامة لوجهة مستقلة.</> },
          { title: "ربط المصادر", body: <>كل مصدر (موقع/X/LinkedIn) يُربط بعلامة في صفحة المصادر. مصدر بدون علامة سيظهر في كل اللوحات بقيمة Brand فارغة.</> },
          { title: "تعطيل علامة مؤقّتاً", body: <>إذا توقّف عميل ما، احتفظ بالعلامة لكن أوقف مصادرها — أرشيف الأخبار يبقى مرئياً، والجلب الدوري يتوقّف.</> },
          { title: "حذف علامة", body: <>الحذف لا يحذف الأخبار التي سبق التقاطها (للسلامة) — يلغي فقط الربط في المصادر التابعة. أعد الربط بعلامة أخرى أو احذف المصادر يدوياً.</> },
        ]}
      />

      {showNewBrand && (
        <div className="zto-card p-5 space-y-3 border-amber-400/30">
          <div className="grid grid-cols-2 gap-3">
            <input
              className="zto-input"
              placeholder="الاسم (مثال: Zero to One)"
              value={newBrand.name}
              onChange={(e) => setNewBrand({ ...newBrand, name: e.target.value })}
            />
            <input
              className="zto-input"
              placeholder="المعرّف (مثال: zto)"
              value={newBrand.slug}
              onChange={(e) =>
                setNewBrand({ ...newBrand, slug: e.target.value.toLowerCase() })
              }
            />
          </div>
          <textarea
            className="zto-input"
            rows={2}
            placeholder="وصف اختياري"
            value={newBrand.description}
            onChange={(e) => setNewBrand({ ...newBrand, description: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNewBrand(false)} className="zto-btn zto-btn-ghost">
              <X className="w-4 h-4" /> إلغاء
            </button>
            <button onClick={handleCreateBrand} disabled={savingBrand} className="zto-btn zto-btn-primary">
              {savingBrand ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ
            </button>
          </div>
        </div>
      )}

      {brands.length === 0 && (
        <div className="zto-card p-10 text-center">
          <Building2 className="w-10 h-10 text-neutral-600 mx-auto mb-3" />
          <p className="text-neutral-500 text-[14px]">لا توجد علامات بعد.</p>
        </div>
      )}

      {brands.map((brand) => {
        const isOpen = expanded.has(brand.id);
        const sources = sourcesByBrand[brand.id] || [];
        return (
          <div key={brand.id} className="zto-card overflow-hidden">
            <div className="flex items-center justify-between p-5">
              <button onClick={() => toggleExpand(brand.id)} className="flex items-center gap-3 text-left flex-1 min-w-0">
                {isOpen ? <ChevronDown className="w-4 h-4 text-neutral-500" /> : <ChevronRight className="w-4 h-4 text-neutral-500" />}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold text-[15px]">{brand.name}</span>
                    <span className="text-[10px] text-neutral-600 font-mono">{brand.slug}</span>
                    {!brand.is_active && (
                      <span className="zto-badge text-[10px] bg-neutral-700/40 text-neutral-400">معطّل</span>
                    )}
                  </div>
                  {brand.description && (
                    <div className="text-[12px] text-neutral-500 mt-0.5 truncate">{brand.description}</div>
                  )}
                </div>
              </button>
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleBrand(brand)}
                    className="text-[11px] text-neutral-400 hover:text-white px-2 py-1 rounded hover:bg-neutral-800"
                  >
                    {brand.is_active ? "إيقاف" : "تفعيل"}
                  </button>
                  <button
                    onClick={() => handleDeleteBrand(brand.id)}
                    className="text-red-400 hover:text-red-300 p-2 rounded hover:bg-red-400/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {isOpen && (
              <div className="border-t border-neutral-800 p-5 space-y-3 bg-[#0e0e0e]">
                <div className="flex items-center justify-between">
                  <h4 className="text-[13px] font-bold text-neutral-400 uppercase tracking-wider">
                    المصادر ({sources.length})
                  </h4>
                  {isAdmin && (
                    <button
                      onClick={() => setNewSourceFor(brand.id)}
                      className="zto-btn zto-btn-ghost text-[12px]"
                    >
                      <Plus className="w-3.5 h-3.5" /> إضافة مصدر
                    </button>
                  )}
                </div>

                {newSourceFor === brand.id && (
                  <div className="zto-card p-4 space-y-3 border-amber-400/30">
                    <div className="flex items-start gap-2 text-[12px] text-neutral-400 bg-neutral-900/60 border border-neutral-800 rounded-lg p-3 leading-relaxed">
                      <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div>
                          <span className="text-white font-bold">X (تويتر سابقاً):</span>{" "}
                          الصق رابط الحساب كاملاً، مثال:
                          <code className="text-amber-400 mx-1 font-mono">https://x.com/navy1411</code>
                        </div>
                        <div>
                          <span className="text-white font-bold">LinkedIn:</span>{" "}
                          الصق رابط الصفحة أو الحساب كاملاً.
                        </div>
                        <div>
                          <span className="text-white font-bold">موقع (RSS):</span>{" "}
                          الصق رابط خلاصة RSS الخاص بالموقع (عادة ينتهي بـ
                          <code className="text-amber-400 mx-1 font-mono">/feed</code>
                          أو
                          <code className="text-amber-400 mx-1 font-mono">/rss.xml</code>).
                          إن لم تجده، اطلبه من المسؤول التقني.
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input className="zto-input" placeholder="الاسم"
                        value={newSource.name}
                        onChange={(e) => setNewSource({ ...newSource, name: e.target.value })} />
                      <input className="zto-input" placeholder="الرابط"
                        value={newSource.url}
                        onChange={(e) => setNewSource({ ...newSource, url: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <select className="zto-input"
                        value={newSource.type}
                        onChange={(e) => setNewSource({ ...newSource, type: e.target.value as Source["type"] })}>
                        {SELECTABLE_TYPES.map((k) => (
                          <option key={k} value={k}>{TYPE_META[k].label}</option>
                        ))}
                      </select>
                      <select className="zto-input"
                        value={newSource.category}
                        onChange={(e) => setNewSource({ ...newSource, category: e.target.value as Source["category"] })}>
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <select className="zto-input"
                        value={newSource.fetch_interval_minutes}
                        onChange={(e) => setNewSource({ ...newSource, fetch_interval_minutes: Number(e.target.value) })}>
                        {INTERVAL_PRESETS.map((p) => (
                          <option key={p.v} value={p.v}>كل {p.l}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setNewSourceFor(null)} className="zto-btn zto-btn-ghost">
                        <X className="w-4 h-4" /> إلغاء
                      </button>
                      <button onClick={handleCreateSource} disabled={savingSource} className="zto-btn zto-btn-primary">
                        {savingSource ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        حفظ
                      </button>
                    </div>
                  </div>
                )}

                {sources.length === 0 && newSourceFor !== brand.id && (
                  <p className="text-[12px] text-neutral-600 py-3 text-center">لا توجد مصادر بعد.</p>
                )}

                {sources.map((s) => {
                  const meta = TYPE_META[s.type];
                  const Icon = meta.icon;
                  const rule = resolveRule(s);
                  return (
                    <div key={s.id} className="zto-card p-4 flex items-center gap-4">
                      <Icon className={`w-5 h-5 ${meta.color} shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-bold text-[14px] truncate">{s.name}</span>
                          {!s.is_active && (
                            <span className="zto-badge text-[9px] bg-neutral-700/40 text-neutral-400">معطّل</span>
                          )}
                          {s.consecutive_errors > 2 && (
                            <span className="zto-badge text-[9px] bg-red-400/10 text-red-400">
                              {s.consecutive_errors} أخطاء
                            </span>
                          )}
                          {/* Effective mapping rule chip. Clicking it
                              jumps to the data-sources mapping tab so
                              the admin can tweak the rule that fires
                              for this source. */}
                          <a
                            href={`/dashboard/data-sources?tab=destination&type=${s.type}`}
                            className={`text-[9px] inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 border font-bold ${SCOPE_TONE[rule.scope]}`}
                            title={`القاعدة الفعالة: ${SCOPE_LABEL[rule.scope]} — تكتب إلى «${rule.tableName}» (${rule.columnCount} عمود)`}
                          >
                            <span>← {rule.tableName}</span>
                            <span className="text-neutral-600 font-mono">·</span>
                            <span>{SCOPE_LABEL[rule.scope]}</span>
                          </a>
                        </div>
                        <div className="text-[11px] text-neutral-600 truncate font-mono mt-0.5">{s.url}</div>
                        {s.last_fetched_at && (
                          <div className="text-[10px] text-neutral-600 mt-1">
                            آخر فحص: {new Date(s.last_fetched_at).toLocaleString("ar")}
                          </div>
                        )}
                      </div>
                      {isAdmin ? (
                        <select
                          value={s.fetch_interval_minutes}
                          onChange={(e) => handleUpdateSource(s, { fetch_interval_minutes: Number(e.target.value) })}
                          className="zto-input !w-[110px] text-[12px]"
                        >
                          {INTERVAL_PRESETS.map((p) => (
                            <option key={p.v} value={p.v}>كل {p.l}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[11px] text-neutral-500">كل {s.fetch_interval_minutes} د</span>
                      )}
                      {isAdmin && (
                        <>
                          <button
                            onClick={() => handleUpdateSource(s, { is_active: !s.is_active })}
                            className="text-[11px] text-neutral-400 hover:text-white px-2 py-1 rounded hover:bg-neutral-800"
                          >
                            {s.is_active ? "إيقاف" : "تفعيل"}
                          </button>
                          <button
                            onClick={() => handleDeleteSource(s)}
                            className="text-red-400 hover:text-red-300 p-2 rounded hover:bg-red-400/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
