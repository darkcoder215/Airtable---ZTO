"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/app-store";
import PageGuide from "@/components/PageGuide";
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
  Building2,
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
  Bot,
  Eye,
  ChevronDown,
  Type as TypeIcon,
  Hash,
  Calendar,
  Mail,
  Phone,
  Link as LinkIcon,
  Paperclip,
  List as ListIcon,
  Square,
  CheckSquare,
  ToggleRight as ToggleIcon,
  Star,
  FileText,
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
  filterAgentId?: string | null;
  brandId?: string | null;
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
  fetchedAt?: string;
  imageUrl?: string;
  // Per-channel engagement bag (X likes/retweets/..., LinkedIn shares/likes/...).
  // Maps directly to the `engagement.<key>` mapping tokens so the side panel can
  // show realistic preview values.
  engagement?: Record<string, string | number | boolean | null>;
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
  { value: "rss", label: "موقع", icon: Rss, color: "text-orange-400", bg: "bg-orange-400/10" },
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
  { value: "news", label: "أخبار (News)", description: "يمر عبر وكيل الفلترة المخصص لهذا المصدر قبل الإرسال إلى الوجهة" },
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
  filterAgentId: "" as string, // empty → backend resolves the seeded default
  brandId: "" as string,        // empty → unassigned
};

/* ───────── Field-type visual metadata ─────────
   Maps Airtable field types to a Lucide icon, a tone class, and a
   short Arabic label so the mapping UI can show *what kind of value*
   each column expects at a glance. */
const FIELD_TYPE_META: Record<
  string,
  { Icon: typeof TypeIcon; tone: string; label: string }
