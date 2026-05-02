"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import {
  Rss,
  Plus,
  Edit3,
  Trash2,
  Save,
  X,
  Loader2,
  RefreshCw,
  Search,
  ExternalLink,
  AtSign,
  Briefcase,
  Globe,
  ToggleLeft,
  ToggleRight,
  Clock,
  BookOpen,
  Info,
  Database,
  Filter,
  CheckCircle2,
  XCircle,
  Brain,
} from "lucide-react";

/* ───────── Types ───────── */

interface DataSource {
  id: string;
  name: string;
  type: "rss" | "twitter" | "linkedin" | "apify" | "custom";
  url: string;
  category: "startups" | "investment" | "tech" | "general";
  topic: "news" | "insights" | "real_estate";
  fetchInterval: number;
  isActive: boolean;
  lastFetchedAt: string | null;
  createdAt: string;
  createdBy: string;
}

interface Article {
  id: string;
  title: string;
  description: string;
  url: string;
  sourceName: string;
  sourceId: string;
  author: string;
  // Free-form tags from the feed (not the editorial category).
  categories?: string[];
  publishedAt: string;
  savedToAirtable?: boolean;
}

interface FilterHistoryItem {
  id: string;
  sourceId: string;
  sourceName: string;
  timestamp: string;
  totalArticles: number;
  passedArticles: number;
  rejectedArticles: number;
  model: string;
  articles: { title: string; url: string; passed: boolean }[];
  rawResponse?: string;
}

/* ───────── Constants ───────── */

const SOURCE_TYPES = [
  { value: "rss", label: "موقع (RSS)", icon: Rss, color: "text-orange-400", bg: "bg-orange-400/10" },
  { value: "twitter", label: "X (تويتر سابقاً)", icon: AtSign, color: "text-blue-400", bg: "bg-blue-400/10" },
  { value: "linkedin", label: "LinkedIn", icon: Briefcase, color: "text-indigo-400", bg: "bg-indigo-400/10" },
];

const LEGACY_TYPE_FALLBACK = { value: "custom", label: "—", icon: Globe, color: "text-neutral-400", bg: "bg-neutral-400/10" };

const CATEGORIES = [
  { value: "startups", label: "شركات ناشئة", color: "text-purple-400", bg: "bg-purple-400/10", badge: "border-purple-500/30 text-purple-400" },
  { value: "investment", label: "استثمار", color: "text-emerald-400", bg: "bg-emerald-400/10", badge: "border-emerald-500/30 text-emerald-400" },
  { value: "tech", label: "تقنية", color: "text-blue-400", bg: "bg-blue-400/10", badge: "border-blue-500/30 text-blue-400" },
  { value: "general", label: "عام", color: "text-neutral-400", bg: "bg-neutral-400/10", badge: "border-neutral-500/30 text-neutral-400" },
];

const TOPICS = [
  { value: "news", label: "أخبار (News)", description: "يمر عبر فلترة ذكية لاكتشاف أخبار التمويل قبل الإرسال إلى الوجهة" },
  { value: "insights", label: "رؤى (Insights)", description: "محتوى رأي وتحليل — يُرسل كاملاً بدون فلترة" },
  { value: "real_estate", label: "عقارات (Real Estate)", description: "محتوى عقاري — يُرسل كاملاً بدون فلترة" },
] as const;

const TYPE_PLACEHOLDERS: Record<string, string> = {
  rss: "https://example.com/feed",
  twitter: "https://x.com/username",
  linkedin: "https://www.linkedin.com/in/username",
};

const defaultFormData = {
  name: "",
  type: "rss" as DataSource["type"],
  url: "",
  category: "general" as DataSource["category"],
  topic: "insights" as DataSource["topic"],
  fetchInterval: 60,
  isActive: true,
};

/* ───────── Component ───────── */