> = {
  singleLineText:      { Icon: TypeIcon,  tone: "text-blue-300 border-blue-400/30 bg-blue-400/10",    label: "نص قصير" },
  multilineText:       { Icon: FileText,  tone: "text-blue-300 border-blue-400/30 bg-blue-400/10",    label: "نص طويل" },
  richText:            { Icon: FileText,  tone: "text-blue-300 border-blue-400/30 bg-blue-400/10",    label: "نص منسّق" },
  email:               { Icon: Mail,      tone: "text-cyan-300 border-cyan-400/30 bg-cyan-400/10",    label: "بريد" },
  phoneNumber:         { Icon: Phone,     tone: "text-cyan-300 border-cyan-400/30 bg-cyan-400/10",    label: "هاتف" },
  url:                 { Icon: LinkIcon,  tone: "text-purple-300 border-purple-400/30 bg-purple-400/10", label: "رابط" },
  number:              { Icon: Hash,      tone: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10", label: "رقم" },
  percent:             { Icon: Hash,      tone: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10", label: "نسبة" },
  currency:            { Icon: Hash,      tone: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10", label: "عملة" },
  rating:              { Icon: Star,      tone: "text-amber-300 border-amber-400/30 bg-amber-400/10",  label: "تقييم" },
  duration:            { Icon: Clock,     tone: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10", label: "مدّة" },
  date:                { Icon: Calendar,  tone: "text-pink-300 border-pink-400/30 bg-pink-400/10",    label: "تاريخ" },
  dateTime:            { Icon: Calendar,  tone: "text-pink-300 border-pink-400/30 bg-pink-400/10",    label: "تاريخ + وقت" },
  createdTime:         { Icon: Calendar,  tone: "text-pink-300 border-pink-400/30 bg-pink-400/10",    label: "تاريخ الإنشاء" },
  lastModifiedTime:    { Icon: Calendar,  tone: "text-pink-300 border-pink-400/30 bg-pink-400/10",    label: "آخر تعديل" },
  checkbox:            { Icon: CheckSquare, tone: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10", label: "صح/خطأ" },
  singleSelect:        { Icon: Square,    tone: "text-orange-300 border-orange-400/30 bg-orange-400/10", label: "اختيار واحد" },
  multipleSelects:     { Icon: ListIcon,  tone: "text-orange-300 border-orange-400/30 bg-orange-400/10", label: "اختيار متعدّد" },
  multipleAttachments: { Icon: Paperclip, tone: "text-rose-300 border-rose-400/30 bg-rose-400/10",    label: "مرفقات / صور" },
  attachment:          { Icon: Paperclip, tone: "text-rose-300 border-rose-400/30 bg-rose-400/10",    label: "مرفق" },
  multipleRecordLinks: { Icon: LinkIcon,  tone: "text-indigo-300 border-indigo-400/30 bg-indigo-400/10", label: "ارتباط بسجل" },
  lookup:              { Icon: Eye,       tone: "text-neutral-300 border-neutral-700 bg-neutral-800/40", label: "بحث (محسوب)" },
  rollup:              { Icon: Hash,      tone: "text-neutral-300 border-neutral-700 bg-neutral-800/40", label: "تجميع (محسوب)" },
  formula:             { Icon: Hash,      tone: "text-neutral-300 border-neutral-700 bg-neutral-800/40", label: "صيغة (محسوب)" },
  autoNumber:          { Icon: Hash,      tone: "text-neutral-300 border-neutral-700 bg-neutral-800/40", label: "ترقيم تلقائي" },
  count:               { Icon: Hash,      tone: "text-neutral-300 border-neutral-700 bg-neutral-800/40", label: "عدّ" },
  barcode:             { Icon: TypeIcon,  tone: "text-neutral-300 border-neutral-700 bg-neutral-800/40", label: "باركود" },
  button:              { Icon: ToggleIcon, tone: "text-neutral-300 border-neutral-700 bg-neutral-800/40", label: "زرّ" },
};

const COMPUTED_TYPES = new Set([
  "lookup", "rollup", "formula", "autoNumber", "count", "createdTime", "lastModifiedTime",
]);

function getFieldTypeMeta(type: string) {
  return FIELD_TYPE_META[type] ?? {
    Icon: TypeIcon,
    tone: "text-neutral-300 border-neutral-700 bg-neutral-800/40",
    label: type,
  };
}

/* ───────── Component ───────── */

export default function DataSourcesPage() {
  const { user, addToast } = useAppStore();

  const [sources, setSources] = useState<DataSource[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  // Currently-expanded article — clicking a card flips this to its id and
  // reveals the full description + larger image; clicking the open card
  // again (or another card) closes/swaps it.
  const [expandedArticleId, setExpandedArticleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [fetchingAll, setFetchingAll] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingSource, setEditingSource] = useState<DataSource | null>(null);
  const [saving, setSaving] = useState(false);

  // Filtering agents available for assignment to a source. Loaded once on
  // mount and refreshed when the modal opens so newly-created agents appear.
  interface FilterAgentSummary {
    id: string;
    name: string;
    description: string;
    modelName: string;
    temperature: number;
    maxTokens: number;
    isActive: boolean;
  }
  const [filterAgents, setFilterAgents] = useState<FilterAgentSummary[]>([]);
  const loadFilterAgents = async () => {
    try {
      const res = await fetch("/api/data-sources?action=filter-agents");
      const d = await res.json();
      if (res.ok && Array.isArray(d.agents)) {
        setFilterAgents(d.agents);
      }
    } catch {
      // non-fatal
    }
  };

  // Brands roster — populates the brand picker on create/edit and the
  // brand column on the sources table.
  interface BrandSummary { id: string; name: string; slug: string }
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const loadBrands = async () => {
    try {
      const res = await fetch("/api/brands");
      const d = await res.json();
      if (res.ok && Array.isArray(d.brands)) {
        setBrands(
          d.brands.map((b: { id: string; name: string; slug: string }) => ({
            id: b.id,
            name: b.name,
            slug: b.slug,
          }))
        );
      }
    } catch {
      // non-fatal — brands tab still works on its own
    }
  };
  const brandById = useMemo(() => {
    const m = new Map<string, BrandSummary>();
    for (const b of brands) m.set(b.id, b);
    return m;
  }, [brands]);

  // Per-source agent test results (preview pane).
  interface FilterTestDecision { title: string; url: string; passed: boolean }
  const [filterTestRunning, setFilterTestRunning] = useState(false);
  const [filterTestResult, setFilterTestResult] = useState<{
    spec?: { agentName: string; model: string };
    decisions: FilterTestDecision[];
    error?: string;
    note?: string;
  } | null>(null);

  // Tick once a second so relative time labels (last-fetched / next-fetch
  // countdown) refresh without forcing a server re-fetch. We only run the
  // ticker while the sources tab is visible to avoid background work.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

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
  const [activeTab, setActiveTab] = useState<"sources" | "articles" | "filters" | "destination" | "guide">("sources");

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
  const [filterHistorySourceId, setFilterHistorySourceId] = useState<string>("");
  const [filterHistorySearch, setFilterHistorySearch] = useState<string>("");

  /* ───────── Destination mapping (per source type) ───────── */
  type FieldEntry = { type: "field"; field: string; fallback?: string };
  type LiteralEntry = { type: "literal"; value: string };
  type MappingEntry = FieldEntry | LiteralEntry;
  type MappableType = "rss" | "twitter" | "linkedin";
  interface TypeMappingState {
    tableName: string;
    columns: Array<{ column: string; entry: MappingEntry }>;
    // Per-brand overrides, keyed by scraper_brands.id. When the writer
    // chooses a specific brand in the toolbar, the editor edits one of
    // these entries instead of the type-level default.
    byBrand: Record<string, { tableName: string; columns: Array<{ column: string; entry: MappingEntry }> }>;
  }
  interface BrandLite { id: string; name: string; slug: string }
  interface DestColumn {
    id: string;
    name: string;
    type: string;
    description?: string;
  }
  interface DestTable {
    id: string;
    name: string;
    description?: string;
    fieldCount: number;
  }

  const MAPPABLE_TYPES: MappableType[] = ["rss", "twitter", "linkedin"];
  const TYPE_LABELS: Record<MappableType, string> = {
    rss: "المواقع",
    twitter: "X (تويتر)",
    linkedin: "LinkedIn",
  };

  const blankTypeMapping = (tableName = ""): TypeMappingState => ({
    tableName,
    columns: [],
    byBrand: {},
  });

  const [destPerType, setDestPerType] = useState<Record<MappableType, TypeMappingState>>({
    rss: blankTypeMapping(),
    twitter: blankTypeMapping(),
    linkedin: blankTypeMapping(),
  });
  const [destActiveType, setDestActiveType] = useState<MappableType>("rss");
  // Brand scope: null = editing the type-level default. A UUID = editing
  // (or about to create) an override for that specific brand.
  const [destActiveBrandId, setDestActiveBrandId] = useState<string | null>(null);
  // List of brands populated alongside the mapping. Used by the toolbar
  // brand picker. Empty by default so existing flows aren't blocked when
  // the brands table is unreachable.
  const [destBrands, setDestBrands] = useState<BrandLite[]>([]);
  const [destTokens, setDestTokens] = useState<string[]>([]);
  // Per-type token metadata loaded with the mapping. The side panel shows
  // these (label + Arabic one-liner + populated flag) so admins see exactly
  // what each source type actually fills.
  interface TokenMeta { token: string; label: string; description: string; populated: boolean }
  const [destTokenMetaByType, setDestTokenMetaByType] = useState<Record<string, TokenMeta[]>>({});
  const [destTables, setDestTables] = useState<DestTable[]>([]);
  const [destColumnsByTable, setDestColumnsByTable] = useState<Record<string, DestColumn[]>>({});
  const [destLoading, setDestLoading] = useState(false);
  const [destSaving, setDestSaving] = useState(false);
  const [destRefreshing, setDestRefreshing] = useState(false);
  const [destDirty, setDestDirty] = useState(false);
  const [destTesting, setDestTesting] = useState(false);
  const [destTestResult, setDestTestResult] = useState<{
    article: { id: string; title: string; sourceName?: string; url?: string } | null;
    preview: Record<string, string>;
    note?: string;
    missingColumns?: string[];
    tableName?: string;
    sourceType?: MappableType;
  } | null>(null);

  // Article filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPlatform, setFilterPlatform] = useState<string>("");

  // Source filters
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>("all");
  const [sourceCategoryFilter, setSourceCategoryFilter] = useState<string>("all");
  const [sourceBrandFilter, setSourceBrandFilter] = useState<string>("all");
  const [sourceSearch, setSourceSearch] = useState("");
  // Group sources by their channel (default) or by the brand they belong to.
  const [sourceGroupBy, setSourceGroupBy] = useState<"channel" | "brand">("channel");

  // Form state
  const [formData, setFormData] = useState({ ...defaultFormData });

  useEffect(() => {
    loadSources();
    loadFilterAgents();
    void loadBrands();
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
    if (activeTab === "destination") {
      loadDestinationMapping();
      refreshDestinationColumns();
    }
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

  /* Destination mapping (per source type) ↓ */

  const loadDestinationMapping = async () => {
    setDestLoading(true);
    try {
      const res = await fetch("/api/data-sources?action=destination-mapping");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التحميل");
      const m = (data.mapping ?? {}) as Record<
        string,
        {
          tableName?: string;
          columns?: Record<string, MappingEntry>;
          byBrand?: Record<string, { tableName?: string; columns?: Record<string, MappingEntry> }>;
        } | undefined
      >;
      const colsToList = (cols?: Record<string, MappingEntry>) =>
        Object.entries(cols ?? {}).map(([k, e]) => ({ column: k, entry: e as MappingEntry }));
      const next: Record<MappableType, TypeMappingState> = {
        rss: blankTypeMapping(),
        twitter: blankTypeMapping(),
        linkedin: blankTypeMapping(),
      };
      for (const t of MAPPABLE_TYPES) {
        const v = m[t];
        const byBrand: TypeMappingState["byBrand"] = {};
        if (v?.byBrand && typeof v.byBrand === "object") {
          for (const [brandId, ov] of Object.entries(v.byBrand)) {
            byBrand[brandId] = {
              tableName: ov?.tableName ?? "",
              columns: colsToList(ov?.columns),
            };
          }
        }
        next[t] = {
          tableName: v?.tableName ?? "",
          columns: colsToList(v?.columns),
          byBrand,
        };
      }
      setDestPerType(next);
      setDestTokens(Array.isArray(data.articleTokens) ? data.articleTokens : []);
      if (data.articleTokenMetaByType && typeof data.articleTokenMetaByType === "object") {
        setDestTokenMetaByType(data.articleTokenMetaByType as Record<string, TokenMeta[]>);
      }
      if (Array.isArray(data.brands)) {
        setDestBrands(
          (data.brands as Array<{ id: string; name: string; slug: string }>).map((b) => ({
            id: b.id, name: b.name, slug: b.slug,
          }))
        );
      }
      setDestDirty(false);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "فشل تحميل المخطّط", "error");
    } finally {
      setDestLoading(false);
    }
  };

  // Refresh: pull all tables in the destination base, plus the columns for
  // each type's currently-selected table. Keeps the UI snappy when switching
  // tabs without an extra round-trip.
  const refreshDestinationColumns = async () => {
    setDestRefreshing(true);
    try {
      const tablesRes = await fetch("/api/data-sources?action=destination-tables");
      const tablesData = await tablesRes.json();
      if (!tablesRes.ok) throw new Error(tablesData.error || "فشل تحديث الجداول");
      const tables: DestTable[] = Array.isArray(tablesData.tables) ? tablesData.tables : [];
      setDestTables(tables);

      // Fetch columns only for tables actually referenced by the mapping.
      const referenced = new Set<string>();
      for (const t of MAPPABLE_TYPES) {
        const tn = destPerType[t]?.tableName;
        if (tn) referenced.add(tn);
      }
      const colsByTable: Record<string, DestColumn[]> = { ...destColumnsByTable };
      for (const tableName of referenced) {
        try {
          const r = await fetch(
            `/api/data-sources?action=destination-columns&tableName=${encodeURIComponent(tableName)}`
          );
          const d = await r.json();
          if (r.ok && Array.isArray(d.columns)) {
            colsByTable[tableName] = d.columns;
          }
        } catch {
          // skip — leave whatever we already have for this table
        }
      }
      setDestColumnsByTable(colsByTable);
      addToast(`تم تحديث ${tables.length} جدول`, "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "فشل التحديث", "error");
    } finally {
      setDestRefreshing(false);
    }
  };

  // When a type's tableName changes, fetch its columns so the
  // missing-column flag, the autocomplete, and the type badges stay
  // accurate. `force=true` bypasses the cache so the "تحديث" button
  // and the table switcher always re-pull the live schema (handy
  // after the admin adds/renames an Airtable column).
  const fetchColumnsFor = async (tableName: string, force = false) => {
    if (!tableName.trim()) return;
    if (!force && destColumnsByTable[tableName]) return;
    try {
      const r = await fetch(
        `/api/data-sources?action=destination-columns&tableName=${encodeURIComponent(tableName)}`
      );
      const d = await r.json();
      if (r.ok && Array.isArray(d.columns)) {
        setDestColumnsByTable((p) => ({ ...p, [tableName]: d.columns }));
      }
    } catch {
      // ignore
    }
  };

  const saveDestinationMapping = async () => {
    setDestSaving(true);
    try {
      // Wire-format: per type we send tableName + columns (the default)
      // plus an optional byBrand: { [brandId]: { tableName, columns } }
      // map of overrides. The server sanitiser drops anything malformed.
      type WireEntry = { tableName: string; columns: Record<string, MappingEntry> };
      type WireType = WireEntry & { byBrand?: Record<string, WireEntry> };
      const listToCols = (list: TypeMappingState["columns"]): Record<string, MappingEntry> => {
        const cols: Record<string, MappingEntry> = {};
        for (const r of list) {
          if (r.column.trim()) cols[r.column.trim()] = r.entry;
        }
        return cols;
      };
      const payload: Record<MappableType, WireType> = {
        rss: { tableName: "", columns: {} },
        twitter: { tableName: "", columns: {} },
        linkedin: { tableName: "", columns: {} },
      };
      for (const t of MAPPABLE_TYPES) {
        const m = destPerType[t];
        const byBrand: Record<string, WireEntry> = {};
        for (const [brandId, ov] of Object.entries(m.byBrand ?? {})) {
          byBrand[brandId] = {
            tableName: ov.tableName.trim(),
            columns: listToCols(ov.columns),
          };
        }
        payload[t] = {
          tableName: m.tableName.trim(),
          columns: listToCols(m.columns),
          ...(Object.keys(byBrand).length > 0 ? { byBrand } : {}),
        };
      }
      const res = await fetch("/api/data-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-destination-mapping", mapping: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحفظ");
      addToast("تم حفظ مخطّط الوجهة", "success");
      setDestDirty(false);
      await loadDestinationMapping();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setDestSaving(false);
    }
  };

  const testDestinationMapping = async () => {
    setDestTesting(true);
    setDestTestResult(null);
    try {
      // Test against whichever scope is active in the toolbar — the
      // type default, or a brand override if one is selected. We send
      // the whole type entry (default + byBrand) and pass the active
      // brandId so the server can pick the right override.
      const parent = destPerType[destActiveType];
      const listToCols = (list: TypeMappingState["columns"]): Record<string, MappingEntry> => {
        const c: Record<string, MappingEntry> = {};
        for (const r of list) {
          if (r.column.trim()) c[r.column.trim()] = r.entry;
        }
        return c;
      };
      const byBrand: Record<string, { tableName: string; columns: Record<string, MappingEntry> }> = {};
      for (const [brandId, ov] of Object.entries(parent.byBrand ?? {})) {
        byBrand[brandId] = {
          tableName: ov.tableName.trim(),
          columns: listToCols(ov.columns),
        };
      }
      const payload = {
        action: "test-destination-mapping",
        type: destActiveType,
        brandId: destActiveBrandId,
        mapping: {
          [destActiveType]: {
            tableName: parent.tableName.trim(),
            columns: listToCols(parent.columns),
            ...(Object.keys(byBrand).length > 0 ? { byBrand } : {}),
          },
        },
      };
      const res = await fetch("/api/data-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الاختبار");
      setDestTestResult({
        article: data.article,
        preview: data.preview ?? {},
        note: data.note,
        missingColumns: Array.isArray(data.missingColumns) ? data.missingColumns : [],
        tableName: data.tableName,
        sourceType: data.sourceType,
      });
    } catch (err) {
      addToast(err instanceof Error ? err.message : "فشل الاختبار", "error");
    } finally {
      setDestTesting(false);
    }
  };

  // Resolve the slice the editor is currently focused on. `null` brand
  // = the type-level default (`destPerType[type]`). A brand UUID = the
  // override under `destPerType[type].byBrand[brandId]`. Returns a
  // synthetic default-shaped object when an override hasn't been
  // initialised yet so the editor can render before "Clone from default"
  // is clicked.
  const getActiveScope = (
    type: MappableType,
    brandId: string | null,
    state: Record<MappableType, TypeMappingState>
  ): { tableName: string; columns: TypeMappingState["columns"] } => {
    const parent = state[type];
    if (!brandId) return { tableName: parent.tableName, columns: parent.columns };
    const ov = parent.byBrand?.[brandId];
    if (ov) return { tableName: ov.tableName, columns: ov.columns };
    // No override yet — show the parent as a preview. Setting any value
    // will materialise the override via setActiveTypeMapping.
    return { tableName: parent.tableName, columns: parent.columns };
  };

  // Apply a patch to the active scope. When a brand is selected we
  // write to byBrand[brandId], materialising the override on first edit.
  const setActiveTypeMapping = (
    next:
      | { tableName: string; columns: TypeMappingState["columns"] }
      | ((
          prev: { tableName: string; columns: TypeMappingState["columns"] }
        ) => { tableName: string; columns: TypeMappingState["columns"] })
  ) => {
    setDestPerType((prev) => {
      const parent = prev[destActiveType];
      const current = getActiveScope(destActiveType, destActiveBrandId, prev);
      const updated = typeof next === "function" ? next(current) : next;
      if (!destActiveBrandId) {
        return {
          ...prev,
          [destActiveType]: {
            ...parent,
            tableName: updated.tableName,
            columns: updated.columns,
          },
        };
      }
      return {
        ...prev,
        [destActiveType]: {
          ...parent,
          byBrand: {
            ...parent.byBrand,
            [destActiveBrandId]: {
              tableName: updated.tableName,
              columns: updated.columns,
            },
          },
        },
      };
    });
    setDestDirty(true);
  };

  // Drop a brand override entirely. The brand falls back to the
  // type-level mapping on the next save + apply.
  const removeBrandOverride = (brandId: string) => {
    setDestPerType((prev) => {
      const parent = prev[destActiveType];
      if (!parent.byBrand?.[brandId]) return prev;
      const nextByBrand = { ...parent.byBrand };
      delete nextByBrand[brandId];
      return {
        ...prev,
        [destActiveType]: { ...parent, byBrand: nextByBrand },
      };
    });
    setDestDirty(true);
  };

  const updateMappingRow = (
    idx: number,
    patch: Partial<{ column: string; entry: MappingEntry }>
  ) => {
    setActiveTypeMapping((p) => ({
      ...p,
      columns: p.columns.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }));
  };

  const removeMappingRow = (idx: number) => {
    setActiveTypeMapping((p) => ({
      ...p,
      columns: p.columns.filter((_, i) => i !== idx),
    }));
  };

  const addMappingRow = () => {
    setActiveTypeMapping((p) => ({
      ...p,
      columns: [...p.columns, { column: "", entry: { type: "field", field: "title" } }],
    }));
  };

  const setActiveTableName = (tableName: string) => {
    setActiveTypeMapping((p) => ({ ...p, tableName }));
    // Force-refresh on switch so a stale cache from an earlier
    // schema change doesn't show incorrect columns/types.
    if (tableName) void fetchColumnsFor(tableName, true);
  };

  const handleFetch = async (sourceId: string) => {
    const source = sources.find((s) => s.id === sourceId);
    const sourceLabel = source?.name ?? "المصدر";
    setFetchingId(sourceId);
    addToast(`جارٍ جلب "${sourceLabel}"...`, "info");
    try {
      const res = await fetch("/api/data-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fetch", sourceId }),
      });
      const data = await res.json();
      if (res.ok) {
        const count = data.count || data.articles?.length || 0;
        addToast(
          count > 0
            ? `✓ "${sourceLabel}" — تم جلب ${count} عنصر`
            : `✓ "${sourceLabel}" — لا عناصر جديدة`,
          "success"
        );
        loadSources();
        loadArticles();
        loadFilterHistory();
      } else if (data.stale) {
        // Server lost track of this id — refresh sources so the row vanishes.
        addToast("القائمة قديمة — تم تحديثها، حاول مرة أخرى", "warning");
        loadSources();
      } else {
        addToast(`✗ "${sourceLabel}" — ${data.error || "فشل الجلب"}`, "error");
      }
    } catch {
      addToast(`✗ "${sourceLabel}" — حدث خطأ أثناء الجلب`, "error");
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

  // Test the currently-selected filter agent on the editing source's most
  // recent articles (or the global most-recent batch if the source is new).
  const handleTestFilterAgent = async () => {
    setFilterTestRunning(true);
    setFilterTestResult(null);
    try {
      const body: Record<string, unknown> = {
        action: "test-filter-agent",
      };
      if (formData.filterAgentId) body.agentId = formData.filterAgentId;
      if (editingSource?.id) body.sourceId = editingSource.id;
      const res = await fetch("/api/data-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok && !data.spec) {
        setFilterTestResult({
          decisions: [],
          error: data.error || "فشل الاختبار",
        });
        return;
      }
      setFilterTestResult({
        spec: data.spec,
        decisions: Array.isArray(data.decisions) ? data.decisions : [],
        error: data.error,
        note: data.note,
      });
    } catch (err) {
      setFilterTestResult({
        decisions: [],
        error: err instanceof Error ? err.message : "حدث خطأ",
      });
    } finally {
      setFilterTestRunning(false);
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
      // Coerce empty agent id to null — empty string would fail the UUID
      // column type. Empty means "use the resolved default" on the server.
      const cleanForm = {
        ...formData,
        filterAgentId: formData.filterAgentId ? formData.filterAgentId : null,
        brandId: formData.brandId ? formData.brandId : null,
      };
      const body = editingSource
        ? { action, id: editingSource.id, ...cleanForm }
        : { action, ...cleanForm, createdBy: user?.id };

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
      filterAgentId: source.filterAgentId ?? "",
      brandId: source.brandId ?? "",
    });
    setShowModal(true);
    setFilterTestResult(null);
    void loadFilterAgents();
    void loadBrands();
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
    setFilterTestResult(null);
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
    if (sourceBrandFilter !== "all") {
      // "none" = unassigned bucket
      const brandKey = s.brandId ?? "none";
      if (sourceBrandFilter !== brandKey) return false;
    }
    if (sourceSearch) {
      const q = sourceSearch.toLowerCase();
      const brand = s.brandId ? brandById.get(s.brandId)?.name?.toLowerCase() ?? "" : "";
      return (
        s.name.toLowerCase().includes(q) ||
        s.url.toLowerCase().includes(q) ||
        brand.includes(q)
      );
    }
    return true;
  });

  // Group filtered sources by the active grouping mode.
  // Brand keys are the brand id ("__none__" for unassigned) so the section
  // header can resolve a name + colour even when the brand id changes.
  const NO_BRAND = "__none__";
  const sourcesGrouped: Record<string, DataSource[]> = {};
  for (const s of filteredSources) {
    const key = sourceGroupBy === "brand" ? (s.brandId ?? NO_BRAND) : s.type;
    if (!sourcesGrouped[key]) sourcesGrouped[key] = [];
    sourcesGrouped[key].push(s);
  }

  // Type counts for filter badges (from unfiltered sources)
  const typeCounts: Record<string, number> = {};
  for (const s of sources) {
    typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;
  }

  // Brand counts (from unfiltered sources) — drives the brand pill list.
  // "none" tallies sources with no brand assigned so the user can still
  // see and clean them up.
  const brandCounts: Record<string, number> = {};
  for (const s of sources) {
    const k = s.brandId ?? "none";
    brandCounts[k] = (brandCounts[k] || 0) + 1;
  }

  /* ───────── Filtered articles ───────── */

  // Articles inherit their editorial category + platform from the parent
  // source — they don't carry that on their own row.
  const sourceCategoryById = new Map<string, DataSource["category"]>();
  const sourceTypeById = new Map<string, DataSource["type"]>();
  for (const s of sources) {
    sourceCategoryById.set(s.id, s.category);
    sourceTypeById.set(s.id, s.type);
  }
  const articleCategory = (a: Article): DataSource["category"] =>
    sourceCategoryById.get(a.sourceId) ?? "general";
  const articlePlatform = (a: Article): string =>
    sourceTypeById.get(a.sourceId) ?? "rss";

  const filteredArticles = articles.filter((a) => {
    if (filterSource && a.sourceId !== filterSource) return false;
    if (filterCategory && articleCategory(a) !== filterCategory) return false;
    if (filterPlatform && articlePlatform(a) !== filterPlatform) return false;
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

  const formatDate = (dateStr: string | null | undefined) => {
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

  // Returns the predicted next-fetch time in ms, or null when unknown.
  const nextFetchAtMs = (s: DataSource): number | null => {
    if (!s.isActive) return null;
    const interval = (s.fetchInterval || 60) * 60_000;
    if (!s.lastFetchedAt) return nowMs; // never fetched → due now
    const t = new Date(s.lastFetchedAt).getTime();
    if (!Number.isFinite(t)) return null;
    return t + interval;
  };

  // Live "X ago" / "in X" formatter. Uses the ticking nowMs state so the
  // label updates every second without polling the server.
  const formatLiveRelative = (
    targetMs: number | null,
    opts: { future?: boolean } = {}
  ): string => {
    if (targetMs == null) return "—";
    const diff = targetMs - nowMs;
    const past = diff < 0;
    const seconds = Math.max(0, Math.round(Math.abs(diff) / 1000));
    const fmt = (n: number, label: string) => `${n} ${label}`;
    let core: string;
    if (seconds < 60) core = fmt(seconds, "ثانية");
    else if (seconds < 3600) core = fmt(Math.floor(seconds / 60), "دقيقة");
    else if (seconds < 86_400) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      core = m > 0 ? `${h} ساعة و${m} دقيقة` : `${h} ساعة`;
    } else core = fmt(Math.floor(seconds / 86_400), "يوم");
    if (opts.future) {
      return past ? `متأخر بـ${core}` : `خلال ${core}`;
    }
    return past ? `قبل ${core}` : `خلال ${core}`;
  };

  /* ───────── Render ───────── */

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2 tracking-tight">
            <Rss className="w-5 h-5 text-amber-400" />
            مصادر البيانات
          </h2>
          <p className="text-neutral-400 text-[13px] font-bold mt-1">
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
              onClick={() => setActiveTab("destination")}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${
                activeTab === "destination"
                  ? "bg-white text-black"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              الوجهة
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

      <PageGuide
        pageName="مصادر البيانات"
        accent="amber"
        storageKey="data-sources"
        intro={
          <>
            هذه الصفحة هي قلب النظام: تضيف مصادر (مواقع/X/LinkedIn)، يلتقطها النظام كل دقائق محدّدة، يفلترها وكيل ذكي، ثم يكتب الناتج إلى Airtable. تنقّل بين التبويبات لإدارة كل مرحلة بشكل مستقل.
          </>
        }
        tips={[
          { title: "تبويب «المصادر»", body: <>أضف موقعاً (RSS) أو حساب X/LinkedIn، اربطه بعلامة، وحدّد كل كم دقيقة يُجلب. <span className="text-amber-300">اختبر</span> المصدر قبل الحفظ لتأكيد أن الجلب يعمل والتاريخ يُقرأ صحيحاً.</> },
          { title: "تبويب «الأخبار»", body: <>كل ما تمّ التقاطه. تصفّح، اقرأ، أو احفظ يدوياً إلى Airtable لو أردت تجاوز الفلتر الذكي.</> },
          { title: "تبويب «الفلترة»", body: <>سجلّ كل دورة فلترة: ما الذي كَيِّف ولماذا. مفيد لمراجعة قرارات وكيل الفلترة وضبط تعليماته في صفحة الوكلاء.</> },
          { title: "تبويب «الوجهة»", body: <>هنا تختار جدول Airtable لكل نوع مصدر، وتربط أعمدة الجدول مع حقول المقال. عمود <code className="text-amber-400 font-mono">Brand</code> يأخذ تلقائياً اسم العلامة المربوطة بالمصدر إن اخترت الحقل <code className="text-amber-400 font-mono">brandName</code>.</> },
          { title: "تبويب «إضافة مصادر»", body: <>أمثلة وأدلّة لكل نوع مصدر — استخدمها كمرجع عند إضافة قنوات جديدة لم تتعامل معها من قبل.</> },
          { title: "السجلّات والتشخيص", body: <>كل دورة جلب تكتب 5–6 أسطر مفصّلة في صفحة <span className="text-amber-300 font-bold">السجلّات</span> (FETCH → DEDUP → PERSIST → FILTER → AIRTABLE). اذهب إلى هناك مباشرةً عند ظهور أيّ خلل.</> },
        ]}
      />

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

              {/* Brand filter */}
              <div className="zto-select-wrap min-w-[150px]">
                <select
                  className="zto-input text-xs"
                  value={sourceBrandFilter}
                  onChange={(e) => setSourceBrandFilter(e.target.value)}
                >
                  <option value="all">كل العلامات</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({brandCounts[b.id] ?? 0})
                    </option>
                  ))}
                  {(brandCounts.none ?? 0) > 0 && (
                    <option value="none">— بلا علامة — ({brandCounts.none})</option>
                  )}
                </select>
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

              {/* Group-by toggle — channel vs brand */}
              <div className="flex items-center bg-[#1a1a1a] border border-neutral-800 rounded-lg overflow-hidden" title="طريقة التجميع">
                <button
                  onClick={() => setSourceGroupBy("channel")}
                  className={`px-2.5 py-1 text-[10px] font-bold transition-colors ${
                    sourceGroupBy === "channel" ? "bg-white text-black" : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  حسب القناة
                </button>
                <button
                  onClick={() => setSourceGroupBy("brand")}
                  className={`px-2.5 py-1 text-[10px] font-bold transition-colors ${
                    sourceGroupBy === "brand" ? "bg-white text-black" : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  حسب العلامة
                </button>
              </div>

              {/* Search */}
              <div className="relative min-w-[180px]">
                <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
                <input
                  type="text"
                  className="zto-input text-xs" style={{ paddingInlineStart: "2.5rem" }}
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
              {sources.length > 0 &&
                (sourceTypeFilter !== "all" ||
                  sourceCategoryFilter !== "all" ||
                  sourceBrandFilter !== "all" ||
                  sourceSearch) && (
                  <button
                    onClick={() => {
                      setSourceTypeFilter("all");
                      setSourceCategoryFilter("all");
                      setSourceBrandFilter("all");
                      setSourceSearch("");
                    }}
                    className="zto-btn zto-btn-outline zto-btn-sm"
                  >
                    مسح الفلتر
                  </button>
                )}
              {sources.length === 0 && user?.role === "admin" && (
                <button onClick={() => setShowModal(true)} className="zto-btn zto-btn-gold">
                  <Plus className="w-4 h-4" />
                  إضافة مصدر جديد
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Render grouped by the active mode (channel | brand). Brand
                  groups sort by name; the unassigned bucket is pushed last. */}
              {Object.entries(sourcesGrouped)
                .sort(([a], [b]) => {
                  if (sourceGroupBy !== "brand") return 0;
                  if (a === NO_BRAND) return 1;
                  if (b === NO_BRAND) return -1;
                  const an = brandById.get(a)?.name ?? "";
                  const bn = brandById.get(b)?.name ?? "";
                  return an.localeCompare(bn);
                })
                .map(([key, typeSources]) => {
                // Resolve a header label + icon depending on the grouping.
                let headerLabel: string;
                let HeaderIcon: typeof Building2;
                let iconBg = "bg-neutral-700/20";
                let iconColor = "text-neutral-400";
                if (sourceGroupBy === "brand") {
                  HeaderIcon = Building2;
                  if (key === NO_BRAND) {
                    headerLabel = "بدون علامة";
                  } else {
                    headerLabel = brandById.get(key)?.name ?? "علامة محذوفة";
                    iconBg = "bg-amber-400/10";
                    iconColor = "text-amber-400";
                  }
                } else {
                  const st = getSourceType(key);
                  HeaderIcon = st.icon;
                  iconBg = st.bg;
                  iconColor = st.color;
                  headerLabel = st.label;
                }
                return (
                  <div key={key}>
                    {/* Group header */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center ${iconBg}`}>
                        <HeaderIcon className={`w-4 h-4 ${iconColor}`} />
                      </div>
                      <h3 className="text-sm font-black text-white">{headerLabel}</h3>
                      <span className="text-xs text-neutral-500">{typeSources.length} مصدر</span>
                    </div>

                    {/* Table */}
                    <div className="zto-card overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-neutral-800 text-[0.65rem] text-neutral-500 font-bold uppercase tracking-wider">
                            <th className="text-right px-4 py-3">المصدر</th>
                            <th className="text-right px-4 py-3 hidden md:table-cell">الرابط</th>
                            <th className="text-right px-4 py-3 hidden md:table-cell">العلامة</th>
                            <th className="text-right px-4 py-3">الفئة</th>
                            <th className="text-right px-4 py-3 hidden lg:table-cell">آخر جلب</th>
                            <th className="text-right px-4 py-3 hidden xl:table-cell">وتيرة الجلب</th>
                            <th className="text-right px-4 py-3 hidden xl:table-cell">الجلب التالي</th>
                            <th className="text-right px-4 py-3 hidden lg:table-cell">الوكيل</th>
                            <th className="text-center px-4 py-3">الحالة</th>
                            <th className="text-left px-4 py-3">إجراءات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {typeSources.map((source) => {
                            const cat = getCategoryInfo(source.category);
                            const isFetching = fetchingId === source.id;
                            return (
                              <Fragment key={source.id}>
                              <tr
                                className={`border-b border-neutral-800/50 transition-colors ${
                                  isFetching ? "bg-amber-500/5 border-b-0" : "hover:bg-neutral-800/20"
                                }`}
                              >
                                {/* Name */}
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <p className="font-bold text-sm text-white truncate max-w-[200px]">{source.name}</p>
                                    {isFetching && (
                                      <span className="text-[0.6rem] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded px-1.5 py-0.5 flex items-center gap-1">
                                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                        جارٍ الجلب
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* URL */}
                                <td className="px-4 py-3 hidden md:table-cell">
                                  <p className="text-xs text-neutral-500 truncate max-w-[250px]" title={source.url}>
                                    {source.url}
                                  </p>
                                </td>

                                {/* Brand */}
                                <td className="px-4 py-3 hidden md:table-cell">
                                  {source.brandId && brandById.has(source.brandId) ? (
                                    <span className="zto-badge border border-amber-500/30 text-amber-300 text-[0.6rem] flex items-center gap-1 w-fit">
                                      <Building2 className="w-3 h-3" />
                                      {brandById.get(source.brandId)!.name}
                                    </span>
                                  ) : (
                                    <span className="text-[0.6rem] text-neutral-600">— بلا علامة —</span>
                                  )}
                                </td>

                                {/* Category */}
                                <td className="px-4 py-3">
                                  <span className={`zto-badge text-[0.6rem] ${cat.badge}`}>{cat.label}</span>
                                </td>

                                {/* Last fetched (per-source, live "X ago") */}
                                <td className="px-4 py-3 hidden lg:table-cell">
                                  {source.lastFetchedAt ? (
                                    <span
                                      className="text-[0.65rem] text-neutral-400 flex items-center gap-1"
                                      title={new Date(source.lastFetchedAt).toLocaleString("ar-SA")}
                                    >
                                      <Clock className="w-3 h-3" />
                                      {formatLiveRelative(new Date(source.lastFetchedAt).getTime())}
                                    </span>
                                  ) : (
                                    <span className="text-[0.65rem] text-neutral-600 flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      لم يتم الجلب بعد
                                    </span>
                                  )}
                                </td>

                                {/* Frequency — explicit "every X minutes" so the
                                    next-fetch countdown isn't the only signal. */}
                                <td className="px-4 py-3 hidden xl:table-cell">
                                  <span
                                    className="text-[0.65rem] text-neutral-400 flex items-center gap-1"
                                    title={`كل ${source.fetchInterval} دقيقة`}
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                    {source.fetchInterval >= 60 && source.fetchInterval % 60 === 0
                                      ? `كل ${source.fetchInterval / 60} ساعة`
                                      : `كل ${source.fetchInterval} دقيقة`}
                                  </span>
                                </td>

                                {/* Next fetch — live ticking countdown per source */}
                                <td className="px-4 py-3 hidden xl:table-cell">
                                  {(() => {
                                    const ms = nextFetchAtMs(source);
                                    const overdue = ms != null && ms - nowMs < 0;
                                    return (
                                      <span
                                        className={`text-[0.65rem] flex items-center gap-1 tabular-nums ${
                                          !source.isActive
                                            ? "text-neutral-700"
                                            : overdue
                                              ? "text-amber-400"
                                              : "text-neutral-400"
                                        }`}
                                        title={
                                          ms
                                            ? `كل ${source.fetchInterval} دقيقة · التالي: ${new Date(ms).toLocaleString("ar-SA")}`
                                            : "—"
                                        }
                                      >
                                        <Clock className="w-3 h-3" />
                                        {!source.isActive
                                          ? "معطل"
                                          : formatLiveRelative(ms, { future: true })}
                                      </span>
                                    );
                                  })()}
                                </td>

                                {/* Filter agent — only meaningful for news topic;
                                    insights/real_estate skip filtering entirely. */}
                                <td className="px-4 py-3 hidden lg:table-cell">
                                  {source.topic !== "news" ? (
                                    <span className="text-[0.65rem] text-neutral-600">—</span>
                                  ) : (() => {
                                    const a = source.filterAgentId
                                      ? filterAgents.find((x) => x.id === source.filterAgentId)
                                      : null;
                                    const fallback = filterAgents[0];
                                    const eff = a ?? fallback;
                                    return (
                                      <span
                                        className="text-[0.65rem] text-neutral-300 flex items-center gap-1"
                                        title={eff ? `${eff.name} (${eff.modelName})` : "لم يُعرَّف وكيل بعد"}
                                      >
                                        <Bot className="w-3 h-3 text-purple-400" />
                                        <span className="truncate max-w-[140px]">
                                          {eff?.name ?? "افتراضي"}
                                        </span>
                                        {!a && fallback && (
                                          <span className="text-[0.55rem] text-neutral-500">(افتراضي)</span>
                                        )}
                                      </span>
                                    );
                                  })()}
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
                              {isFetching && (
                                <tr className="border-b border-neutral-800/50 bg-amber-500/5">
                                  <td colSpan={10} className="p-0">
                                    <div
                                      className="zto-fetch-progress"
                                      role="progressbar"
                                      aria-label="جلب المصدر"
                                    />
                                  </td>
                                </tr>
                              )}
                              </Fragment>
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
          {/* Dedup explainer banner */}
          <details className="zto-card p-4 group">
            <summary className="cursor-pointer flex items-center gap-2 list-none">
              <Info className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-sm font-bold text-white">كيف نميّز الجديد من المكرّر؟</span>
              <ChevronDown className="w-4 h-4 text-neutral-500 mr-auto group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-3 text-xs text-neutral-400 leading-relaxed space-y-2 pr-6">
              <p>
                لكل مصدر نحتفظ بسجل لجميع الروابط التي رأيناها سابقاً (في الجدول
                <code className="text-amber-400 mx-1 font-mono">scraper_articles</code>).
              </p>
              <p>
                عند كل عملية جلب — يدويّة كانت أو تلقائيّة عبر المؤقّت — نقوم بـ:
              </p>
              <ol className="list-decimal pr-5 space-y-1">
                <li>طلب القائمة الكاملة من المصدر (موقع / X / LinkedIn).</li>
                <li>
                  قراءة كل الروابط المحفوظة لهذا المصدر تحديداً (مفتاح الفلترة:
                  <code className="text-amber-400 mx-1 font-mono">source_id + url</code>).
                </li>
                <li>
                  إبقاء العناصر التي رابطها <span className="text-emerald-400">غير موجود</span> ضمن المحفوظات فقط.
                </li>
                <li>
                  تخزين الجدد في قاعدة البيانات تحت قيد فريد على
                  <code className="text-amber-400 mx-1 font-mono">(source_id, url)</code>،
                  حتى لو دخل عنصر مكرّر في نفس اللحظة فلن يُسجَّل مرتين.
                </li>
                <li>
                  للأخبار (<span className="text-purple-400">News</span>) فقط: تمرير العناوين الجديدة
                  عبر فلترة الذكاء الاصطناعي قبل إرسال المؤهل منها للوجهة.
                </li>
              </ol>
              <p className="text-neutral-500">
                إذا غيّر الناشر رابط مقال (مثلاً تعديل الـslug)، يُعتبر عنصراً جديداً وقد يُحفظ مرتين.
                نفس المقال إن ظهر تحت مصدرين مختلفين يُحفظ من كل مصدر مستقلّاً.
              </p>
            </div>
          </details>

          {/* Filter bar */}
          <div className="zto-card p-4">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Search — pr-12 keeps the placeholder away from the right-side
                  magnifier on RTL layouts (zto-input uses padding-inline so
                  Tailwind's pr-* utility wins per-edge). */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
                <input
                  type="text"
                  className="zto-input" style={{ paddingInlineStart: "2.75rem" }}
                  placeholder="بحث في الأخبار..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Platform filter */}
              <div className="zto-select-wrap min-w-[140px]">
                <select
                  className="zto-input"
                  value={filterPlatform}
                  onChange={(e) => setFilterPlatform(e.target.value)}
                >
                  <option value="">كل المنصات</option>
                  {SOURCE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
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
                const isOpen = expandedArticleId === article.id;
                return (
                  <article
                    key={article.id}
                    className={`zto-card overflow-hidden transition-all duration-200 ${
                      isOpen
                        ? "md:col-span-2 xl:col-span-3 border-amber-400/40 bg-amber-400/[0.02] shadow-lg shadow-amber-400/[0.05]"
                        : "hover:border-amber-400/30 hover:-translate-y-0.5"
                    }`}
                  >
                    {/* Compact header — always rendered, click anywhere to toggle */}
                    <button
                      type="button"
                      onClick={() => setExpandedArticleId(isOpen ? null : article.id)}
                      className="w-full text-right p-5 cursor-pointer"
                      aria-expanded={isOpen}
                    >
                      <div className="flex items-start gap-3 mb-2">
                        {article.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={article.imageUrl}
                            alt=""
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="w-12 h-12 rounded-md object-cover bg-neutral-900 border border-neutral-800 shrink-0"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : null}
                        <h3 className={`font-bold text-sm text-white flex-1 ${isOpen ? "" : "line-clamp-2"}`}>
                          {article.title}
                        </h3>
                        <ChevronDown
                          className={`w-4 h-4 text-neutral-500 shrink-0 transition-transform ${
                            isOpen ? "rotate-180 text-amber-400" : ""
                          }`}
                        />
                      </div>

                      {!isOpen && (
                        <p className="text-xs text-neutral-400 mb-3 line-clamp-3">
                          {article.description || "بدون وصف"}
                        </p>
                      )}

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="zto-badge zto-badge-gold">{article.sourceName}</span>
                        <span className={`zto-badge ${cat.badge}`}>{cat.label}</span>
                        {article.categories?.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="zto-badge text-[0.55rem] border border-neutral-700 text-neutral-400"
                          >
                            #{tag}
                          </span>
                        ))}
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
                        ) : null}
                      </div>
                    </button>

                    {/* Expanded body — full description, hero image, actions */}
                    {isOpen && (
                      <div className="border-t border-neutral-800 bg-[#0a0a0a]">
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-0">
                          <div className="p-5 space-y-4">
                            {article.description ? (
                              <div>
                                <p className="text-[0.6rem] uppercase tracking-wider text-neutral-500 font-bold mb-1.5">
                                  المحتوى
                                </p>
                                <p
                                  className="text-sm text-neutral-200 leading-relaxed whitespace-pre-line"
                                  dir="auto"
                                >
                                  {article.description}
                                </p>
                              </div>
                            ) : (
                              <p className="text-xs text-neutral-500 italic">— لا يوجد وصف —</p>
                            )}

                            {/* Metadata strip */}
                            <div className="grid grid-cols-2 gap-3 text-[0.65rem]">
                              {article.author && (
                                <div>
                                  <p className="text-neutral-500 font-bold mb-0.5">الكاتب</p>
                                  <p className="text-neutral-300">{article.author}</p>
                                </div>
                              )}
                              <div>
                                <p className="text-neutral-500 font-bold mb-0.5">المصدر</p>
                                <p className="text-neutral-300">{article.sourceName ?? "—"}</p>
                              </div>
                              <div>
                                <p className="text-neutral-500 font-bold mb-0.5">تاريخ النشر</p>
                                <p className="text-neutral-300">{formatDate(article.publishedAt)}</p>
                              </div>
                              {article.fetchedAt && (
                                <div>
                                  <p className="text-neutral-500 font-bold mb-0.5">وقت الجلب</p>
                                  <p className="text-neutral-300">{formatDate(article.fetchedAt)}</p>
                                </div>
                              )}
                            </div>

                            {/* Engagement stats (X / LinkedIn) */}
                            {article.engagement && Object.keys(article.engagement).length > 0 && (
                              <div>
                                <p className="text-[0.6rem] uppercase tracking-wider text-neutral-500 font-bold mb-1.5">
                                  مقاييس التفاعل
                                </p>
                                <div className="flex items-center flex-wrap gap-1.5">
                                  {Object.entries(article.engagement)
                                    .filter(([, v]) => v != null && v !== "" && v !== 0 && v !== false)
                                    .slice(0, 12)
                                    .map(([k, v]) => (
                                      <span
                                        key={k}
                                        className="text-[0.6rem] bg-[#1a1a1a] border border-neutral-800 rounded-full px-2 py-0.5"
                                      >
                                        <span className="text-neutral-500">{k}:</span>{" "}
                                        <span className="text-neutral-200">{String(v)}</span>
                                      </span>
                                    ))}
                                </div>
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-neutral-800">
                              {article.url && (
                                <a
                                  href={article.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="zto-btn zto-btn-outline zto-btn-sm"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  فتح المقال الأصلي
                                </a>
                              )}
                              {article.savedToAirtable ? (
                                <span className="zto-btn zto-btn-sm border border-emerald-500/30 !text-emerald-400 cursor-default">
                                  <Database className="w-3.5 h-3.5" />
                                  محفوظ في الوجهة
                                </span>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSaveToDestination(article.id, article.sourceName || "Unknown");
                                  }}
                                  disabled={savingToDestination === article.id}
                                  className="zto-btn zto-btn-gold zto-btn-sm"
                                >
                                  {savingToDestination === article.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Database className="w-3.5 h-3.5" />
                                  )}
                                  حفظ في الوجهة
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedArticleId(null);
                                }}
                                className="zto-btn zto-btn-ghost zto-btn-sm mr-auto"
                              >
                                <X className="w-3.5 h-3.5" />
                                طي
                              </button>
                            </div>
                          </div>

                          {/* Hero image — fixed-side on md+, full-width on mobile */}
                          {article.imageUrl && (
                            <div className="bg-black flex items-center justify-center md:border-r md:border-neutral-800 max-h-[420px] overflow-hidden">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={article.imageUrl}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                  (e.currentTarget.parentElement as HTMLElement | null)?.style.setProperty("display", "none");
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ───── Filters Tab ───── */}
      {activeTab === "filters" && (() => {
        const visibleHistory = filterHistoryItems.filter((item) => {
          if (filterHistorySourceId && item.sourceId !== filterHistorySourceId) return false;
          if (filterHistorySearch.trim()) {
            const q = filterHistorySearch.trim().toLowerCase();
            const inName = item.sourceName?.toLowerCase().includes(q);
            const inTitles = item.articles.some((a) => a.title?.toLowerCase().includes(q));
            if (!inName && !inTitles) return false;
          }
          return true;
        });

        return (
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

          {/* Filter bar — by source + free-text */}
          <div className="zto-card p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="zto-select-wrap min-w-[220px]">
                <select
                  className="zto-input text-xs"
                  value={filterHistorySourceId}
                  onChange={(e) => setFilterHistorySourceId(e.target.value)}
                >
                  <option value="">كل المصادر</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
                <input
                  type="text"
                  className="zto-input text-xs" style={{ paddingInlineStart: "2.5rem" }}
                  placeholder="بحث في عناوين السجل..."
                  value={filterHistorySearch}
                  onChange={(e) => setFilterHistorySearch(e.target.value)}
                />
              </div>
              <span className="zto-badge zto-badge-info">
                {visibleHistory.length} من {filterHistoryItems.length}
              </span>
              {(filterHistorySourceId || filterHistorySearch) && (
                <button
                  onClick={() => {
                    setFilterHistorySourceId("");
                    setFilterHistorySearch("");
                  }}
                  className="zto-btn zto-btn-ghost zto-btn-sm"
                >
                  مسح الفلتر
                </button>
              )}
            </div>
          </div>

          {loadingFilters ? (
            <div className="zto-card p-16 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
            </div>
          ) : visibleHistory.length === 0 ? (
            <div className="zto-card p-16 text-center">
              <Filter className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
              <p className="text-neutral-500 text-sm font-bold mb-1">
                {filterHistoryItems.length === 0 ? "لا يوجد سجل فلترة بعد" : "لا توجد نتائج للفلتر"}
              </p>
              <p className="text-neutral-600 text-xs">
                {filterHistoryItems.length === 0
                  ? "سيتم تسجيل نتائج الفلترة هنا عند جلب أخبار من مصادر news"
                  : `${filterHistoryItems.length} سجل مخفي بسبب الفلتر`}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {visibleHistory.map((item) => {
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
        );
      })()}

      {/* ───── Destination tab ───── */}
      {activeTab === "destination" && (() => {
        const parent = destPerType[destActiveType];
        // What the editor actually shows + edits — type-level default
        // or a brand override, depending on the toolbar selection.
        const m = getActiveScope(destActiveType, destActiveBrandId, destPerType);
        const overridingBrand = destActiveBrandId
          ? destBrands.find((b) => b.id === destActiveBrandId) ?? null
          : null;
        const overrideExists =
          destActiveBrandId != null && !!parent.byBrand?.[destActiveBrandId];
        const overrideCount = Object.keys(parent.byBrand ?? {}).length;
        const tableColumns = m.tableName ? destColumnsByTable[m.tableName] ?? [] : [];
        const knownColumnNames = new Set(tableColumns.map((c) => c.name));
        const mappedMissing = m.columns
          .filter((r) => r.column.trim() && m.tableName && !knownColumnNames.has(r.column.trim()))
          .map((r) => r.column.trim());

        // Sample article-field values keyed off the most-recent article whose
        // source type matches the active tab, so admins see realistic
        // previews while wiring the mapping.
        const sourceById = new Map(sources.map((s) => [s.id, s]));
        const sampleArticle =
          articles.find((a) => sourceById.get(a.sourceId)?.type === destActiveType) ??
          articles[0];
        const sampleValueFor = (token: string): string => {
          if (!sampleArticle) return "";
          if (token.startsWith("engagement.")) {
            const key = token.slice("engagement.".length);
            const v = sampleArticle.engagement?.[key];
            return v == null ? "" : String(v);
          }
          switch (token) {
            case "title": return sampleArticle.title ?? "";
            case "description": return (sampleArticle.description ?? "").slice(0, 200);
            case "url": return sampleArticle.url ?? "";
            case "author": return sampleArticle.author ?? "";
            case "publishedAt": return sampleArticle.publishedAt ?? "";
            case "fetchedAt": return sampleArticle.fetchedAt ?? "";
            case "sourceName": return sampleArticle.sourceName ?? "";
            case "categories":
              return Array.isArray(sampleArticle.categories)
                ? sampleArticle.categories.join(", ")
                : "";
            case "imageUrl": return sampleArticle.imageUrl ?? "";
            default: return "";
          }
        };
        const looksLikeImageUrl = (s: string): boolean => {
          if (!s) return false;
          if (!/^https?:\/\//i.test(s)) return false;
          return /\.(jpe?g|png|gif|webp|avif|bmp)(\?|#|$)/i.test(s) ||
            /pbs\.twimg\.com|licdn\.com|gravatar\.com/i.test(s);
        };

        return (
        <div className="space-y-4">
          {/* Instructions card */}
          <div className="zto-card p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-amber-400/10">
                <Database className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">طريقة حفظ البيانات في الوجهة</h3>
                <p className="text-[0.7rem] text-neutral-500 mt-0.5">
                  لكل نوع مصدر مخطّط مستقل ووجهة مستقلة. اختر النوع، ثم الجدول، ثم وزّع الأعمدة.
                </p>
              </div>
            </div>
            <div className="bg-[#1a1a1a] border border-neutral-800 rounded-lg p-3 space-y-2 text-[0.7rem] text-neutral-400 leading-relaxed">
              <p>
                <span className="text-amber-400 font-bold">عمود الوجهة</span> هو اسم العمود في Airtable كما هو حرفياً.
                إذا كتبته بشكل خاطئ، Airtable سيرفض الحفظ، وسنتجاهل العمود ونسجّل تنبيهاً في السجلات.
              </p>
              <p>
                لكل عمود اختر <span className="text-amber-400 font-bold">المصدر</span>:
              </p>
              <ul className="list-disc pr-5 space-y-0.5">
                <li>
                  <span className="text-purple-400">حقل من المقال</span>: العنوان، الوصف، الرابط، الكاتب، تاريخ النشر، اسم المصدر، الصورة، الفئات.
                </li>
                <li>
                  <span className="text-purple-400">قيمة ثابتة</span>: نص ثابت يُكتب لكل سجل (مثل
                  <code className="text-amber-400 mx-1 font-mono">New</code> لعمود الحالة).
                </li>
              </ul>
              <p>
                اضغط <span className="text-amber-400 font-bold">تحديث</span> بعد إضافة عمود في Airtable لجلبه هنا. الأعمدة المفقودة تُعرض بشارة حمراء.
              </p>
            </div>
          </div>

          {/* Type tabs */}
          <div className="zto-card p-3 flex items-center gap-2 flex-wrap">
            {MAPPABLE_TYPES.map((t) => {
              const stat = destPerType[t];
              const isActive = destActiveType === t;
              return (
                <button
                  key={t}
                  onClick={() => setDestActiveType(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-2 ${
                    isActive
                      ? "bg-amber-400/10 border-amber-400/50 text-amber-400"
                      : "border-neutral-800 text-neutral-400 hover:border-neutral-600"
                  }`}
                >
                  {TYPE_LABELS[t]}
                  <span className="text-[0.55rem] bg-neutral-800 rounded px-1.5 py-0.5 text-neutral-300 font-mono">
                    {stat.columns.length}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Toolbar */}
          <div className="zto-card p-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="min-w-[200px]">
                <label className="zto-label">نطاق التطبيق</label>
                <div className="zto-select-wrap">
                  <select
                    className="zto-input text-xs"
                    value={destActiveBrandId ?? ""}
                    onChange={(e) =>
                      setDestActiveBrandId(e.target.value ? e.target.value : null)
                    }
                  >
                    <option value="">افتراضي · لكل العلامات</option>
                    {destBrands.map((b) => {
                      const hasOverride = !!parent.byBrand?.[b.id];
                      return (
                        <option key={b.id} value={b.id}>
                          {b.name} {hasOverride ? "•" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <p className="text-[0.6rem] text-neutral-500 mt-1 leading-snug">
                  {destActiveBrandId
                    ? overrideExists
                      ? `يحرّر قاعدة خاصّة بعلامة «${overridingBrand?.name ?? ""}» تُطبّق فقط على سجلاتها.`
                      : `لا يوجد تخصيص لعلامة «${overridingBrand?.name ?? ""}» — أيّ تعديل هنا ينشئ قاعدة جديدة.`
                    : `القاعدة الافتراضية · تنطبق على كل العلامات التي ليس لها تخصيص. عدد التخصيصات الحالية: ${overrideCount}.`}
                </p>
              </div>
              <div className="flex-1 min-w-[260px]">
                <label className="zto-label">جدول الوجهة لـ {TYPE_LABELS[destActiveType]}</label>
                <div className="zto-select-wrap">
                  <select
                    className="zto-input text-xs"
                    value={m.tableName}
                    disabled={user?.role !== "admin"}
                    onChange={(e) => setActiveTableName(e.target.value)}
                  >
                    <option value="">— اختر الجدول —</option>
                    {destTables.map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name} ({t.fieldCount} عمود)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {destActiveBrandId && overrideExists && user?.role === "admin" && (
                <button
                  onClick={() => removeBrandOverride(destActiveBrandId)}
                  className="zto-btn zto-btn-outline zto-btn-sm self-end text-red-400"
                  title="حذف هذا التخصيص — العلامة ستعود للقاعدة الافتراضية"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  حذف التخصيص
                </button>
              )}
              <button
                onClick={refreshDestinationColumns}
                disabled={destRefreshing}
                className="zto-btn zto-btn-outline zto-btn-sm self-end"
              >
                {destRefreshing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                تحديث
              </button>
              <button
                onClick={testDestinationMapping}
                disabled={destTesting || m.columns.length === 0 || !m.tableName}
                className="zto-btn zto-btn-outline zto-btn-sm self-end"
              >
                {destTesting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                اختبار على آخر سجل
              </button>
              {user?.role === "admin" && (
                <button
                  onClick={saveDestinationMapping}
                  disabled={destSaving || !destDirty}
                  className="zto-btn zto-btn-gold zto-btn-sm self-end"
                >
                  {destSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  حفظ المخطّط
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap text-[0.65rem] text-neutral-500">
              <span>
                {tableColumns.length} عمود في الجدول · {m.columns.length} عمود مُعرَّف
              </span>
              {mappedMissing.length > 0 && (
                <span className="zto-badge border border-red-500/40 text-red-400">
                  ⚠ {mappedMissing.length} عمود غير موجود في الجدول
                </span>
              )}
            </div>
          </div>

          {/* Mapping table */}
          {destLoading ? (
            <div className="zto-card p-12 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
            </div>
          ) : !m.tableName ? (
            <div className="zto-card p-10 text-center text-sm text-neutral-500">
              اختر جدول الوجهة لـ {TYPE_LABELS[destActiveType]} لبدء التوزيع.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Mapping editor (2/3) */}
              <div className="lg:col-span-2 zto-card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-neutral-800 text-[0.65rem] text-neutral-500 font-bold uppercase tracking-wider">
                      <th className="text-right px-4 py-3 w-[34%]">عمود الوجهة</th>
                      <th className="text-right px-4 py-3 w-[22%]">المصدر</th>
                      <th className="text-right px-4 py-3 w-[34%]">القيمة</th>
                      <th className="text-left px-4 py-3 w-[10%]">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.columns.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-neutral-500 text-sm">
                          لا يوجد مخطّط — اضغط "إضافة عمود" أدناه للبدء
                        </td>
                      </tr>
                    )}
                    {m.columns.map((row, idx) => {
                      const isReadonly = user?.role !== "admin";
                      const trimmed = row.column.trim();
                      const missing = !!trimmed && !knownColumnNames.has(trimmed);
                      // Resolve the matching Airtable column (if any)
                      // so we can show its type as a badge next to the
                      // name field — saves the admin from squinting at
                      // the side panel to figure out what the column
                      // expects.
                      const matchedCol = trimmed
                        ? tableColumns.find((c) => c.name === trimmed)
                        : null;
                      const matchedMeta = matchedCol ? getFieldTypeMeta(matchedCol.type) : null;
                      const matchedIsComputed = matchedCol
                        ? COMPUTED_TYPES.has(matchedCol.type)
                        : false;
                      return (
                        <tr key={idx} className={`border-b border-neutral-800/50 last:border-0 ${missing ? "bg-red-500/5" : ""}`}>
                          <td className="px-4 py-2.5 align-top">
                            <input
                              list={`zto-dest-cols-${idx}`}
                              type="text"
                              className={`zto-input text-xs ${missing ? "border-red-500/50" : ""}`}
                              placeholder="مثال: Original Post"
                              value={row.column}
                              disabled={isReadonly}
                              onChange={(e) => updateMappingRow(idx, { column: e.target.value })}
                            />
                            <datalist id={`zto-dest-cols-${idx}`}>
                              {tableColumns.map((c) => (
                                <option key={c.id} value={c.name}>
                                  {c.type}
                                </option>
                              ))}
                            </datalist>
                            {matchedMeta && (
                              <span
                                className={`mt-1.5 inline-flex items-center gap-1 text-[0.6rem] font-bold rounded-full px-2 py-0.5 border ${matchedMeta.tone}`}
                              >
                                <matchedMeta.Icon className="w-2.5 h-2.5" />
                                {matchedMeta.label}
                                <span className="text-neutral-600 font-mono mr-1">·</span>
                                <span className="text-neutral-500 font-mono">{matchedCol!.type}</span>
                              </span>
                            )}
                            {matchedIsComputed && (
                              <p className="text-[0.6rem] text-amber-400 mt-1 flex items-center gap-1">
                                <Info className="w-3 h-3" />
                                هذا العمود محسوب في Airtable — لن يقبل الكتابة من API
                              </p>
                            )}
                            {missing && (
                              <p className="text-[0.6rem] text-red-400 mt-1 flex items-center gap-1">
                                <XCircle className="w-3 h-3" />
                                لا يوجد عمود بهذا الاسم في «{m.tableName}»
                              </p>
                            )}
                          </td>

                          <td className="px-4 py-2.5 align-top">
                            <div className="zto-select-wrap">
                              <select
                                className="zto-input text-xs"
                                value={row.entry.type}
                                disabled={isReadonly}
                                onChange={(e) => {
                                  const t = e.target.value as "field" | "literal";
                                  if (t === "field") {
                                    updateMappingRow(idx, {
                                      entry: { type: "field", field: destTokens[0] ?? "title" },
                                    });
                                  } else {
                                    updateMappingRow(idx, {
                                      entry: { type: "literal", value: "" },
                                    });
                                  }
                                }}
                              >
                                <option value="field">حقل من المقال</option>
                                <option value="literal">قيمة ثابتة</option>
                              </select>
                            </div>
                          </td>

                          <td className="px-4 py-2.5 align-top">
                            {row.entry.type === "literal" ? (
                              <input
                                type="text"
                                className="zto-input text-xs"
                                value={row.entry.value}
                                disabled={isReadonly}
                                placeholder="مثال: New"
                                onChange={(e) =>
                                  updateMappingRow(idx, {
                                    entry: { type: "literal", value: e.target.value },
                                  })
                                }
                              />
                            ) : (
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <p className="text-[0.6rem] text-neutral-500 mb-1">الحقل</p>
                                  <div className="zto-select-wrap">
                                    <select
                                      className="zto-input text-xs"
                                      value={row.entry.field}
                                      disabled={isReadonly}
                                      onChange={(e) =>
                                        updateMappingRow(idx, {
                                          entry: {
                                            type: "field",
                                            field: e.target.value,
                                            fallback: row.entry.type === "field" ? row.entry.fallback : undefined,
                                          },
                                        })
                                      }
                                    >
                                      {/* Show the human-readable Arabic
                                          label for each token (e.g.
                                          "العنوان" instead of "title").
                                          Falls back to the raw token when
                                          metadata is missing. */}
                                      {destTokens.map((tk) => {
                                        const meta = (destTokenMetaByType[destActiveType] ?? []).find((m2) => m2.token === tk);
                                        return (
                                          <option key={tk} value={tk}>
                                            {meta?.label ? `${meta.label}` : tk}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <p className="text-[0.6rem] text-neutral-500 mb-1">قيمة بديلة</p>
                                  <div className="zto-select-wrap">
                                    <select
                                      className="zto-input text-xs"
                                      value={row.entry.type === "field" ? row.entry.fallback ?? "" : ""}
                                      disabled={isReadonly}
                                      onChange={(e) =>
                                        updateMappingRow(idx, {
                                          entry: {
                                            type: "field",
                                            field: row.entry.type === "field" ? row.entry.field : "title",
                                            fallback: e.target.value || undefined,
                                          },
                                        })
                                      }
                                    >
                                      <option value="">— بدون —</option>
                                      {destTokens.map((tk) => {
                                        const meta = (destTokenMetaByType[destActiveType] ?? []).find((m2) => m2.token === tk);
                                        return (
                                          <option key={tk} value={tk}>
                                            {meta?.label ? `${meta.label}` : tk}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  </div>
                                </div>
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-2.5 align-top">
                            {!isReadonly && (
                              <button
                                onClick={() => removeMappingRow(idx)}
                                className="zto-btn zto-btn-ghost zto-btn-sm text-red-400"
                                title="حذف"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {user?.role === "admin" && (
                  <div className="border-t border-neutral-800 p-3">
                    <button
                      onClick={addMappingRow}
                      className="zto-btn zto-btn-outline zto-btn-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      إضافة عمود
                    </button>
                  </div>
                )}
              </div>

              {/* Side panels: real article fields + Airtable columns (1/3) */}
              <div className="space-y-4">
                <div className="zto-card p-3">
                  <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-purple-400" />
                    حقول المقال المتاحة لـ {TYPE_LABELS[destActiveType]}
                  </h4>
                  <p className="text-[0.6rem] text-neutral-500 mb-2">
                    {sampleArticle
                      ? `أمثلة من آخر مقال لـ "${sampleArticle.sourceName ?? "..."}". الحقول الباهتة لا يملؤها هذا النوع عادةً.`
                      : "(لا يوجد مقال بعد لعرض قيم فعلية)"}
                  </p>
                  <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
                    {(destTokenMetaByType[destActiveType] ?? destTokens.map((t): TokenMeta => ({ token: t, label: t, description: "", populated: true }))).map((meta) => {
                      const sample = sampleValueFor(meta.token);
                      return (
                        <div
                          key={meta.token}
                          className={`border-b border-neutral-800/50 last:border-0 pb-1.5 ${
                            meta.populated ? "" : "opacity-50"
                          }`}
                        >
                          <div className="flex items-baseline gap-2">
                            <code
                              className={`font-mono text-[0.7rem] shrink-0 ${
                                meta.populated ? "text-amber-400" : "text-neutral-500"
                              }`}
                            >
                              {meta.token}
                            </code>
                            <span className="text-[0.6rem] text-neutral-400">{meta.label}</span>
                            {!meta.populated && (
                              <span className="text-[0.55rem] text-neutral-600 font-bold">— عادةً فارغ</span>
                            )}
                          </div>
                          {meta.description && (
                            <p className="text-[0.6rem] text-neutral-500 leading-snug mt-0.5" dir="auto">
                              {meta.description}
                            </p>
                          )}
                          {sample && meta.populated && (
                            looksLikeImageUrl(sample) ? (
                              <div className="mt-1 flex items-center gap-2 bg-[#0d0d0d] border border-neutral-800 rounded px-1.5 py-1">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={sample}
                                  alt=""
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  className="w-8 h-8 rounded object-cover bg-neutral-900 border border-neutral-800 shrink-0"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = "none";
                                  }}
                                />
                                <span className="text-[0.6rem] text-neutral-400 truncate" dir="ltr">
                                  {sample}
                                </span>
                              </div>
                            ) : (
                              <p className="text-[0.6rem] text-neutral-300 mt-0.5 break-words line-clamp-1 bg-[#0d0d0d] border border-neutral-800 rounded px-1.5 py-0.5" dir="auto">
                                {sample}
                              </p>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="zto-card p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="text-xs font-bold text-white flex items-center gap-2 min-w-0">
                      <Database className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="truncate">أعمدة «{m.tableName}»</span>
                    </h4>
                    <span className="text-[0.6rem] text-neutral-500 font-mono tabular-nums shrink-0">
                      {tableColumns.length}
                    </span>
                  </div>
                  <p className="text-[0.6rem] text-neutral-500 mb-2 leading-snug">
                    اضغط أيّ عمود لنسخه إلى الحقل المُحدَّد، أو استخدمه مرجعاً للنوع المتوقّع.
                  </p>
                  <div className="space-y-1 max-h-[320px] overflow-y-auto">
                    {tableColumns.length === 0 ? (
                      <p className="text-[0.65rem] text-neutral-500">— لا توجد أعمدة —</p>
                    ) : (
                      tableColumns.map((c) => {
                        const meta = getFieldTypeMeta(c.type);
                        const Icon = meta.Icon;
                        const usedBy = m.columns.findIndex((r) => r.column.trim() === c.name);
                        const inUse = usedBy >= 0;
                        const isComputed = COMPUTED_TYPES.has(c.type);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              try {
                                navigator.clipboard.writeText(c.name);
                                addToast(`نُسخ «${c.name}»`, "info");
                              } catch {
                                // clipboard may be blocked — ignore
                              }
                            }}
                            className={`w-full text-right group flex items-start gap-2 px-2 py-1.5 rounded-md border transition-colors ${
                              inUse
                                ? "border-emerald-400/30 bg-emerald-400/[0.04]"
                                : "border-transparent hover:border-neutral-700 hover:bg-neutral-800/40"
                            }`}
                            title={isComputed ? "حقل محسوب — لا يقبل الكتابة عبر API" : `${c.type} — اضغط للنسخ`}
                          >
                            <span
                              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${meta.tone}`}
                            >
                              <Icon className="w-3 h-3" />
                            </span>
                            <span className="flex-1 min-w-0 text-right">
                              <span className="block text-[0.72rem] font-bold text-white truncate">
                                {c.name}
                              </span>
                              <span className="flex items-center gap-1 mt-0.5">
                                <span className={`text-[0.6rem] font-bold ${meta.tone.split(" ")[0]}`}>
                                  {meta.label}
                                </span>
                                <span className="text-[0.55rem] text-neutral-600 font-mono">·</span>
                                <span className="text-[0.55rem] text-neutral-600 font-mono truncate">{c.type}</span>
                                {isComputed && (
                                  <span className="text-[0.55rem] text-amber-300 font-bold mr-auto shrink-0">للقراءة فقط</span>
                                )}
                                {inUse && !isComputed && (
                                  <span className="text-[0.55rem] text-emerald-300 font-bold mr-auto shrink-0">
                                    مُستخدَم
                                  </span>
                                )}
                              </span>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Test result */}
          {destTestResult && (
            <div className="zto-card p-5 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Eye className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">معاينة آخر سجل</h3>
                {destTestResult.tableName && (
                  <span className="zto-badge border border-amber-500/30 text-amber-400">
                    {TYPE_LABELS[(destTestResult.sourceType as MappableType) ?? destActiveType]} → {destTestResult.tableName}
                  </span>
                )}
                {destTestResult.article && (
                  <span className="text-[0.65rem] text-neutral-500 truncate">
                    "{destTestResult.article.title?.slice(0, 80)}"
                  </span>
                )}
              </div>
              {destTestResult.note && (
                <p className="text-xs text-amber-400">{destTestResult.note}</p>
              )}
              {destTestResult.missingColumns && destTestResult.missingColumns.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                  <p className="text-xs font-bold text-red-400 mb-1">
                    ⚠ {destTestResult.missingColumns.length} عمود مفقود في الجدول
                  </p>
                  <p className="text-[0.65rem] text-red-300">
                    {destTestResult.missingColumns.join("، ")}
                  </p>
                </div>
              )}
              {Object.keys(destTestResult.preview).length > 0 ? (
                <div className="bg-[#1a1a1a] border border-neutral-800 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-neutral-800 text-[0.6rem] text-neutral-500 font-bold uppercase tracking-wider">
                        <th className="text-right px-3 py-2">عمود الوجهة</th>
                        <th className="text-right px-3 py-2">القيمة المُرسلة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(destTestResult.preview).map(([col, val]) => (
                        <tr key={col} className="border-b border-neutral-800/50 last:border-0">
                          <td className="px-3 py-2 text-[0.7rem] font-bold text-amber-400">
                            {col}
                          </td>
                          <td className="px-3 py-2 text-[0.7rem] text-neutral-300 break-words">
                            {val || <span className="text-neutral-600">— فارغ —</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                !destTestResult.note && (
                  <p className="text-xs text-neutral-500">لا توجد قيم لعرضها</p>
                )
              )}
            </div>
          )}
        </div>
        );
      })()}
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
                <h3 className="font-bold text-sm text-white">موقع</h3>
                <p className="text-[0.65rem] text-neutral-500">خلاصة أخبار الموقع</p>
              </div>
            </div>
            <p className="text-sm text-neutral-400">
              الصق رابط خلاصة الموقع. عادةً ينتهي الرابط بـ
              <code className="text-amber-400 mx-1 font-mono">/feed</code>
              أو
              <code className="text-amber-400 mx-1 font-mono">/rss.xml</code>.
            </p>
            <div className="bg-[#1a1a1a] border border-neutral-800 rounded-lg p-3 space-y-1">
              <code className="text-xs text-amber-400 block">https://example.com/feed</code>
              <code className="text-xs text-amber-400 block">https://example.com/rss.xml</code>
            </div>
            <p className="text-xs text-neutral-500">
              لإيجاد الرابط: ابحث عن أيقونة الخلاصة في الموقع، أو جرّب إضافة <code className="bg-neutral-800 px-1 rounded text-amber-400">/feed</code> في نهاية رابط الموقع. إن لم تجده، اطلبه من المسؤول التقني.
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
                            className="bg-[#0d0d0d] border border-neutral-800 rounded-lg p-3 flex items-start gap-3"
                          >
                            {item.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.imageUrl}
                                alt=""
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                className="w-10 h-10 rounded object-cover bg-neutral-900 border border-neutral-800 shrink-0"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : null}
                            <div className="flex-1 min-w-0">
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

              {/* Brand (optional) */}
              <div>
                <label className="zto-label flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-amber-400" />
                  العلامة التجارية (اختياري)
                </label>
                <div className="zto-select-wrap">
                  <select
                    className="zto-input"
                    value={formData.brandId}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, brandId: e.target.value }))
                    }
                  >
                    <option value="">— بدون —</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[0.65rem] text-neutral-500 mt-1">
                  اربط المصدر بعلامة معيّنة لتظهر في تحليلاتها وتقاريرها.
                </p>
              </div>

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

              {/* Filter agent — available for every source type (websites,
                  X, LinkedIn). Whether it actually runs at fetch time
                  depends on the topic (only 'news' triggers filtering);
                  switching topic doesn't lose the saved agent assignment. */}
              {(() => {
                const filteringActive = formData.topic === "news";
                return (
                <div className={`bg-[#1a1a1a] border rounded-xl p-4 space-y-3 ${filteringActive ? "border-neutral-800" : "border-neutral-800/60"}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <label className="zto-label flex items-center gap-2 mb-0">
                        <Bot className="w-4 h-4 text-purple-400" />
                        وكيل الفلترة
                      </label>
                      <p className="text-[0.65rem] text-neutral-500 mt-0.5">
                        الوكيل الذي يقرّر أيّ من العناصر يمر إلى الوجهة. متاح لكل أنواع المصادر (مواقع، X، LinkedIn).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleTestFilterAgent}
                      disabled={filterTestRunning}
                      className="zto-btn zto-btn-outline zto-btn-sm"
                    >
                      {filterTestRunning ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      اختبار
                    </button>
                  </div>
                  <div className="zto-select-wrap">
                    <select
                      className="zto-input text-xs"
                      value={formData.filterAgentId}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, filterAgentId: e.target.value }))
                      }
                    >
                      <option value="">— الافتراضي —</option>
                      {filterAgents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} · {a.modelName}
                          {!a.isActive ? " (غير مفعّل)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  {filterAgents.length === 0 && (
                    <p className="text-[0.65rem] text-amber-400">
                      لا توجد وكلاء فلترة بعد. أنشئ وكيلاً من قسم &quot;وكلاء الكتابة&quot;.
                    </p>
                  )}

                  {/* Topic-not-news hint — the agent is saved either way, but
                      filtering only kicks in when topic = "أخبار". */}
                  {!filteringActive && (
                    <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2.5">
                      <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-[0.65rem] text-amber-300 leading-relaxed">
                        الوكيل محفوظ، لكنّه لن يعمل تلقائياً ما لم يكن الموضوع
                        <span className="text-amber-400 font-bold mx-1">«أخبار»</span>
                        — حالياً الموضوع
                        <span className="text-amber-400 font-bold mx-1">
                          «{TOPICS.find((t) => t.value === formData.topic)?.label.split(" ")[0]}»
                        </span>
                        فالعناصر تُمرَّر دون فلترة. غيّر الموضوع لأخبار لتفعيل الفلترة الفورية.
                      </p>
                    </div>
                  )}

                  {/* Test result */}
                  {filterTestResult && (
                    <div className="space-y-2">
                      {filterTestResult.error && (
                        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                          <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          <p className="text-xs text-red-400">{filterTestResult.error}</p>
                        </div>
                      )}
                      {filterTestResult.note && !filterTestResult.error && (
                        <p className="text-xs text-amber-400">{filterTestResult.note}</p>
                      )}
                      {filterTestResult.spec && (
                        <p className="text-[0.65rem] text-neutral-400">
                          نموذج: <span className="text-purple-400 font-mono">{filterTestResult.spec.model}</span>
                          {" · "}
                          <span className="text-neutral-300">{filterTestResult.spec.agentName}</span>
                        </p>
                      )}
                      {filterTestResult.decisions.length > 0 && (
                        <div className="bg-[#0d0d0d] border border-neutral-800 rounded-lg max-h-48 overflow-y-auto divide-y divide-neutral-800">
                          {filterTestResult.decisions.map((d, i) => (
                            <div
                              key={i}
                              className={`flex items-start gap-2 px-3 py-2 text-[0.7rem] ${
                                d.passed ? "bg-emerald-500/5" : ""
                              }`}
                            >
                              {d.passed ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5 text-neutral-600 shrink-0 mt-0.5" />
                              )}
                              <span className={`flex-1 line-clamp-2 ${d.passed ? "text-emerald-300" : "text-neutral-400"}`}>
                                {d.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })()}

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