export default function DataSourcesPage() {
  const { user, addToast } = useAppStore();

  const [sources, setSources] = useState<DataSource[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [fetchingAll, setFetchingAll] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingSource, setEditingSource] = useState<DataSource | null>(null);
  const [saving, setSaving] = useState(false);

  // Test-source flow inside the create modal.
  interface TestPreviewItem {
    title: string;
    description: string;
    url: string;
    author?: string;
    publishedAt?: string;
    imageUrl?: string;
  }
  const [testing, setTesting] = useState(false);
  const [testItems, setTestItems] = useState<TestPreviewItem[] | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testWarning, setTestWarning] = useState<string | null>(null);
  // Tracks the {type,url} the test was run against. If the user changes
  // either after testing, we reset the confirmation so they can't bypass.
  const [testSig, setTestSig] = useState<string | null>(null);
  const [testConfirmed, setTestConfirmed] = useState(false);
  const [activeTab, setActiveTab] = useState<"sources" | "articles" | "filters" | "guide">("sources");

  // Bulk-add modal
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkType, setBulkType] = useState<DataSource["type"]>("rss");
  const [bulkTopic, setBulkTopic] = useState<DataSource["topic"]>("news");
  const [bulkCategory, setBulkCategory] = useState<DataSource["category"]>("general");
  const [bulkInterval, setBulkInterval] = useState(60);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResults, setBulkResults] = useState<
    | {
        results: { index: number; ok: boolean; error?: string; input?: { url?: string; name?: string } }[];
        created: number;
        failed: number;
        total: number;
      }
    | null
  >(null);

  // Capability flags (kept generic — names below don't expose vendors).
  const [socialFetchEnabled, setSocialFetchEnabled] = useState(false);
  const [aiFilterEnabled, setAiFilterEnabled] = useState(false);
  const [savingToDestination, setSavingToDestination] = useState<string | null>(null);

  // Filter history
  const [filterHistoryItems, setFilterHistoryItems] = useState<FilterHistoryItem[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [expandedFilter, setExpandedFilter] = useState<string | null>(null);

  // Article filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  // Source filters
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>("all");
  const [sourceCategoryFilter, setSourceCategoryFilter] = useState<string>("all");
  const [sourceSearch, setSourceSearch] = useState("");

  // Form state
  const [formData, setFormData] = useState({ ...defaultFormData });

  useEffect(() => {
    loadSources();
    fetch("/api/data-sources?action=status")
      .then((r) => r.json())
      .then((d) => {
        setSocialFetchEnabled(!!d.socialFetchEnabled);
        setAiFilterEnabled(!!d.aiFilterEnabled);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === "articles") loadArticles();
    if (activeTab === "filters") loadFilterHistory();
  }, [activeTab]);

  /* ───────── API helpers ───────── */

  const loadSources = () => {
    setLoading(true);
    fetch("/api/data-sources?action=sources")
      .then((r) => r.json())
      .then((data) => {
        if (data.sources) setSources(data.sources);
      })
      .catch(() => addToast("فشل تحميل المصادر", "error"))
      .finally(() => setLoading(false));
  };

  const loadArticles = () => {
    setLoadingArticles(true);
    fetch("/api/data-sources?action=articles")
      .then((r) => r.json())
      .then((data) => {
        if (data.articles) setArticles(data.articles);
      })
      .catch(() => addToast("فشل تحميل الأخبار", "error"))
      .finally(() => setLoadingArticles(false));
  };

  const loadFilterHistory = () => {
    setLoadingFilters(true);
    fetch("/api/data-sources?action=filter-history")
      .then((r) => r.json())
      .then((data) => {
        if (data.history) setFilterHistoryItems(data.history);
      })
      .catch(() => addToast("فشل تحميل سجل الفلترة", "error"))
      .finally(() => setLoadingFilters(false));
  };

  const handleFetch = async (sourceId: string) => {
    setFetchingId(sourceId);
    try {
      const res = await fetch("/api/data-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fetch", sourceId }),
      });
      const data = await res.json();
      if (res.ok) {
        const count = data.count || data.articles?.length || 0;
        addToast(`تم جلب ${count} خبر بنجاح`, "success");
        loadSources();
        loadArticles();
        loadFilterHistory();
      } else {
        addToast(data.error || "فشل الجلب", "error");
      }
    } catch {
      addToast("حدث خطأ أثناء الجلب", "error");
    } finally {
      setFetchingId(null);
    }
  };

  const handleFetchAll = async () => {
    setFetchingAll(true);
    try {
      const res = await fetch("/api/data-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fetch-all" }),
      });
      const data = await res.json();
      if (res.ok) {
        const total = data.totalArticles || 0;
        addToast(`تم جلب ${total} خبر من ${data.sourcesProcessed || 0} مصدر`, "success");
        loadSources();
        loadArticles();
        loadFilterHistory();
      } else {
        addToast(data.error || "فشل الجلب", "error");
      }
    } catch {
      addToast("حدث خطأ", "error");
    } finally {
      setFetchingAll(false);
    }
  };

  const currentTestSig = `${formData.type}::${formData.url.trim()}`;

  // Reset test state whenever the user changes type or URL after a test —
  // avoids them confirming one URL and saving a different one.
  useEffect(() => {
    if (testSig && testSig !== currentTestSig) {
      setTestItems(null);
      setTestConfirmed(false);
      setTestError(null);
      setTestWarning(null);
      setTestSig(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTestSig]);

  const handleTestSource = async () => {
    if (!formData.url.trim()) {
      addToast("أدخل الرابط أولاً", "warning");
      return;
    }
    setTesting(true);
    setTestItems(null);
    setTestConfirmed(false);
    setTestError(null);
    setTestWarning(null);
    try {
      const res = await fetch("/api/data-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test-source",
          type: formData.type,
          url: formData.url,
          limit: 5,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTestError(data.error || "فشل الاختبار");
        addToast(data.error || "فشل الاختبار", "error");
        return;
      }
      const items: TestPreviewItem[] = Array.isArray(data.articles) ? data.articles : [];
      setTestItems(items);
      setTestSig(currentTestSig);
      if (items.length === 0) {
        setTestWarning("لم تُرجع المصدر أي عناصر. تأكد من الرابط أو حاول لاحقاً.");
      } else if (data.warning) {
        setTestWarning(data.warning);
      }
    } catch {
      setTestError("حدث خطأ أثناء الاختبار");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name) {
      addToast("أدخل اسم المصدر", "warning");
      return;
    }
    if (!formData.url) {
      addToast("أدخل رابط المصدر", "warning");
      return;
    }
    // For new sources we require either an explicit "test + confirm" or an
    // explicit "skip test" via testConfirmed. Edits keep the existing behaviour.
    if (!editingSource && !testConfirmed) {
      addToast("اختبر المصدر وأكّد النتيجة قبل الإضافة", "warning");
      return;
    }
    setSaving(true);
    try {
      const action = editingSource ? "update" : "create";
      const body = editingSource
        ? { action, id: editingSource.id, ...formData }
        : { action, ...formData, createdBy: user?.id };

      const res = await fetch("/api/data-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        addToast(editingSource ? "تم تحديث المصدر" : "تم إنشاء المصدر", "success");
        loadSources();
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
      const res = await fetch("/api/data-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (res.ok) {
        addToast("تم حذف المصدر", "success");
        loadSources();
      }
    } catch {
      addToast("فشل الحذف", "error");
    }
  };

  const handleToggleActive = async (source: DataSource) => {
    try {
      const res = await fetch("/api/data-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: source.id, isActive: !source.isActive }),
      });
      if (res.ok) {
        addToast(source.isActive ? "تم تعطيل المصدر" : "تم تفعيل المصدر", "success");
        loadSources();
      }
    } catch {
      addToast("حدث خطأ", "error");
    }
  };

  const handleSaveToDestination = async (articleId: string, sourceName: string) => {
    setSavingToDestination(articleId);
    try {
      const res = await fetch("/api/data-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-to-airtable", articleId, sourceName }),
      });
      if (res.ok) {
        addToast("تم الحفظ في الوجهة", "success");
        loadArticles();
      } else {
        const data = await res.json();
        addToast(data.error || "فشل الحفظ", "error");
      }
    } catch {
      addToast("حدث خطأ أثناء الحفظ", "error");
    } finally {
      setSavingToDestination(null);
    }
  };

  /* ───────── Modal helpers ───────── */

  const openEdit = (source: DataSource) => {
    setEditingSource(source);
    setFormData({
      name: source.name,
      type: source.type,
      url: source.url,
      category: source.category,
      topic: source.topic ?? "insights",
      fetchInterval: source.fetchInterval,
      isActive: source.isActive,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingSource(null);
    setFormData({ ...defaultFormData });
    setTestItems(null);
    setTestConfirmed(false);
    setTestError(null);
    setTestWarning(null);
    setTestSig(null);
  };

  const closeBulkModal = () => {
    setShowBulkModal(false);
    setBulkResults(null);
    setBulkText("");
  };

  // Each non-empty line is one source. Three accepted formats:
  //   - "URL"
  //   - "URL | Name"
  //   - "Name | URL"  (auto-detected: whichever side parses as a URL)
  const parseBulkLines = (
    text: string
  ): { url: string; name?: string }[] => {
    const out: { url: string; name?: string }[] = [];
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
      if (parts.length === 1) {
        out.push({ url: parts[0] });
      } else {
        const looksUrl = (s: string) => /^https?:\/\//i.test(s);
        if (looksUrl(parts[0])) {
          out.push({ url: parts[0], name: parts.slice(1).join(" | ") });
        } else if (looksUrl(parts[1])) {
          out.push({ url: parts[1], name: parts[0] });
        } else {
          out.push({ url: parts[0], name: parts.slice(1).join(" | ") });
        }
      }
    }
    return out;
  };

  const handleBulkSubmit = async () => {
    const parsed = parseBulkLines(bulkText);
    if (parsed.length === 0) {
      addToast("ألصق رابطاً واحداً على الأقل", "warning");
      return;
    }
    setBulkSubmitting(true);
    setBulkResults(null);
    try {
      const sources = parsed.map((p) => ({
        url: p.url,
        name: p.name,
        type: bulkType,
        topic: bulkTopic,
        category: bulkCategory,
        fetchInterval: bulkInterval,
        isActive: true,
      }));
      const res = await fetch("/api/data-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk-create", sources }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || "فشلت العملية", "error");
        return;
      }
      setBulkResults(data);
      addToast(
        `تم إنشاء ${data.created} من ${data.total} مصدر`,
        data.failed > 0 ? "warning" : "success"
      );
      loadSources();
    } catch {
      addToast("حدث خطأ أثناء الإضافة", "error");
    } finally {
      setBulkSubmitting(false);
    }
  };

  /* ───────── Filtered sources ───────── */

  const filteredSources = sources.filter((s) => {
    if (sourceTypeFilter !== "all" && s.type !== sourceTypeFilter) return false;
    if (sourceCategoryFilter !== "all" && s.category !== sourceCategoryFilter) return false;
    if (sourceSearch) {
      const q = sourceSearch.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q);
    }
    return true;
  });

  // Group filtered sources by type for display
  const sourcesByType: Record<string, DataSource[]> = {};
  for (const s of filteredSources) {
    if (!sourcesByType[s.type]) sourcesByType[s.type] = [];
    sourcesByType[s.type].push(s);
  }

  // Type counts for filter badges (from unfiltered sources)
  const typeCounts: Record<string, number> = {};
  for (const s of sources) {
    typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;
  }

  /* ───────── Filtered articles ───────── */

  // Articles inherit their editorial category from the parent source — a feed
  // doesn't carry a single category of its own.
  const sourceCategoryById = new Map<string, DataSource["category"]>();
  for (const s of sources) sourceCategoryById.set(s.id, s.category);
  const articleCategory = (a: Article): DataSource["category"] =>
    sourceCategoryById.get(a.sourceId) ?? "general";

  const filteredArticles = articles.filter((a) => {
    if (filterSource && a.sourceId !== filterSource) return false;
    if (filterCategory && articleCategory(a) !== filterCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  /* ───────── Helpers ───────── */

  const getSourceType = (type: string) =>
    SOURCE_TYPES.find((t) => t.value === type) || LEGACY_TYPE_FALLBACK;

  const getCategoryInfo = (cat: string) =>
    CATEGORIES.find((c) => c.value === cat) || CATEGORIES[3];

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "لم يتم الجلب بعد";
    const d = new Date(dateStr);
    return d.toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  /* ───────── Render ───────── */

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <Rss className="w-5 h-5 text-amber-400" />
            مصادر البيانات
          </h2>
          <p className="text-neutral-500 text-sm mt-1">
            جمع وتحليل الأخبار والمحتوى من مصادر متعددة
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Tab switcher */}
          <div className="flex bg-[#1a1a1a] border border-neutral-800 rounded-lg p-0.5">
            <button
              onClick={() => setActiveTab("sources")}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${
                activeTab === "sources"
                  ? "bg-white text-black"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <Rss className="w-3.5 h-3.5" />
              المصادر
            </button>
            <button
              onClick={() => setActiveTab("articles")}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${
                activeTab === "articles"
                  ? "bg-white text-black"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              الأخبار
            </button>
            <button
              onClick={() => setActiveTab("filters")}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${
                activeTab === "filters"
                  ? "bg-white text-black"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              الفلترة
            </button>
            <button
              onClick={() => setActiveTab("guide")}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${
                activeTab === "guide"
                  ? "bg-white text-black"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <Info className="w-3.5 h-3.5" />
              إضافة مصادر
            </button>
          </div>

          {user?.role === "admin" && activeTab === "sources" && (
            <>
              <button
                onClick={() => setShowBulkModal(true)}
                className="zto-btn zto-btn-outline"
                title="إضافة عدة مصادر دفعة واحدة"
              >
                <Plus className="w-4 h-4" />
                دفعة
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="zto-btn zto-btn-gold"
              >
                <Plus className="w-4 h-4" />
                مصدر جديد
              </button>
            </>
          )}
        </div>
      </div>

      {!socialFetchEnabled && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
          <Info className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-400">جلب مصادر التواصل الاجتماعي غير مفعّل حالياً</p>
            <p className="text-xs text-neutral-400">
              تواصل مع المسؤول للتفعيل. مصادر المواقع تعمل بشكل طبيعي.
            </p>
          </div>
        </div>
      )}

      {/* ───── Sources Tab ───── */}
      {activeTab === "sources" && (
        <>
          {/* Filter bar */}
          <div className="zto-card p-4">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Type filter pills */}
              <div className="flex items-center gap-1.5 flex-wrap flex-1">
                <button
                  onClick={() => setSourceTypeFilter("all")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                    sourceTypeFilter === "all"
                      ? "bg-white text-black border-white"
                      : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                  }`}
                >
                  الكل
                  <span className="mr-1.5 text-[0.6rem] opacity-60">{sources.length}</span>
                </button>
                {SOURCE_TYPES.map((t) => {
                  const count = typeCounts[t.value] || 0;
                  if (count === 0) return null;
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.value}
                      onClick={() => setSourceTypeFilter(sourceTypeFilter === t.value ? "all" : t.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 ${
                        sourceTypeFilter === t.value
                          ? `${t.bg} ${t.color} border-current`
                          : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {t.label}
                      <span className="text-[0.6rem] opacity-60">{count}</span>
                    </button>
                  );
                })}
              </div>

              {/* Category filter */}
              <div className="zto-select-wrap min-w-[130px]">
                <select
                  className="zto-input text-xs"
                  value={sourceCategoryFilter}
                  onChange={(e) => setSourceCategoryFilter(e.target.value)}
                >
                  <option value="all">كل الفئات</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Search */}
              <div className="relative min-w-[180px]">
                <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="text"
                  className="zto-input pr-9 text-xs"
                  placeholder="بحث..."
                  value={sourceSearch}
                  onChange={(e) => setSourceSearch(e.target.value)}
                />
              </div>

              {/* Fetch all */}
              <button
                onClick={handleFetchAll}
                disabled={fetchingAll}
                className="zto-btn zto-btn-outline zto-btn-sm"
              >
                {fetchingAll ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                جلب الكل
              </button>
            </div>
          </div>

          {loading ? (
            <div className="zto-card p-16 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
            </div>
          ) : filteredSources.length === 0 ? (
            <div className="zto-card p-16 text-center">
              <Rss className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
              <p className="text-neutral-500 text-sm font-bold mb-1">
                {sources.length === 0 ? "لا توجد مصادر بعد" : "لا توجد نتائج للفلتر"}
              </p>
              <p className="text-neutral-600 text-xs mb-4">
                {sources.length === 0 ? "أضف مصدرا جديدا للبدء في جمع الأخبار" : "جرب تغيير معايير الفلترة"}
              </p>
              {sources.length === 0 && user?.role === "admin" && (
                <button onClick={() => setShowModal(true)} className="zto-btn zto-btn-gold">
                  <Plus className="w-4 h-4" />
                  إضافة مصدر جديد
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Render grouped by type */}
              {Object.entries(sourcesByType).map(([type, typeSources]) => {
                const st = getSourceType(type);
                const TypeIcon = st.icon;
                return (
                  <div key={type}>
                    {/* Group header */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center ${st.bg}`}>
                        <TypeIcon className={`w-4 h-4 ${st.color}`} />
                      </div>
                      <h3 className="text-sm font-black text-white">{st.label}</h3>
                      <span className="text-xs text-neutral-500">{typeSources.length} مصدر</span>
                    </div>

                    {/* Table */}
                    <div className="zto-card overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-neutral-800 text-[0.65rem] text-neutral-500 font-bold uppercase tracking-wider">
                            <th className="text-right px-4 py-3">المصدر</th>
                            <th className="text-right px-4 py-3 hidden md:table-cell">الرابط</th>
                            <th className="text-right px-4 py-3">الفئة</th>
                            <th className="text-right px-4 py-3 hidden lg:table-cell">آخر جلب</th>
                            <th className="text-center px-4 py-3">الحالة</th>
                            <th className="text-left px-4 py-3">إجراءات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {typeSources.map((source) => {
                            const cat = getCategoryInfo(source.category);
                            return (
                              <tr
                                key={source.id}
                                className="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/20 transition-colors"
                              >
                                {/* Name */}
                                <td className="px-4 py-3">
                                  <p className="font-bold text-sm text-white truncate max-w-[200px]">{source.name}</p>
                                </td>

                                {/* URL */}
                                <td className="px-4 py-3 hidden md:table-cell">
                                  <p className="text-xs text-neutral-500 truncate max-w-[250px]" title={source.url}>
                                    {source.url}
                                  </p>
                                </td>

                                {/* Category */}
                                <td className="px-4 py-3">
                                  <span className={`zto-badge text-[0.6rem] ${cat.badge}`}>{cat.label}</span>
                                </td>

                                {/* Last fetched */}
                                <td className="px-4 py-3 hidden lg:table-cell">
                                  <span className="text-[0.65rem] text-neutral-600 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatDate(source.lastFetchedAt)}
                                  </span>
                                </td>

                                {/* Active toggle */}
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={() => handleToggleActive(source)}
                                    title={source.isActive ? "مفعل" : "معطل"}
                                    className="transition-colors inline-block"
                                  >
                                    {source.isActive ? (
                                      <ToggleRight className="w-5 h-5 text-emerald-400" />
                                    ) : (
                                      <ToggleLeft className="w-5 h-5 text-neutral-600" />
                                    )}
                                  </button>
                                </td>

                                {/* Actions */}
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1 justify-end">
                                    <button
                                      onClick={() => handleFetch(source.id)}
                                      disabled={fetchingId === source.id}
                                      className="zto-btn zto-btn-ghost zto-btn-sm text-amber-400"
                                      title="جلب البيانات"
                                    >
                                      {fetchingId === source.id ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <RefreshCw className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                    {user?.role === "admin" && (
                                      <>
                                        <button
                                          onClick={() => openEdit(source)}
                                          className="zto-btn zto-btn-ghost zto-btn-sm"
                                          title="تعديل"
                                        >
                                          <Edit3 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => handleDelete(source.id)}
                                          className="zto-btn zto-btn-ghost zto-btn-sm text-red-400 hover:text-red-300"
                                          title="حذف"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ───── Articles Tab ───── */}
      {activeTab === "articles" && (
        <>
          {/* Filter bar */}
          <div className="zto-card p-4">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="text"
                  className="zto-input pr-10"
                  placeholder="بحث في الأخبار..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Source filter */}
              <div className="zto-select-wrap min-w-[160px]">
                <select
                  className="zto-input"
                  value={filterSource}
                  onChange={(e) => setFilterSource(e.target.value)}
                >
                  <option value="">كل المصادر</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Category filter */}
              <div className="zto-select-wrap min-w-[140px]">
                <select
                  className="zto-input"
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                >
                  <option value="">كل الفئات</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Article count */}
              <span className="zto-badge zto-badge-info">
                {filteredArticles.length} خبر
              </span>
            </div>
          </div>

          {loadingArticles ? (
            <div className="zto-card p-16 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
            </div>
          ) : filteredArticles.length === 0 ? (
            <div className="zto-card p-16 text-center">
              <BookOpen className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
              <p className="text-neutral-500 text-sm font-bold mb-1">
                {articles.length === 0 ? "لا توجد أخبار" : "لا توجد نتائج للفلتر"}
              </p>
              <p className="text-neutral-600 text-xs">
                {articles.length === 0
                  ? "جرب جلب البيانات من المصادر أولا"
                  : `${articles.length} خبر مخفي بسبب الفلتر`}
              </p>
              {articles.length > 0 && (filterSource || filterCategory || searchQuery) && (
                <button
                  onClick={() => {
                    setFilterSource("");
                    setFilterCategory("");
                    setSearchQuery("");
                  }}
                  className="zto-btn zto-btn-outline zto-btn-sm mt-3"
                >
                  مسح الفلتر
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredArticles.map((article) => {
                const cat = getCategoryInfo(articleCategory(article));
                return (
                  <div
                    key={article.id}
                    className="zto-card p-5 hover:border-neutral-700 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-bold text-sm text-white line-clamp-2 flex-1">
                        {article.title}
                      </h3>
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-neutral-500 hover:text-amber-400 transition-colors shrink-0 mr-2"
                        title="فتح المقال الأصلي"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>

                    <p className="text-xs text-neutral-400 mb-3 line-clamp-3">
                      {article.description || "بدون وصف"}
                    </p>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="zto-badge zto-badge-gold">
                        {article.sourceName}
                      </span>
                      <span className={`zto-badge ${cat.badge}`}>
                        {cat.label}
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-neutral-800">
                      <p className="text-[0.65rem] text-neutral-600 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(article.publishedAt)}
                      </p>
                      {article.savedToAirtable ? (
                        <span className="text-[0.65rem] text-emerald-400 flex items-center gap-1">
                          <Database className="w-3 h-3" />
                          محفوظ
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSaveToDestination(article.id, article.sourceName || "Unknown")}
                          disabled={savingToDestination === article.id}
                          className="zto-btn zto-btn-ghost zto-btn-sm text-amber-400"
                          title="حفظ في الوجهة"
                        >
                          {savingToDestination === article.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Database className="w-3 h-3" />
                          )}
                          حفظ
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ───── Filters Tab ───── */}
      {activeTab === "filters" && (
        <>
          {/* AI filter info banner — kept generic, no model/provider mention. */}
          <div className="flex items-center gap-3 bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-3">
            <Brain className="w-5 h-5 text-purple-400 shrink-0" />
            <div>
              <p className="text-sm font-bold text-purple-400">فلترة ذكية</p>
              <p className="text-xs text-neutral-400">
                يتم تحليل عناوين الأخبار آلياً والإبقاء على ما يتعلق بالشركات الناشئة والاستثمارات فقط، ثم تمرير المؤهل منها إلى الوجهة.
                {!aiFilterEnabled && (
                  <span className="text-amber-400 mr-2">
                    ⚠ الفلترة الذكية غير مفعّلة حالياً — جميع الأخبار تمر بدون تصفية. تواصل مع المسؤول.
                  </span>
                )}
              </p>
            </div>
          </div>

          {loadingFilters ? (
            <div className="zto-card p-16 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
            </div>
          ) : filterHistoryItems.length === 0 ? (
            <div className="zto-card p-16 text-center">
              <Filter className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
              <p className="text-neutral-500 text-sm font-bold mb-1">لا يوجد سجل فلترة بعد</p>
              <p className="text-neutral-600 text-xs">
                سيتم تسجيل نتائج الفلترة هنا عند جلب أخبار RSS
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filterHistoryItems.map((item) => {
                const passRate = item.totalArticles > 0
                  ? Math.round((item.passedArticles / item.totalArticles) * 100)
                  : 0;
                const isExpanded = expandedFilter === item.id;

                return (
                  <div key={item.id} className="zto-card overflow-hidden">
                    {/* Header */}
                    <button
                      onClick={() => setExpandedFilter(isExpanded ? null : item.id)}
                      className="w-full p-5 flex items-center justify-between hover:bg-neutral-800/30 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-400/10">
                          <Brain className="w-5 h-5 text-purple-400" />
                        </div>
                        <div className="text-right">
                          <h3 className="font-bold text-sm text-white">{item.sourceName}</h3>
                          <p className="text-[0.65rem] text-neutral-500 flex items-center gap-2 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {formatDate(item.timestamp)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {/* Stats */}
                        <div className="flex items-center gap-3 text-xs">
                          <span className="flex items-center gap-1 text-neutral-400">
                            {item.totalArticles} خبر
                          </span>
                          <span className="flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {item.passedArticles} مؤهل
                          </span>
                          <span className="flex items-center gap-1 text-red-400">
                            <XCircle className="w-3.5 h-3.5" />
                            {item.rejectedArticles} مرفوض
                          </span>
                        </div>

                        {/* Pass rate badge */}
                        <div
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                            passRate >= 50
                              ? "bg-emerald-400/10 text-emerald-400 border border-emerald-500/20"
                              : passRate > 0
                              ? "bg-amber-400/10 text-amber-400 border border-amber-500/20"
                              : "bg-red-400/10 text-red-400 border border-red-500/20"
                          }`}
                        >
                          {passRate}%
                        </div>
                      </div>
                    </button>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="border-t border-neutral-800">
                        {/* Article list */}
                        <div className="p-5 space-y-2">
                          <p className="text-xs font-bold text-neutral-400 mb-3">تفاصيل الأخبار:</p>
                          {item.articles.map((article, idx) => (
                            <div
                              key={idx}
                              className={`flex items-start gap-3 p-3 rounded-lg border ${
                                article.passed
                                  ? "bg-emerald-500/5 border-emerald-500/20"
                                  : "bg-red-500/5 border-red-500/10"
                              }`}
                            >
                              {article.passed ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white font-medium truncate">{article.title}</p>
                                {article.url && (
                                  <a
                                    href={article.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[0.65rem] text-neutral-500 hover:text-amber-400 truncate block"
                                  >
                                    {article.url}
                                  </a>
                                )}
                              </div>
                              <span
                                className={`text-[0.6rem] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                  article.passed
                                    ? "bg-emerald-400/20 text-emerald-400"
                                    : "bg-red-400/20 text-red-400"
                                }`}
                              >
                                {article.passed ? "مؤهل" : "مرفوض"}
                              </span>
                            </div>
                          ))}
                        </div>

                        {item.rawResponse && user?.role === "admin" && (
                          <div className="border-t border-neutral-800 p-5">
                            <p className="text-xs font-bold text-neutral-400 mb-2">تفاصيل الفلترة:</p>
                            <pre className="bg-[#1a1a1a] border border-neutral-800 rounded-lg p-3 text-xs text-neutral-400 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap" dir="ltr">
                              {item.rawResponse}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ───── Guide Tab ───── */}
      {activeTab === "guide" && (
        <div className="space-y-4">
          <div className="zto-card p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-400/10">
                <AtSign className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">X (تويتر سابقاً)</h3>
                <p className="text-[0.65rem] text-neutral-500">حسابات على X</p>
              </div>
            </div>
            <p className="text-sm text-neutral-400">
              الصق رابط الحساب كاملاً. مثال:
            </p>
            <div className="bg-[#1a1a1a] border border-neutral-800 rounded-lg p-3 space-y-1">
              <code className="text-xs text-amber-400 block">https://x.com/navy1411</code>
            </div>
          </div>

          <div className="zto-card p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-indigo-400/10">
                <Briefcase className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">LinkedIn</h3>
                <p className="text-[0.65rem] text-neutral-500">صفحات وحسابات LinkedIn</p>
              </div>
            </div>
            <p className="text-sm text-neutral-400">
              الصق رابط الصفحة أو الحساب كاملاً. مثال:
            </p>
            <div className="bg-[#1a1a1a] border border-neutral-800 rounded-lg p-3 space-y-1">
              <code className="text-xs text-amber-400 block">https://www.linkedin.com/company/example</code>
              <code className="text-xs text-amber-400 block">https://www.linkedin.com/in/username</code>
            </div>
          </div>

          <div className="zto-card p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-orange-400/10">
                <Rss className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">موقع (RSS)</h3>
                <p className="text-[0.65rem] text-neutral-500">خلاصة أخبار الموقع</p>
              </div>
            </div>
            <p className="text-sm text-neutral-400">
              الصق رابط خلاصة RSS الخاصة بالموقع. عادةً ينتهي الرابط بـ
              <code className="text-amber-400 mx-1 font-mono">/feed</code>
              أو
              <code className="text-amber-400 mx-1 font-mono">/rss.xml</code>.
            </p>
            <div className="bg-[#1a1a1a] border border-neutral-800 rounded-lg p-3 space-y-1">
              <code className="text-xs text-amber-400 block">https://example.com/feed</code>
              <code className="text-xs text-amber-400 block">https://example.com/rss.xml</code>
            </div>
            <p className="text-xs text-neutral-500">
              لإيجاد الرابط: ابحث عن أيقونة RSS في الموقع، أو جرّب إضافة <code className="bg-neutral-800 px-1 rounded text-amber-400">/feed</code> في نهاية رابط الموقع. إن لم تجده، اطلبه من المسؤول التقني.
            </p>
          </div>
        </div>
      )}

      {/* ───── Bulk Add Modal ───── */}
      {showBulkModal && (
        <div className="zto-overlay" onClick={closeBulkModal}>
          <div
            className="zto-modal w-full max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" />
                إضافة مصادر دفعة واحدة
              </h3>
              <button
                onClick={closeBulkModal}
                className="text-neutral-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3">
                <p className="text-xs text-neutral-300 leading-relaxed">
                  الصق روابط (واحد في كل سطر). يمكن إضافة اسم اختياري بعد
                  <code className="text-amber-400 mx-1 font-mono">|</code>
                  مثل:
                </p>
                <pre className="mt-2 text-[0.7rem] text-amber-400 bg-neutral-900 border border-neutral-800 rounded p-2 font-mono overflow-x-auto" dir="ltr">
{`https://techcrunch.com/feed
https://wamda.com/feed | Wamda
TechCrunch | https://techcrunch.com/feed
# سطر يبدأ بـ # يتم تجاهله`}
                </pre>
              </div>

              {/* Shared settings */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="zto-label">النوع لكل المصادر</label>
                  <div className="zto-select-wrap">
                    <select
                      className="zto-input"
                      value={bulkType}
                      onChange={(e) => setBulkType(e.target.value as DataSource["type"])}
                    >
                      {SOURCE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="zto-label">الموضوع</label>
                  <div className="zto-select-wrap">
                    <select
                      className="zto-input"
                      value={bulkTopic}
                      onChange={(e) => setBulkTopic(e.target.value as DataSource["topic"])}
                    >
                      {TOPICS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="zto-label">الفئة</label>
                  <div className="zto-select-wrap">
                    <select
                      className="zto-input"
                      value={bulkCategory}
                      onChange={(e) =>
                        setBulkCategory(e.target.value as DataSource["category"])
                      }
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="zto-label">فترة الجلب (دقائق)</label>
                  <input
                    type="number"
                    className="zto-input"
                    min={5}
                    max={10080}
                    value={bulkInterval}
                    onChange={(e) =>
                      setBulkInterval(parseInt(e.target.value) || 60)
                    }
                  />
                </div>
              </div>

              <div>
                <label className="zto-label">
                  الروابط (سطر لكل مصدر) — حد أقصى 100
                </label>
                <textarea
                  className="zto-input min-h-[180px] font-mono text-xs"
                  dir="ltr"
                  placeholder={"https://techcrunch.com/feed\nhttps://wamda.com/feed | Wamda"}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                />
                <p className="text-[0.65rem] text-neutral-500 mt-1">
                  الأسطر الفارغة وتلك التي تبدأ بـ # يتم تجاهلها
                </p>
              </div>

              {bulkResults && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="zto-badge zto-badge-info">
                      {bulkResults.total} إجمالي
                    </span>
                    <span className="zto-badge border border-emerald-500/30 text-emerald-400">
                      {bulkResults.created} نجح
                    </span>
                    {bulkResults.failed > 0 && (
                      <span className="zto-badge border border-red-500/30 text-red-400">
                        {bulkResults.failed} فشل
                      </span>
                    )}
                  </div>
                  <div className="bg-[#1a1a1a] border border-neutral-800 rounded-lg max-h-48 overflow-y-auto divide-y divide-neutral-800">
                    {bulkResults.results.map((r) => (
                      <div
                        key={r.index}
                        className={`flex items-start gap-2 px-3 py-2 text-xs ${
                          r.ok ? "" : "bg-red-500/5"
                        }`}
                      >
                        {r.ok ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0" dir="ltr">
                          <p className="text-neutral-300 truncate font-mono text-[0.7rem]">
                            {r.input?.url ?? `سطر ${r.index + 1}`}
                          </p>
                          {!r.ok && r.error && (
                            <p className="text-red-400 text-[0.65rem] mt-0.5" dir="rtl">
                              {r.error}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-neutral-800 flex items-center gap-3 justify-end">
              <button onClick={closeBulkModal} className="zto-btn zto-btn-ghost">
                إغلاق
              </button>
              <button
                onClick={handleBulkSubmit}
                disabled={bulkSubmitting || !bulkText.trim()}
                className="zto-btn zto-btn-gold"
              >
                {bulkSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                إضافة الكل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───── Create / Edit Modal ───── */}
      {showModal && (
        <div className="zto-overlay" onClick={closeModal}>
          <div
            className="zto-modal w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Rss className="w-4 h-4 text-amber-400" />
                {editingSource ? "تعديل المصدر" : "مصدر جديد"}
              </h3>
              <button
                onClick={closeModal}
                className="text-neutral-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-5 space-y-5 max-h-[65vh] overflow-y-auto">
              {/* Name + Type */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="zto-label">اسم المصدر *</label>
                  <input
                    type="text"
                    className="zto-input"
                    placeholder="مثال: أخبار التقنية"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, name: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="zto-label">النوع</label>
                  <div className="zto-select-wrap">
                    <select
                      className="zto-input"
                      value={formData.type}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          type: e.target.value as DataSource["type"],
                        }))
                      }
                    >
                      {SOURCE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* URL */}
              <div>
                <label className="zto-label">الرابط *</label>
                <input
                  type="text"
                  className="zto-input"
                  placeholder={TYPE_PLACEHOLDERS[formData.type] || "https://..."}
                  value={formData.url}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, url: e.target.value }))
                  }
                />
              </div>

              {/* Test source — required step for create. */}
              {!editingSource && (
                <div className="bg-[#1a1a1a] border border-neutral-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-bold text-white flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-amber-400" />
                        اختبار المصدر
                      </p>
                      <p className="text-[0.7rem] text-neutral-500 mt-0.5">
                        نجلب 5 عناصر للمعاينة دون حفظها — أكّد أنها صحيحة لتفعيل الإضافة.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleTestSource}
                      disabled={testing || !formData.url.trim()}
                      className="zto-btn zto-btn-outline zto-btn-sm"
                    >
                      {testing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      {testItems ? "إعادة الاختبار" : "اختبار"}
                    </button>
                  </div>

                  {testError && (
                    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                      <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-400">{testError}</p>
                    </div>
                  )}

                  {testWarning && !testError && (
                    <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
                      <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-400">{testWarning}</p>
                    </div>
                  )}

                  {testItems && testItems.length > 0 && (
                    <>
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {testItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="bg-[#0d0d0d] border border-neutral-800 rounded-lg p-3"
                          >
                            <p className="text-xs font-bold text-white line-clamp-2 leading-snug">
                              {item.title || "بدون عنوان"}
                            </p>
                            {item.description && (
                              <p className="text-[0.65rem] text-neutral-400 line-clamp-2 mt-1">
                                {item.description}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              {item.url && (
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[0.6rem] text-amber-400 truncate max-w-[260px] hover:underline"
                                  dir="ltr"
                                >
                                  {item.url}
                                </a>
                              )}
                              {item.publishedAt && (
                                <span className="text-[0.6rem] text-neutral-600 flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" />
                                  {formatDate(item.publishedAt)}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <p className="text-[0.7rem] text-neutral-400">
                          هل النتائج تبدو صحيحة؟
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setTestConfirmed(false)}
                            className={`zto-btn zto-btn-sm ${
                              testConfirmed
                                ? "zto-btn-ghost"
                                : "zto-btn-outline border-red-500/30 !text-red-400"
                            }`}
                          >
                            لا
                          </button>
                          <button
                            type="button"
                            onClick={() => setTestConfirmed(true)}
                            className={`zto-btn zto-btn-sm ${
                              testConfirmed
                                ? "zto-btn-gold"
                                : "zto-btn-outline"
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            نعم — متابعة الإضافة
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Topic (news / insights / real estate) */}
              <div>
                <label className="zto-label">الموضوع *</label>
                <div className="zto-select-wrap">
                  <select
                    className="zto-input"
                    value={formData.topic}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        topic: e.target.value as DataSource["topic"],
                      }))
                    }
                  >
                    {TOPICS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[0.65rem] text-neutral-500 mt-1">
                  {TOPICS.find((t) => t.value === formData.topic)?.description}
                </p>
              </div>

              {/* Category + Fetch Interval */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="zto-label">الفئة</label>
                  <div className="zto-select-wrap">
                    <select
                      className="zto-input"
                      value={formData.category}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          category: e.target.value as DataSource["category"],
                        }))
                      }
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="zto-label">فترة الجلب (بالدقائق)</label>
                  <input
                    type="number"
                    className="zto-input"
                    min={5}
                    value={formData.fetchInterval}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        fetchInterval: parseInt(e.target.value) || 60,
                      }))
                    }
                  />
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between bg-[#1a1a1a] border border-neutral-800 rounded-lg p-4">
                <div>
                  <p className="text-sm font-bold text-white">تفعيل المصدر</p>
                  <p className="text-[0.65rem] text-neutral-500">
                    المصادر المفعلة يتم جلبها تلقائيا
                  </p>
                </div>
                <button
                  onClick={() =>
                    setFormData((p) => ({ ...p, isActive: !p.isActive }))
                  }
                  className="transition-colors"
                >
                  {formData.isActive ? (
                    <ToggleRight className="w-8 h-8 text-emerald-400" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-neutral-600" />
                  )}
                </button>
              </div>
            </div>

            {/* Modal footer */}
            <div className="p-5 border-t border-neutral-800 flex items-center gap-3 justify-end">
              <button onClick={closeModal} className="zto-btn zto-btn-ghost">
                إلغاء
              </button>
              <button
                onClick={handleSave}
                disabled={saving || (!editingSource && !testConfirmed)}
                title={
                  !editingSource && !testConfirmed
                    ? "اختبر المصدر وأكّد النتيجة قبل الإضافة"
                    : undefined
                }
                className="zto-btn zto-btn-gold"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {editingSource ? "حفظ التغييرات" : "إنشاء"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
