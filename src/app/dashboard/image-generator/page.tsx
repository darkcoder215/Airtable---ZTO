"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Image as ImageIcon,
  Upload,
  Loader2,
  Sparkles,
  RotateCcw,
  Download,
  X,
  Wand2,
  AlertCircle,
  Eye,
  MessageCircle,
  Heart,
  Repeat2,
  Send,
  ThumbsUp,
  Trash2,
  Plus,
  Tag,
  Bookmark,
  Layers,
  Library,
  CheckCircle2,
  Globe,
  MoreHorizontal,
  Verified,
  BarChart3,
  Smile,
  Maximize2,
  ChevronDown,
} from "lucide-react";
import { useAppStore } from "@/store/app-store";
import PageGuide from "@/components/PageGuide";

/* ─────────────── Constants ─────────────── */

const ASPECTS = [
  { value: "1:1", label: "1:1 — مربّع" },
  { value: "16:9", label: "16:9 — أفقي" },
  { value: "4:5", label: "4:5 — رأسي (أنسب لـLinkedIn feed)" },
  { value: "9:16", label: "9:16 — رأسي طويل" },
] as const;

const SIZES = [
  { value: "1K", label: "1K — سريع" },
  { value: "2K", label: "2K — متوازن" },
  { value: "4K", label: "4K — أعلى جودة" },
] as const;

const SUGGESTED_TAGS = ["أخبار", "رؤى", "إعلانات", "عقارات", "وظائف", "اقتباسات", "إنجازات"];

const MAX_FILE_BYTES = 6 * 1024 * 1024;
const ACCEPT_MIME = "image/png,image/jpeg,image/webp,image/gif";

/* ─────────────── Types ─────────────── */

interface SavedLogo {
  id: string;
  name: string;
  dataUrl: string;
  instructions: string;
}
interface SavedTemplate {
  id: string;
  name: string;
  description: string;
  dataUrl: string;
  tags: string[];
  instructions: string;
  aspectRatio: string;
  imageSize: string;
}
interface HistoryTurn {
  role: "user" | "assistant";
  text?: string;
  imageUrl?: string;
}

type Tab = "generate" | "logos" | "templates";

/* ─────────────── Utilities ─────────────── */

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const v = reader.result;
      typeof v === "string" ? resolve(v) : reject(new Error("read failed"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

/* ─────────────── Page ─────────────── */

export default function ImageGeneratorPage() {
  const { user, addToast } = useAppStore();

  /* Tab routing */
  const [tab, setTab] = useState<Tab>("generate");

  /* Saved library */
  const [logos, setLogos] = useState<SavedLogo[]>([]);
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);

  /* Generator state */
  const [selectedLogoId, setSelectedLogoId] = useState<string>("");
  const [logoUploadDataUrl, setLogoUploadDataUrl] = useState<string | null>(null); // ad-hoc
  // Optional placement note tied to whatever logo is in play for this run.
  // Stacked on top of the saved logo's permanent instructions server-side.
  const [logoNote, setLogoNote] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [referenceUploadDataUrl, setReferenceUploadDataUrl] = useState<string | null>(null);
  const [postText, setPostText] = useState("");
  const [edits, setEdits] = useState("");
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");
  const [imageSize, setImageSize] = useState<string>("2K");
  const [tagFilter, setTagFilter] = useState<string>("");
  // Up to 2 extra images merged into the generation alongside the logo +
  // template. Each carries a free-form intent note (e.g. "place this
  // product in the foreground", "use as background mask").
  interface ExtraImg { dataUrl: string; note: string }
  const [extras, setExtras] = useState<ExtraImg[]>([]);
  const extrasInputRef = useRef<HTMLInputElement | null>(null);

  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [generatedHistory, setGeneratedHistory] = useState<HistoryTurn[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [refineText, setRefineText] = useState("");
  const [previewTab, setPreviewTab] = useState<"x" | "linkedin-feed" | "linkedin-company">("linkedin-feed");
  // Platform preview defaults to collapsed — it eats real estate when
  // there's nothing to show yet, and most generations finish without
  // the user ever needing it. Click the section header to expand.
  const [previewExpanded, setPreviewExpanded] = useState(false);
  // Result image fullscreen toggle — when an image exists, the user
  // can promote it from the inline 240px frame to a tall ~640px frame.
  const [resultExpanded, setResultExpanded] = useState(false);

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const refInputRef = useRef<HTMLInputElement | null>(null);

  /* Library forms */
  const [showLogoForm, setShowLogoForm] = useState(false);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [showAIBuilder, setShowAIBuilder] = useState(false);

  /* ─────────────── Loaders ─────────────── */

  const loadLibrary = async () => {
    setLibraryLoading(true);
    try {
      const res = await fetch("/api/image-assets", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "فشل التحميل");
      setLogos(d.logos ?? []);
      setTemplates(d.templates ?? []);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "فشل تحميل المكتبة", "error");
    } finally {
      setLibraryLoading(false);
    }
  };
  useEffect(() => {
    void loadLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─────────────── Derived ─────────────── */

  const selectedLogo = logos.find((l) => l.id === selectedLogoId) ?? null;
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

  // Effective logo data URL: an ad-hoc upload wins, otherwise saved.
  const effectiveLogoUrl =
    logoUploadDataUrl ?? selectedLogo?.dataUrl ?? null;
  const effectiveLogoName = selectedLogo?.name ?? (user?.name || "علامتك التجارية");

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const t of templates) for (const tag of t.tags) s.add(tag);
    return Array.from(s).sort();
  }, [templates]);
  const visibleTemplates = useMemo(() => {
    if (!tagFilter) return templates;
    return templates.filter((t) => t.tags.includes(tagFilter));
  }, [templates, tagFilter]);

  /* ─────────────── Generation ─────────────── */

  const buildBody = (
    overrides?: { history?: HistoryTurn[]; edits?: string }
  ): Record<string, unknown> => ({
    postText,
    edits: overrides?.edits ?? edits,
    logoId: selectedLogoId || undefined,
    logoDataUrl: logoUploadDataUrl ?? undefined,
    logoNote: logoNote.trim() || undefined,
    templateId: selectedTemplateId || undefined,
    referenceDataUrl: referenceUploadDataUrl ?? undefined,
    extras: extras.length > 0 ? extras : undefined,
    aspectRatio,
    imageSize,
    history: overrides?.history,
  });

  const callApi = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/image-generator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return { ok: res.ok, data };
  };

  const onGenerate = async () => {
    // Either a logo OR a template/reference is enough — the API enforces
    // the same rule, but we surface a clearer message client-side.
    const hasTemplate = !!selectedTemplateId || !!referenceUploadDataUrl;
    if (!effectiveLogoUrl && !hasTemplate) {
      addToast("اختر شعاراً أو قالباً قبل التوليد", "warning");
      return;
    }
    if (!postText.trim()) {
      addToast("أدخل نص المنشور", "warning");
      return;
    }
    setGenerating(true);
    setError(null);
    setGeneratedUrl(null);
    setGeneratedHistory([]);
    try {
      const { ok, data } = await callApi(buildBody());
      if (!ok) {
        setError(data.error ?? "فشل التوليد");
        addToast(data.error ?? "فشل التوليد", "error");
        return;
      }
      setGeneratedUrl(data.imageUrl);
      setGeneratedHistory([
        { role: "assistant", imageUrl: data.imageUrl, text: data.text },
      ]);
      addToast("تم توليد الصورة", "success");
    } catch {
      setError("خطأ في الشبكة");
    } finally {
      setGenerating(false);
    }
  };

  const onRefine = async () => {
    if (!generatedUrl) return;
    if (!refineText.trim()) {
      addToast("اكتب التعديلات المطلوبة", "warning");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const newHistory: HistoryTurn[] = [
        ...generatedHistory,
        { role: "user", text: refineText },
      ];
      const { ok, data } = await callApi(
        buildBody({ history: newHistory, edits: refineText })
      );
      if (!ok) {
        setError(data.error ?? "فشل التعديل");
        addToast(data.error ?? "فشل التعديل", "error");
        return;
      }
      setGeneratedHistory([
        ...newHistory,
        { role: "assistant", imageUrl: data.imageUrl, text: data.text },
      ]);
      setGeneratedUrl(data.imageUrl);
      setRefineText("");
      addToast("تم التحديث", "success");
    } catch {
      setError("خطأ في الشبكة");
    } finally {
      setGenerating(false);
    }
  };

  const reset = () => {
    setSelectedLogoId("");
    setLogoUploadDataUrl(null);
    setLogoNote("");
    setSelectedTemplateId("");
    setReferenceUploadDataUrl(null);
    setExtras([]);
    setPostText("");
    setEdits("");
    setRefineText("");
    setGeneratedUrl(null);
    setGeneratedHistory([]);
    setError(null);
  };

  const onDownload = () => {
    if (!generatedUrl) return;
    const a = document.createElement("a");
    a.href = generatedUrl;
    a.download = `zto-post-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const onUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      addToast("الشعار كبير جداً (الحد 6MB)", "error");
      e.target.value = "";
      return;
    }
    try {
      const url = await readAsDataUrl(file);
      setLogoUploadDataUrl(url);
      setSelectedLogoId(""); // ad-hoc upload overrides saved selection
    } catch {
      addToast("فشل قراءة الملف", "error");
    }
    e.target.value = "";
  };

  const onUploadReference = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      addToast("الصورة كبيرة جداً (الحد 6MB)", "error");
      e.target.value = "";
      return;
    }
    try {
      const url = await readAsDataUrl(file);
      setReferenceUploadDataUrl(url);
      setSelectedTemplateId("");
    } catch {
      addToast("فشل قراءة الملف", "error");
    }
    e.target.value = "";
  };

  const onAddExtra = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const room = 2 - extras.length;
    if (room <= 0) {
      addToast("الحد الأقصى صورتان مرافقتان", "warning");
      return;
    }
    const toAdd: ExtraImg[] = [];
    for (const f of files.slice(0, room)) {
      if (f.size > MAX_FILE_BYTES) {
        addToast(`"${f.name}" أكبر من 6MB`, "error");
        continue;
      }
      try {
        toAdd.push({ dataUrl: await readAsDataUrl(f), note: "" });
      } catch {
        addToast(`فشل قراءة "${f.name}"`, "error");
      }
    }
    if (toAdd.length) setExtras((cur) => [...cur, ...toAdd]);
  };
  const updateExtraNote = (i: number, note: string) => {
    setExtras((cur) =>
      cur.map((e, idx) => (idx === i ? { ...e, note: note.slice(0, 800) } : e))
    );
  };
  const removeExtra = (i: number) => {
    setExtras((cur) => cur.filter((_, idx) => idx !== i));
  };

  /* ─────────────── Render ─────────────── */

  return (
    <div className="space-y-6 zto-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2 tracking-tight">
            <Wand2 className="w-5 h-5 text-amber-400" />
            مولّد صور المنشورات
          </h2>
          <p className="text-neutral-400 text-[13px] font-bold mt-1">
            اختر شعاراً وقالباً محفوظَيْن، اكتب نص منشورك، واطلب الصورة بمظهر مهني فوري.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === "generate" && (
            <button onClick={reset} className="zto-btn zto-btn-ghost zto-btn-sm" title="إعادة تعيين">
              <RotateCcw className="w-3.5 h-3.5" />
              مسح
            </button>
          )}
        </div>
      </div>

      <PageGuide
        pageName="مولّد صور المنشورات"
        accent="purple"
        storageKey="image-generator"
        intro={
          <>
            ثلاث تبويبات:
            <span className="text-amber-300 mx-1 font-bold">توليد</span>
            (اصنع صورة الآن)،
            <span className="text-amber-300 mx-1 font-bold">الشعارات</span>
            (مكتبة شعارات قابلة لإعادة الاستخدام)،
            <span className="text-amber-300 mx-1 font-bold">القوالب</span>
            (تصاميم محفوظة بنسبة أبعاد وتعليمات جاهزة، يمكن بناؤها بالذكاء الاصطناعي من أمثلة قديمة).
          </>
        }
        tips={[
          { title: "ابدأ بالشعارات والقوالب", body: <>قبل توليد أيّ صورة، أضف شعاراً واحداً على الأقل وقالباً واحداً. الشعارات أساسية — الصورة لن تُولَّد بدون شعار. القوالب اختيارية لكنها تحوّل النتيجة من «جيدة» إلى «متّسقة بشكل احترافي».</> },
          { title: "بناء قالب بالذكاء الاصطناعي", body: <>في تبويب القوالب، اضغط <span className="text-purple-300 font-bold">«إنشاء بالذكاء الاصطناعي»</span>: ارفع صورتين أو أكثر من تصاميم مشابهة، يستخرج النظام «وصف القالب» الذي يمكنه إعادة إنتاج الأسلوب نفسه على نصوص جديدة. يمكنك أيضاً رفع ملف خط (.ttf/.otf) لإلزام النظام بأسلوب طباعي محدّد.</> },
          { title: "صور مرافقة", body: <>أثناء بناء القالب يمكنك إرفاق حتى صورتين إضافيّتين (شعار ثانٍ، صورة منتج، وجه شخصيّة) مع وصف قصير لمكان كل صورة في التصميم — وستدمج تلقائياً في كل توليد لاحق.</> },
          { title: "التوليد ثم التعديل", body: <>أدخل نص المنشور واضغط <span className="text-amber-300 font-bold">توليد</span>. إن لم تعجبك النتيجة، اكتب التعديل المطلوب في خانة «تعديلات» واضغط مجدداً — يحتفظ النظام بسياق المحادثة فيُعدّل الصورة بدل توليدها من الصفر.</> },
          { title: "الجودة والأبعاد", body: <>اختر النسبة المناسبة للقناة: <code className="text-amber-400 font-mono">1:1</code> للمنشور العام، <code className="text-amber-400 font-mono">4:5</code> لـLinkedIn feed، <code className="text-amber-400 font-mono">9:16</code> للقصص. ابدأ بـ2K (متوازن) ولا تستخدم 4K إلا عند الطباعة.</> },
        ]}
      />

      {/* Top tab bar */}
      <div className="flex items-center gap-1 p-1 bg-[#1a1a1a] border border-neutral-800 rounded-xl w-fit">
        <TabBtn active={tab === "generate"} onClick={() => setTab("generate")} icon={<Sparkles className="w-3.5 h-3.5" />} label="توليد" />
        <TabBtn active={tab === "logos"} onClick={() => setTab("logos")} icon={<Bookmark className="w-3.5 h-3.5" />} label={`الشعارات${logos.length ? ` (${logos.length})` : ""}`} />
        <TabBtn active={tab === "templates"} onClick={() => setTab("templates")} icon={<Layers className="w-3.5 h-3.5" />} label={`القوالب${templates.length ? ` (${templates.length})` : ""}`} />
      </div>

      {/* === GENERATE TAB === */}
      {tab === "generate" && (
        <div className="grid grid-cols-1 xl:grid-cols-[440px_1fr] gap-5">
          {/* Inputs column */}
          <div className="space-y-4 xl:max-h-[calc(100vh-260px)] xl:overflow-y-auto pr-1">
            {/* Step 1 — logo (optional when a template is in play) */}
            {(() => {
              const hasTemplate = !!selectedTemplateId || !!referenceUploadDataUrl;
              const logoRequired = !hasTemplate;
              const logoActive = !!effectiveLogoUrl;
              return (
                <section className={`zto-card zto-section transition-colors ${
                  logoActive ? "border-amber-400/30" : ""
                }`}>
                  <SectionHead
                    step={1}
                    icon={<Bookmark className="w-4 h-4 text-amber-400" />}
                    title="الشعار"
                    hint={
                      logoRequired
                        ? "مطلوب — لا يوجد قالب يحدّد العلامة"
                        : "اختياري — القالب الذي اخترته يحدّد العلامة"
                    }
                    statusOk={logoActive}
                  />
                  <LogoPicker
                    logos={logos}
                    selectedId={selectedLogoId}
                    uploadedDataUrl={logoUploadDataUrl}
                    onSelect={(id) => {
                      setSelectedLogoId(id);
                      setLogoUploadDataUrl(null);
                    }}
                    onClearUpload={() => setLogoUploadDataUrl(null)}
                    onUploadClick={() => logoInputRef.current?.click()}
                    emptyAction={() => setTab("logos")}
                  />
                  <input ref={logoInputRef} type="file" hidden accept={ACCEPT_MIME} onChange={onUploadLogo} />

                  {logoActive && (
                    <div className="mt-3">
                      <SubLabel className="flex items-center justify-between">
                        <span>ملاحظة عن الشعار (اختيارية)</span>
                        <span className="text-[0.55rem] text-neutral-600 font-normal font-mono">{logoNote.length}/1000</span>
                      </SubLabel>
                      <textarea
                        value={logoNote}
                        onChange={(e) => setLogoNote(e.target.value.slice(0, 1000))}
                        placeholder="مثال: ضع الشعار صغيراً في الزاوية اليمنى السفلى، خلفية شفّافة، بدون ظلّ..."
                        className="zto-input text-xs min-h-[60px]"
                      />
                    </div>
                  )}
                </section>
              );
            })()}

            {/* Step 2 — template */}
            <section className={`zto-card zto-section transition-colors ${
              (selectedTemplateId || referenceUploadDataUrl) ? "border-amber-400/30" : ""
            }`}>
              <SectionHead
                step={2}
                icon={<Layers className="w-4 h-4 text-purple-400" />}
                title="القالب"
                hint={
                  selectedTemplate
                    ? `مُفعَّل — ${selectedTemplate.name}`
                    : referenceUploadDataUrl
                      ? "مُفعَّل — صورة مرجعية مرفوعة"
                      : "اختياري — استخدم تصميماً محفوظاً كهويّة بصريّة"
                }
                statusOk={!!selectedTemplateId || !!referenceUploadDataUrl}
              />
              {allTags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  <button
                    onClick={() => setTagFilter("")}
                    className={`text-[0.65rem] rounded-full px-2 py-0.5 border transition-colors ${
                      !tagFilter ? "bg-amber-400/15 text-amber-400 border-amber-400/40" : "border-neutral-800 text-neutral-400 hover:border-neutral-600"
                    }`}
                  >
                    الكل
                  </button>
                  {allTags.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTagFilter(tagFilter === t ? "" : t)}
                      className={`text-[0.65rem] rounded-full px-2 py-0.5 border transition-colors ${
                        tagFilter === t ? "bg-amber-400/15 text-amber-400 border-amber-400/40" : "border-neutral-800 text-neutral-400 hover:border-neutral-600"
                      }`}
                    >
                      #{t}
                    </button>
                  ))}
                </div>
              )}
              <TemplatePicker
                templates={visibleTemplates}
                selectedId={selectedTemplateId}
                uploadedDataUrl={referenceUploadDataUrl}
                onSelect={(id) => {
                  setSelectedTemplateId(id);
                  setReferenceUploadDataUrl(null);
                  // Auto-apply suggested aspect/size
                  const tpl = templates.find((t) => t.id === id);
                  if (tpl) {
                    setAspectRatio(tpl.aspectRatio);
                    setImageSize(tpl.imageSize);
                  }
                }}
                onClearUpload={() => setReferenceUploadDataUrl(null)}
                onUploadClick={() => refInputRef.current?.click()}
                emptyAction={() => setTab("templates")}
              />
              <input ref={refInputRef} type="file" hidden accept={ACCEPT_MIME} onChange={onUploadReference} />
            </section>

            {/* Step 3 — extra images merged into the design */}
            <section className={`zto-card zto-section transition-colors ${
              extras.length > 0 ? "border-amber-400/30" : ""
            }`}>
              <SectionHead
                step={3}
                icon={<ImageIcon className="w-4 h-4 text-emerald-400" />}
                title="صور مرافقة"
                hint={
                  extras.length === 0
                    ? "اختياري — حتى صورتين مع وصف لمكان كلٍّ منهما"
                    : `${extras.length}/2 صورة مرافقة`
                }
                statusOk={extras.length > 0}
              />
              <p className="text-[0.65rem] text-neutral-500 leading-relaxed mb-2">
                ارفق صورة منتج، شخصية، أو خلفيّة تريد دمجها داخل التصميم. اشرح لكلّ صورة كيف تُستعمل (مكان، حجم، قصاصة).
              </p>
              <div className="space-y-2">
                {extras.map((ex, i) => (
                  <div
                    key={i}
                    className="bg-[#0d0d0d] border border-neutral-800 rounded-lg p-2 flex items-start gap-2"
                  >
                    <div className="relative w-16 h-16 rounded overflow-hidden border border-neutral-800 bg-[#1a1a1a] shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={ex.dataUrl} alt={`extra ${i + 1}`} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <textarea
                        className="zto-input text-xs min-h-[60px]"
                        placeholder="ماذا نفعل بهذه الصورة في التصميم؟"
                        value={ex.note}
                        onChange={(e) => updateExtraNote(i, e.target.value)}
                        maxLength={800}
                      />
                      <p className="text-[0.55rem] text-neutral-600 font-mono mt-0.5 text-left" dir="ltr">
                        {ex.note.length}/800
                      </p>
                    </div>
                    <button
                      onClick={() => removeExtra(i)}
                      className="text-neutral-500 hover:text-red-400 p-1 shrink-0"
                      title="حذف"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {extras.length < 2 && (
                  <button
                    onClick={() => extrasInputRef.current?.click()}
                    className="w-full py-3 rounded-lg border-2 border-dashed border-neutral-700 hover:border-emerald-400 hover:text-emerald-300 text-neutral-500 text-[0.7rem] font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {extras.length === 0 ? "إضافة صورة مرافقة" : "إضافة صورة ثانية"}
                  </button>
                )}
              </div>
              <input
                ref={extrasInputRef}
                type="file"
                accept={ACCEPT_MIME}
                hidden
                onChange={onAddExtra}
              />
            </section>

            {/* Step 4 — copy */}
            <section className={`zto-card zto-section transition-colors ${
              postText.trim() ? "border-amber-400/30" : ""
            }`}>
              <SectionHead
                step={4}
                icon={<MessageCircle className="w-4 h-4 text-blue-400" />}
                title="نص المنشور والتعديلات"
                hint="نص المنشور مطلوب — التعديلات اختيارية"
                statusOk={!!postText.trim()}
              />
              <SubLabel className="flex items-center justify-between">
                <span>نص المنشور *</span>
                <span className="text-[0.55rem] text-neutral-600 font-normal font-mono">{postText.length}/8000</span>
              </SubLabel>
              <textarea
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                placeholder="مثال: نحن متحمّسون لإطلاق منتجنا الجديد..."
                className="zto-input min-h-[110px]"
                maxLength={8000}
              />

              <SubLabel className="mt-3 flex items-center justify-between">
                <span>تخصيصات (اختياري)</span>
                <span className="text-[0.55rem] text-neutral-600 font-normal font-mono">{edits.length}/4000</span>
              </SubLabel>
              <textarea
                value={edits}
                onChange={(e) => setEdits(e.target.value)}
                placeholder="ألوان، خطوط عربية، خلفية متدرّجة، مكان الشعار..."
                className="zto-input min-h-[70px]"
                maxLength={4000}
              />
            </section>

            {/* Step 5 — format */}
            <section className="zto-card zto-section">
              <SectionHead
                step={5}
                icon={<Layers className="w-4 h-4 text-purple-400" />}
                title="التنسيق والجودة"
                hint={`${aspectRatio} · ${imageSize}`}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <SubLabel>نسبة الأبعاد</SubLabel>
                  <select
                    className="zto-input text-xs"
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                  >
                    {ASPECTS.map((a) => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <SubLabel>الجودة</SubLabel>
                  <select
                    className="zto-input text-xs"
                    value={imageSize}
                    onChange={(e) => setImageSize(e.target.value)}
                  >
                    {SIZES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {selectedTemplate && (
                <p className="text-[0.6rem] text-neutral-500 mt-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-amber-400" />
                  مُقترح القالب: {selectedTemplate.aspectRatio} · {selectedTemplate.imageSize}
                </p>
              )}
            </section>

            <button
              onClick={onGenerate}
              disabled={
                generating ||
                (!effectiveLogoUrl && !selectedTemplateId && !referenceUploadDataUrl) ||
                !postText.trim()
              }
              className="zto-btn zto-btn-gold w-full !h-12 text-sm"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generatedUrl ? "إعادة التوليد" : "توليد الصورة"}
            </button>

            {error && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}
          </div>

          {/* Output column */}
          <div className="space-y-4">
            {/* Result — compact frame by default. The user can expand
                to a tall preview, and the platform preview below is
                collapsed until they want to inspect a feed mockup. */}
            <section className="zto-card zto-section">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">النتيجة</h3>
                  {generatedHistory.length > 1 && (
                    <span className="text-[0.6rem] text-neutral-500 font-mono">
                      نسخة {generatedHistory.filter((t) => t.role === "assistant").length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {generatedUrl && (
                    <>
                      <button
                        onClick={() => setResultExpanded((v) => !v)}
                        className="zto-btn zto-btn-ghost zto-btn-sm"
                        title={resultExpanded ? "تصغير العرض" : "توسيع العرض"}
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        {resultExpanded ? "تصغير" : "توسيع"}
                      </button>
                      <button onClick={onDownload} className="zto-btn zto-btn-ghost zto-btn-sm text-amber-400">
                        <Download className="w-3.5 h-3.5" />
                        تنزيل
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div
                className={`relative bg-[#0d0d0d] border border-neutral-800 rounded-xl overflow-hidden flex items-center justify-center transition-all duration-200 ${
                  resultExpanded ? "max-h-[640px]" : "max-h-[260px]"
                } ${generatedUrl ? "" : "min-h-[180px]"}`}
              >
                {generating && !generatedUrl && <GeneratingState />}
                {!generating && !generatedUrl && (
                  <div className="text-center py-8">
                    <ImageIcon className="w-8 h-8 text-neutral-700 mx-auto" />
                    <p className="text-[0.7rem] text-neutral-500 mt-2 font-bold">سيظهر التوليد هنا</p>
                  </div>
                )}
                {generatedUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={generatedUrl}
                    alt="generated"
                    className={`block ${resultExpanded ? "max-h-[640px] w-auto h-auto" : "max-h-[260px] w-auto h-auto"}`}
                  />
                )}
                {generating && generatedUrl && (
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                  </div>
                )}
              </div>
              {generatedUrl && (
                <div className="mt-3 space-y-2">
                  <SubLabel>تحسينات إضافية</SubLabel>
                  <div className="flex items-stretch gap-2">
                    <textarea
                      value={refineText}
                      onChange={(e) => setRefineText(e.target.value)}
                      placeholder="مثال: اجعل الخلفية أغمق وأبرز الشعار في الزاوية اليمنى..."
                      className="zto-input flex-1 min-h-[60px]"
                      maxLength={4000}
                    />
                    <button
                      onClick={onRefine}
                      disabled={generating || !refineText.trim()}
                      className="zto-btn zto-btn-gold self-start"
                    >
                      {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      تحديث
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Realistic preview — collapsed by default. Header alone is
                a button toggle; expanded body holds the platform tabs +
                surface mockup. Saves a chunk of vertical space when the
                admin only needs the raw image. */}
            <section className="zto-card overflow-hidden">
              <button
                type="button"
                onClick={() => setPreviewExpanded((v) => !v)}
                className="w-full flex items-center gap-2 px-5 py-4 text-right hover:bg-white/[0.02] transition-colors"
                aria-expanded={previewExpanded}
              >
                <Eye className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">معاينة على المنصّات</h3>
                <p className="text-[0.6rem] text-neutral-500 font-bold mr-auto truncate">
                  {previewExpanded ? "اضغط لإخفاء المعاينة" : "اضغط لرؤية كيف يظهر المنشور على X و LinkedIn"}
                </p>
                <ChevronDown
                  className={`w-4 h-4 text-neutral-500 shrink-0 transition-transform ${
                    previewExpanded ? "rotate-180" : ""
                  }`}
                />
              </button>
              {previewExpanded && (
                <div className="border-t border-neutral-800 p-5 space-y-3 zto-fade-in">
                  <div className="flex bg-[#1a1a1a] border border-neutral-800 rounded-lg p-0.5 w-fit">
                    {([
                      ["x", "X"],
                      ["linkedin-feed", "LinkedIn Feed"],
                      ["linkedin-company", "LinkedIn Company"],
                    ] as const).map(([k, l]) => (
                      <button
                        key={k}
                        onClick={() => setPreviewTab(k)}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                          previewTab === k ? "bg-white text-black" : "text-neutral-500 hover:text-neutral-300"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <PreviewSurface
                    tab={previewTab}
                    logoUrl={effectiveLogoUrl}
                    brandName={effectiveLogoName}
                    postText={postText}
                    generatedUrl={generatedUrl}
                  />
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* === LOGOS LIBRARY === */}
      {tab === "logos" && (
        <LogosLibrary
          logos={logos}
          loading={libraryLoading}
          isAdmin={user?.role === "admin"}
          onCreate={async (payload) => {
            const res = await fetch("/api/image-assets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "create-logo", ...payload }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || "فشل الحفظ");
            await loadLibrary();
          }}
          onDelete={async (id) => {
            const res = await fetch("/api/image-assets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "delete-logo", id }),
            });
            if (!res.ok) {
              const d = await res.json();
              addToast(d.error || "فشل الحذف", "error");
              return;
            }
            await loadLibrary();
          }}
          showForm={showLogoForm}
          setShowForm={setShowLogoForm}
        />
      )}

      {/* === TEMPLATES LIBRARY === */}
      {tab === "templates" && (
        <TemplatesLibrary
          templates={templates}
          loading={libraryLoading}
          isAdmin={user?.role === "admin"}
          onCreate={async (payload) => {
            const res = await fetch("/api/image-assets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "create-template", ...payload }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || "فشل الحفظ");
            await loadLibrary();
          }}
          onDelete={async (id) => {
            const res = await fetch("/api/image-assets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "delete-template", id }),
            });
            if (!res.ok) {
              const d = await res.json();
              addToast(d.error || "فشل الحذف", "error");
              return;
            }
            await loadLibrary();
          }}
          showForm={showTemplateForm}
          setShowForm={setShowTemplateForm}
          showAIBuilder={showAIBuilder}
          setShowAIBuilder={setShowAIBuilder}
        />
      )}
    </div>
  );
}

/* ─────────────── Reusable bits ─────────────── */

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
        active ? "bg-white text-black shadow" : "text-neutral-400 hover:text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function SectionHead({
  step,
  icon,
  title,
  hint,
  statusOk,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  // Subtle right-aligned subtitle in the header — used to surface the
  // selection state ("Optional", "Active — <name>", etc.) without bloating
  // the section body.
  hint?: string;
  // When provided, swap the step badge for a checkmark.
  statusOk?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-neutral-800">
      <span
        className={`w-6 h-6 rounded-full border flex items-center justify-center text-[0.65rem] font-black transition-colors ${
          statusOk
            ? "bg-emerald-400/15 border-emerald-400/40 text-emerald-300"
            : "bg-gradient-to-br from-amber-400/30 to-amber-400/10 border-amber-400/30 text-amber-400"
        }`}
      >
        {statusOk ? <CheckCircle2 className="w-3.5 h-3.5" /> : step}
      </span>
      {icon}
      <h3 className="text-sm font-bold text-white">{title}</h3>
      {hint && (
        <span className="text-[0.6rem] text-neutral-500 mr-auto truncate max-w-[55%]" title={hint}>
          {hint}
        </span>
      )}
    </div>
  );
}

function SubLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-[0.65rem] font-bold text-neutral-400 mb-1.5 ${className}`}>{children}</p>;
}

function LogoPicker({
  logos,
  selectedId,
  uploadedDataUrl,
  onSelect,
  onClearUpload,
  onUploadClick,
  emptyAction,
}: {
  logos: SavedLogo[];
  selectedId: string;
  uploadedDataUrl: string | null;
  onSelect: (id: string) => void;
  onClearUpload: () => void;
  onUploadClick: () => void;
  emptyAction: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2">
        {logos.map((l) => {
          const active = selectedId === l.id && !uploadedDataUrl;
          return (
            <button
              key={l.id}
              onClick={() => onSelect(l.id)}
              className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                active ? "border-amber-400 ring-2 ring-amber-400/30" : "border-neutral-800 hover:border-neutral-600"
              }`}
              title={l.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.dataUrl} alt={l.name} className="w-full h-full object-cover bg-[#1a1a1a]" />
              {active && (
                <div className="absolute top-1 right-1 bg-amber-400 rounded-full p-0.5">
                  <CheckCircle2 className="w-3 h-3 text-black" />
                </div>
              )}
            </button>
          );
        })}
        <button
          onClick={onUploadClick}
          className={`relative aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors ${
            uploadedDataUrl
              ? "border-amber-400 bg-amber-400/5"
              : "border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300"
          }`}
        >
          {uploadedDataUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={uploadedDataUrl} alt="upload" className="absolute inset-0 w-full h-full object-cover rounded-lg" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClearUpload();
                }}
                className="absolute top-1 right-1 bg-black/60 rounded p-0.5 text-white hover:bg-black z-10"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              <span className="text-[0.55rem] font-bold">رفع</span>
            </>
          )}
        </button>
      </div>
      {logos.length === 0 && !uploadedDataUrl && (
        <button
          onClick={emptyAction}
          className="w-full text-[0.65rem] text-neutral-500 hover:text-amber-400 transition-colors py-2"
        >
          لا شعارات محفوظة بعد — أضف واحداً من مكتبة الشعارات ↗
        </button>
      )}
    </div>
  );
}

function TemplatePicker({
  templates,
  selectedId,
  uploadedDataUrl,
  onSelect,
  onClearUpload,
  onUploadClick,
  emptyAction,
}: {
  templates: SavedTemplate[];
  selectedId: string;
  uploadedDataUrl: string | null;
  onSelect: (id: string) => void;
  onClearUpload: () => void;
  onUploadClick: () => void;
  emptyAction: () => void;
}) {
  return (
    <div className="space-y-2">
      {templates.length === 0 && !uploadedDataUrl ? (
        <button
          onClick={emptyAction}
          className="w-full text-[0.65rem] text-neutral-500 hover:text-amber-400 transition-colors py-2"
        >
          لا قوالب محفوظة بعد — أضف قالباً مع وسوم مثل #أخبار من مكتبة القوالب ↗
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {templates.map((t) => {
            const active = selectedId === t.id && !uploadedDataUrl;
            return (
              <button
                key={t.id}
                onClick={() => onSelect(t.id)}
                className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all text-right ${
                  active ? "border-amber-400 ring-2 ring-amber-400/30" : "border-neutral-800 hover:border-neutral-600"
                }`}
                title={t.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.dataUrl} alt={t.name} className="w-full h-full object-cover bg-[#1a1a1a]" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-1.5">
                  <p className="text-[0.6rem] font-bold text-white truncate">{t.name}</p>
                  {t.tags.length > 0 && (
                    <p className="text-[0.55rem] text-amber-300 truncate">
                      {t.tags.slice(0, 3).map((tg) => `#${tg}`).join(" ")}
                    </p>
                  )}
                </div>
                {active && (
                  <div className="absolute top-1 right-1 bg-amber-400 rounded-full p-0.5">
                    <CheckCircle2 className="w-3 h-3 text-black" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
      {/* Inline ad-hoc upload — small */}
      {uploadedDataUrl ? (
        <div className="relative aspect-video rounded-lg overflow-hidden border-2 border-amber-400/50 bg-amber-400/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={uploadedDataUrl} alt="reference" className="w-full h-full object-cover" />
          <button
            onClick={onClearUpload}
            className="absolute top-1 right-1 bg-black/60 rounded p-0.5 text-white hover:bg-black"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={onUploadClick}
          className="w-full text-[0.65rem] text-neutral-500 hover:text-neutral-300 border border-dashed border-neutral-700 rounded-lg py-2 flex items-center justify-center gap-1.5 transition-colors"
        >
          <Upload className="w-3 h-3" />
          أو ارفع صورة مرجعية لمرة واحدة
        </button>
      )}
    </div>
  );
}

function GeneratingState() {
  return (
    <div className="text-center py-12 px-6">
      <div className="relative inline-block mb-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400/30 to-purple-500/30 border border-amber-400/30 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-amber-400 animate-pulse" />
        </div>
      </div>
      <p className="text-sm font-bold text-white">جارٍ التوليد...</p>
      <p className="text-[0.65rem] text-neutral-500 mt-1">قد يستغرق هذا حتى دقيقتين</p>
    </div>
  );
}

/* ─────────────── Realistic preview surfaces ─────────────── */

function PreviewSurface({
  tab,
  logoUrl,
  brandName,
  postText,
  generatedUrl,
}: {
  tab: "x" | "linkedin-feed" | "linkedin-company";
  logoUrl: string | null;
  brandName: string;
  postText: string;
  generatedUrl: string | null;
}) {
  return (
    <div className={`rounded-2xl p-4 overflow-x-auto ${tab === "x" ? "bg-black" : "bg-[#f3f2ef]"}`} dir="ltr">
      <div className="mx-auto max-w-[560px]">
        {tab === "x" && <XPreview logoUrl={logoUrl} brandName={brandName} postText={postText} generatedUrl={generatedUrl} />}
        {tab === "linkedin-feed" && <LinkedInFeedPreview logoUrl={logoUrl} brandName={brandName} postText={postText} generatedUrl={generatedUrl} />}
        {tab === "linkedin-company" && <LinkedInCompanyPreview logoUrl={logoUrl} brandName={brandName} postText={postText} generatedUrl={generatedUrl} />}
      </div>
    </div>
  );
}

function Logo({ url, name, className = "" }: { url: string | null; name: string; className?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className={`w-full h-full object-cover ${className}`} />;
  }
  const initial = (name?.trim()[0] ?? "?").toUpperCase();
  return (
    <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-400 to-purple-500 text-white text-sm font-black ${className}`}>
      {initial}
    </div>
  );
}

function XPreview({ logoUrl, brandName, postText, generatedUrl }: { logoUrl: string | null; brandName: string; postText: string; generatedUrl: string | null }) {
  const handle = "@" + brandName.toLowerCase().replace(/\s+/g, "_").slice(0, 15);
  return (
    <article className="text-white">
      <div className="flex items-start gap-3 px-1">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-800 shrink-0">
          <Logo url={logoUrl} name={brandName} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-[15px]">
            <span className="font-bold truncate">{brandName}</span>
            <Verified className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-neutral-500 truncate">{handle}</span>
            <span className="text-neutral-500">·</span>
            <span className="text-neutral-500">2س</span>
            <button className="ml-auto text-neutral-500 hover:text-white">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[15px] mt-1 whitespace-pre-wrap leading-snug" dir="auto">
            {postText || "اكتب نص منشورك هنا..."}
          </p>
          {generatedUrl && (
            <div className="mt-3 rounded-2xl overflow-hidden border border-neutral-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={generatedUrl} alt="generated" className="w-full block" />
            </div>
          )}
          <div className="flex items-center justify-between mt-3 text-neutral-500 max-w-[440px]">
            <span className="flex items-center gap-1.5 text-[13px] hover:text-blue-400 cursor-pointer transition-colors">
              <MessageCircle className="w-[18px] h-[18px]" />
              {compactNumber(124)}
            </span>
            <span className="flex items-center gap-1.5 text-[13px] hover:text-emerald-400 cursor-pointer transition-colors">
              <Repeat2 className="w-[18px] h-[18px]" />
              {compactNumber(89)}
            </span>
            <span className="flex items-center gap-1.5 text-[13px] hover:text-pink-400 cursor-pointer transition-colors">
              <Heart className="w-[18px] h-[18px]" />
              {compactNumber(1247)}
            </span>
            <span className="flex items-center gap-1.5 text-[13px] hover:text-blue-400 cursor-pointer transition-colors">
              <BarChart3 className="w-[18px] h-[18px]" />
              {compactNumber(34_572)}
            </span>
            <span className="flex items-center gap-1.5 text-[13px] hover:text-blue-400 cursor-pointer transition-colors">
              <Bookmark className="w-[18px] h-[18px]" />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function LinkedInFeedPreview({ logoUrl, brandName, postText, generatedUrl }: { logoUrl: string | null; brandName: string; postText: string; generatedUrl: string | null }) {
  return (
    <article className="bg-white rounded-lg shadow-sm text-neutral-900 overflow-hidden">
      <header className="flex items-start gap-2.5 p-3">
        <div className="w-12 h-12 rounded-full overflow-hidden bg-neutral-200 shrink-0">
          <Logo url={logoUrl} name={brandName} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[14px] truncate">{brandName}</div>
          <div className="text-neutral-500 text-[12px]">12,847 متابعاً</div>
          <div className="text-neutral-500 text-[12px] flex items-center gap-1">
            2 س <span>·</span> <Globe className="w-3 h-3" />
          </div>
        </div>
        <button className="text-neutral-500"><MoreHorizontal className="w-5 h-5" /></button>
      </header>
      <p className="px-4 pb-3 text-[14px] whitespace-pre-wrap leading-relaxed" dir="auto">
        {postText || "اكتب نص منشورك هنا..."}
      </p>
      {generatedUrl && (
        <div className="border-y border-neutral-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={generatedUrl} alt="generated" className="w-full block" />
        </div>
      )}
      <div className="flex items-center justify-between px-3 py-2 text-neutral-500 text-[12px]">
        <span className="flex items-center gap-1">
          <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[8px] flex items-center justify-center">👍</span>
          <span className="w-4 h-4 -mr-1.5 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center">❤</span>
          <span className="ml-1">347</span>
        </span>
        <span>52 تعليقاً · 18 إعادة نشر</span>
      </div>
      <div className="grid grid-cols-4 border-t border-neutral-200 text-neutral-600 text-[13px] font-semibold">
        <button className="flex items-center justify-center gap-1.5 py-2.5 hover:bg-neutral-100 transition-colors">
          <ThumbsUp className="w-4 h-4" /> أعجبني
        </button>
        <button className="flex items-center justify-center gap-1.5 py-2.5 hover:bg-neutral-100 transition-colors">
          <MessageCircle className="w-4 h-4" /> تعليق
        </button>
        <button className="flex items-center justify-center gap-1.5 py-2.5 hover:bg-neutral-100 transition-colors">
          <Repeat2 className="w-4 h-4" /> إعادة نشر
        </button>
        <button className="flex items-center justify-center gap-1.5 py-2.5 hover:bg-neutral-100 transition-colors">
          <Send className="w-4 h-4" /> إرسال
        </button>
      </div>
    </article>
  );
}

function LinkedInCompanyPreview({ logoUrl, brandName, postText, generatedUrl }: { logoUrl: string | null; brandName: string; postText: string; generatedUrl: string | null }) {
  return (
    <article className="bg-white rounded-lg overflow-hidden text-neutral-900 shadow-sm">
      <div className="relative h-32 bg-gradient-to-br from-blue-100 via-indigo-100 to-purple-100 overflow-hidden">
        {generatedUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={generatedUrl} alt="cover" className="absolute inset-0 w-full h-full object-cover" />
        )}
      </div>
      <div className="px-5 pb-3 -mt-12">
        <div className="w-24 h-24 rounded-2xl bg-white border-4 border-white shadow-md overflow-hidden">
          <Logo url={logoUrl} name={brandName} />
        </div>
        <h3 className="mt-2 text-[20px] font-bold leading-tight">{brandName}</h3>
        <p className="text-[13px] text-neutral-700 leading-snug whitespace-pre-wrap line-clamp-3" dir="auto">
          {postText || "أضف تعريفاً موجزاً عن شركتك هنا — هذا هو ما يظهر تحت اسم الصفحة في LinkedIn."}
        </p>
        <div className="flex items-center gap-2 text-[12px] text-neutral-500 mt-2 flex-wrap">
          <span>تقنية المعلومات والخدمات</span>
          <span>·</span>
          <span>الرياض، السعودية</span>
          <span>·</span>
          <span className="text-blue-700 font-semibold cursor-pointer hover:underline">12,847 متابعاً</span>
          <span>·</span>
          <span>+10 تعمل هنا</span>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button className="px-4 py-1.5 bg-blue-700 text-white rounded-full text-[14px] font-semibold flex items-center gap-1.5 hover:bg-blue-800">
            <Plus className="w-4 h-4" /> متابعة
          </button>
          <button className="px-4 py-1.5 border border-blue-700 text-blue-700 rounded-full text-[14px] font-semibold hover:bg-blue-50">
            زيارة الموقع
          </button>
          <button className="px-4 py-1.5 border border-neutral-400 text-neutral-700 rounded-full text-[14px] font-semibold hover:bg-neutral-50 flex items-center gap-1.5">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* Mock tab strip */}
      <div className="flex items-center gap-2 px-5 border-b border-neutral-200 mt-3 text-[13px] text-neutral-600 font-semibold">
        {["الصفحة الرئيسية", "حول", "المنشورات", "الوظائف", "الأشخاص"].map((t, i) => (
          <span
            key={t}
            className={`px-3 py-2 ${i === 0 ? "text-blue-700 border-b-2 border-blue-700" : "hover:text-neutral-900 cursor-pointer"}`}
          >
            {t}
          </span>
        ))}
      </div>
    </article>
  );
}

/* ─────────────── Logos library tab ─────────────── */

function LogosLibrary({
  logos,
  loading,
  isAdmin,
  onCreate,
  onDelete,
  showForm,
  setShowForm,
}: {
  logos: SavedLogo[];
  loading: boolean;
  isAdmin: boolean;
  onCreate: (p: { name: string; dataUrl: string; instructions: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  showForm: boolean;
  setShowForm: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="zto-card zto-section">
        <SectionHead step={0} icon={<Bookmark className="w-4 h-4 text-amber-400" />} title="إرشادات لشعارات تعطي أفضل نتيجة" />
        <ul className="text-[0.7rem] text-neutral-400 space-y-1.5 list-disc pr-5">
          <li>استخدم ملف PNG بخلفية شفّافة كلما أمكن.</li>
          <li>الحجم الموصى به على الأقل 512×512 بكسل.</li>
          <li>اكتب في حقل التعليمات: ألوان العلامة، أسلوب الاستخدام، مكان الشعار المفضّل، ومسافة آمنة حوله.</li>
          <li>تجنّب الشعارات شديدة التفصيل — النموذج يميل لتبسيطها قليلاً.</li>
        </ul>
      </div>

      {isAdmin && (
        <div className="flex items-center justify-end">
          <button onClick={() => setShowForm(!showForm)} className="zto-btn zto-btn-gold zto-btn-sm">
            <Plus className="w-3.5 h-3.5" />
            {showForm ? "إلغاء" : "شعار جديد"}
          </button>
        </div>
      )}

      {showForm && isAdmin && (
        <NewLogoForm onSubmit={onCreate} onCancel={() => setShowForm(false)} />
      )}

      {loading ? (
        <div className="zto-card p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
        </div>
      ) : logos.length === 0 ? (
        <div className="zto-card p-12 text-center text-sm text-neutral-500">
          لا شعارات محفوظة بعد
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {logos.map((l) => (
            <div key={l.id} className="zto-card p-3 group">
              <div className="aspect-square bg-[#1a1a1a] rounded-lg overflow-hidden mb-2 border border-neutral-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.dataUrl} alt={l.name} className="w-full h-full object-contain" />
              </div>
              <p className="text-xs font-bold text-white truncate">{l.name}</p>
              {l.instructions && (
                <p className="text-[0.6rem] text-neutral-500 line-clamp-2 mt-1">{l.instructions}</p>
              )}
              {isAdmin && (
                <button
                  onClick={() => {
                    if (confirm(`حذف الشعار "${l.name}"؟`)) void onDelete(l.id);
                  }}
                  className="mt-2 text-[0.6rem] text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> حذف
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewLogoForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (p: { name: string; dataUrl: string; instructions: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const { addToast } = useAppStore();
  const [name, setName] = useState("");
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const inp = useRef<HTMLInputElement | null>(null);
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      addToast("الحجم > 6MB", "error");
      e.target.value = "";
      return;
    }
    setDataUrl(await readAsDataUrl(f));
    e.target.value = "";
  };
  const submit = async () => {
    if (!name.trim() || !dataUrl) {
      addToast("أدخل اسماً وارفع الشعار", "warning");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), dataUrl, instructions: instructions.trim() });
      onCancel();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "فشل", "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="zto-card zto-section space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4">
        <div>
          <SubLabel>الملف *</SubLabel>
          <input ref={inp} type="file" hidden accept={ACCEPT_MIME} onChange={onFile} />
          <button
            onClick={() => inp.current?.click()}
            className="aspect-square w-full bg-[#1a1a1a] rounded-xl border-2 border-dashed border-neutral-700 hover:border-amber-400 transition-colors flex items-center justify-center overflow-hidden"
          >
            {dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dataUrl} alt="logo" className="w-full h-full object-contain" />
            ) : (
              <Upload className="w-6 h-6 text-neutral-500" />
            )}
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <SubLabel>اسم الشعار *</SubLabel>
            <input
              type="text"
              className="zto-input text-xs"
              placeholder="مثال: شعار العلامة الأساسي"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <SubLabel>تعليمات (اختياري)</SubLabel>
            <textarea
              className="zto-input min-h-[100px] text-xs"
              placeholder="ألوان العلامة، مكان الشعار في التصميم (الزاوية اليمنى مثلاً)، المسافة الآمنة حوله، إلخ."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={4000}
            />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="zto-btn zto-btn-ghost zto-btn-sm">إلغاء</button>
        <button onClick={submit} disabled={saving} className="zto-btn zto-btn-gold zto-btn-sm">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bookmark className="w-3.5 h-3.5" />}
          حفظ الشعار
        </button>
      </div>
    </div>
  );
}

/* ─────────────── Templates library tab ─────────────── */

function TemplatesLibrary({
  templates,
  loading,
  isAdmin,
  onCreate,
  onDelete,
  showForm,
  setShowForm,
  showAIBuilder,
  setShowAIBuilder,
}: {
  templates: SavedTemplate[];
  loading: boolean;
  isAdmin: boolean;
  onCreate: (p: {
    name: string;
    description: string;
    dataUrl: string;
    tags: string[];
    instructions: string;
    aspectRatio: string;
    imageSize: string;
  }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  showAIBuilder: boolean;
  setShowAIBuilder: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="zto-card zto-section">
        <SectionHead step={0} icon={<Layers className="w-4 h-4 text-purple-400" />} title="القوالب الموسومة" />
        <p className="text-[0.7rem] text-neutral-400 leading-relaxed">
          ارفع قالب تصميم (مثل تصميم خبر استثماري أو إعلان عقاري) ووسمه بكلمة مثل
          <code className="text-amber-400 mx-1 font-mono">أخبار</code>
          أو
          <code className="text-amber-400 mx-1 font-mono">عقارات</code>.
          عند توليد صورة لاحقاً يمكن للمستخدم اختيار القالب فوراً وستُطبَّق نسبة أبعاده وتعليماته على الفور.
        </p>
        <p className="text-[0.7rem] text-purple-300 leading-relaxed mt-2">
          أو دع الذكاء الاصطناعي يبني لك القالب: ارفع صورتين أو أكثر من تصاميمك المعتادة وسنستخرج
          منها <span className="font-bold">وصف القالب</span> ثم نعرض معاينة فعلية قبل الحفظ.
        </p>
      </div>

      {isAdmin && (
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <button
            onClick={() => {
              setShowAIBuilder(!showAIBuilder);
              if (!showAIBuilder) setShowForm(false);
            }}
            className={`zto-btn zto-btn-sm ${
              showAIBuilder ? "zto-btn-ghost" : "zto-btn-outline border-purple-500/40 !text-purple-300"
            }`}
          >
            <Wand2 className="w-3.5 h-3.5" />
            {showAIBuilder ? "إلغاء البناء بالذكاء الاصطناعي" : "إنشاء بالذكاء الاصطناعي"}
          </button>
          <button
            onClick={() => {
              setShowForm(!showForm);
              if (!showForm) setShowAIBuilder(false);
            }}
            className="zto-btn zto-btn-gold zto-btn-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            {showForm ? "إلغاء" : "قالب جديد"}
          </button>
        </div>
      )}

      {showForm && isAdmin && (
        <NewTemplateForm onSubmit={onCreate} onCancel={() => setShowForm(false)} />
      )}

      {showAIBuilder && isAdmin && (
        <AITemplateWizard
          onSave={onCreate}
          onClose={() => setShowAIBuilder(false)}
        />
      )}

      {loading ? (
        <div className="zto-card p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
        </div>
      ) : templates.length === 0 ? (
        <div className="zto-card p-12 text-center text-sm text-neutral-500">
          لا قوالب بعد
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((t) => (
            <div key={t.id} className="zto-card overflow-hidden group">
              <div className="aspect-video bg-[#1a1a1a]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.dataUrl} alt={t.name} className="w-full h-full object-cover" />
              </div>
              <div className="p-3">
                <p className="text-sm font-bold text-white">{t.name}</p>
                {t.description && (
                  <p className="text-[0.65rem] text-neutral-400 mt-1 line-clamp-2">{t.description}</p>
                )}
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  {t.tags.map((tg) => (
                    <span key={tg} className="text-[0.6rem] text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-full px-2 py-0.5">
                      #{tg}
                    </span>
                  ))}
                  <span className="text-[0.55rem] text-neutral-500 mr-auto font-mono">
                    {t.aspectRatio} · {t.imageSize}
                  </span>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => {
                      if (confirm(`حذف القالب "${t.name}"؟`)) void onDelete(t.id);
                    }}
                    className="mt-2 text-[0.6rem] text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> حذف
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewTemplateForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (p: {
    name: string;
    description: string;
    dataUrl: string;
    tags: string[];
    instructions: string;
    aspectRatio: string;
    imageSize: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const { addToast } = useAppStore();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [instructions, setInstructions] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [imageSize, setImageSize] = useState("2K");
  const [saving, setSaving] = useState(false);
  const inp = useRef<HTMLInputElement | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      addToast("الحجم > 6MB", "error");
      e.target.value = "";
      return;
    }
    setDataUrl(await readAsDataUrl(f));
    e.target.value = "";
  };
  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^#/, "");
    if (!t) return;
    if (tags.length >= 10) return;
    if (tags.map((x) => x.toLowerCase()).includes(t.toLowerCase())) return;
    setTags([...tags, t]);
  };
  const submit = async () => {
    if (!name.trim() || !dataUrl) {
      addToast("الاسم والملف مطلوبان", "warning");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        dataUrl,
        tags,
        instructions: instructions.trim(),
        aspectRatio,
        imageSize,
      });
      onCancel();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "فشل", "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="zto-card zto-section space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4">
        <div>
          <SubLabel>صورة القالب *</SubLabel>
          <input ref={inp} type="file" hidden accept={ACCEPT_MIME} onChange={onFile} />
          <button
            onClick={() => inp.current?.click()}
            className="aspect-video w-full bg-[#1a1a1a] rounded-xl border-2 border-dashed border-neutral-700 hover:border-amber-400 transition-colors flex items-center justify-center overflow-hidden"
          >
            {dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dataUrl} alt="template" className="w-full h-full object-cover" />
            ) : (
              <Upload className="w-6 h-6 text-neutral-500" />
            )}
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <SubLabel>الاسم *</SubLabel>
            <input
              type="text"
              className="zto-input text-xs"
              placeholder="مثال: قالب خبر استثماري"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <SubLabel>وصف موجز (اختياري)</SubLabel>
            <input
              type="text"
              className="zto-input text-xs"
              placeholder="مثال: تصميم نشر خبر تمويل بشعار في الزاوية"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <SubLabel>الوسوم (اختر أو اكتب)</SubLabel>
            <div className="flex items-center flex-wrap gap-1.5 mb-2">
              {SUGGESTED_TAGS.map((t) => (
                <button
                  key={t}
                  onClick={() => addTag(t)}
                  className="text-[0.65rem] rounded-full px-2 py-0.5 border border-neutral-700 text-neutral-400 hover:border-amber-400 hover:text-amber-400 transition-colors"
                >
                  + {t}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Tag className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
                <input
                  type="text"
                  className="zto-input text-xs" style={{ paddingInlineStart: "2.5rem" }}
                  placeholder="اكتب وسماً واضغط Enter"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(tagInput);
                      setTagInput("");
                    }
                  }}
                />
              </div>
            </div>
            {tags.length > 0 && (
              <div className="flex items-center flex-wrap gap-1.5 mt-2">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="text-[0.65rem] rounded-full px-2 py-0.5 bg-amber-400/15 text-amber-400 border border-amber-400/40 flex items-center gap-1"
                  >
                    #{t}
                    <button onClick={() => setTags(tags.filter((x) => x !== t))}>
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <SubLabel>نسبة الأبعاد المُقترحة</SubLabel>
              <select
                className="zto-input text-xs"
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
              >
                {ASPECTS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div>
              <SubLabel>الجودة المُقترحة</SubLabel>
              <select
                className="zto-input text-xs"
                value={imageSize}
                onChange={(e) => setImageSize(e.target.value)}
              >
                {SIZES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <SubLabel>تعليمات الاستخدام (اختياري)</SubLabel>
            <textarea
              className="zto-input min-h-[80px] text-xs"
              placeholder="مثال: ضع الشعار في الزاوية اليمنى العليا، استخدم خط Noto Kufi، خلفية متدرجة من الذهبي إلى الأسود..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={4000}
            />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="zto-btn zto-btn-ghost zto-btn-sm">إلغاء</button>
        <button onClick={submit} disabled={saving} className="zto-btn zto-btn-gold zto-btn-sm">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
          حفظ القالب
        </button>
      </div>
    </div>
  );
}

/* ─────────────── AI template wizard ───────────────
   Walks the admin through: upload examples → analyze → preview →
   approve or revise → save. Every API call goes through
   /api/image-template-builder; on save we hand the resulting وصف +
   preview image back to the parent's onCreate which uses the existing
   create-template endpoint, so the storage path is unchanged. */

type WizardStep = "examples" | "wasf" | "preview" | "save";

function AITemplateWizard({
  onSave,
  onClose,
}: {
  onSave: (p: {
    name: string;
    description: string;
    dataUrl: string;
    tags: string[];
    instructions: string;
    aspectRatio: string;
    imageSize: string;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const { addToast } = useAppStore();

  const [step, setStep] = useState<WizardStep>("examples");
  const [examples, setExamples] = useState<string[]>([]);
  const [brandNotes, setBrandNotes] = useState("");

  const [analyzing, setAnalyzing] = useState(false);
  const [wasf, setWasf] = useState("");
  const [sampleText, setSampleText] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [imageSize, setImageSize] = useState("2K");

  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [editPrompt, setEditPrompt] = useState("");
  const [revising, setRevising] = useState(false);

  // Save form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const extrasInputRef = useRef<HTMLInputElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);

  // Up to 2 accompanying images with admin notes (e.g. "this logo goes top
  // right", "use this product photo as the focal point"). Sent to both
  // Opus (analyze/revise) and NanoBanana (preview) so the design ends up
  // with these images integrated in the right way.
  interface ExtraImg { dataUrl: string; note: string }
  const [extras, setExtras] = useState<ExtraImg[]>([]);

  // Optional font file. We don't ship the file itself to the model — that
  // wouldn't help, since neither Opus nor NanoBanana can install fonts.
  // Instead we render a sample (Arabic + Latin glyphs) using FontFace +
  // canvas, and forward that rendered image so Opus can describe the
  // typography precisely enough for NanoBanana to imitate.
  const [fontFamily, setFontFamily] = useState("");
  const [fontSampleUrl, setFontSampleUrl] = useState<string | null>(null);
  const [fontFileName, setFontFileName] = useState<string | null>(null);
  const [fontError, setFontError] = useState<string | null>(null);
  const [renderingFont, setRenderingFont] = useState(false);

  // History of revisions for transparency.
  const [revisions, setRevisions] = useState<
    { previewUrl: string; wasf: string; editPrompt?: string }[]
  >([]);

  const onAddExamples = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const toAdd: string[] = [];
    for (const f of files) {
      if (examples.length + toAdd.length >= 6) {
        addToast("الحد الأقصى 6 صور", "warning");
        break;
      }
      if (f.size > MAX_FILE_BYTES) {
        addToast(`"${f.name}" أكبر من 6MB`, "error");
        continue;
      }
      try {
        toAdd.push(await readAsDataUrl(f));
      } catch {
        addToast(`فشل قراءة "${f.name}"`, "error");
      }
    }
    if (toAdd.length) setExamples((cur) => [...cur, ...toAdd]);
  };

  const removeExample = (i: number) => {
    setExamples((cur) => cur.filter((_, idx) => idx !== i));
  };

  const onAddExtras = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const room = 2 - extras.length;
    if (room <= 0) {
      addToast("الحد الأقصى صورتان مرافقتان", "warning");
      return;
    }
    const toAdd: ExtraImg[] = [];
    for (const f of files.slice(0, room)) {
      if (f.size > MAX_FILE_BYTES) {
        addToast(`"${f.name}" أكبر من 6MB`, "error");
        continue;
      }
      try {
        toAdd.push({ dataUrl: await readAsDataUrl(f), note: "" });
      } catch {
        addToast(`فشل قراءة "${f.name}"`, "error");
      }
    }
    if (toAdd.length) setExtras((cur) => [...cur, ...toAdd]);
  };

  const updateExtraNote = (i: number, note: string) => {
    setExtras((cur) =>
      cur.map((e, idx) => (idx === i ? { ...e, note: note.slice(0, 600) } : e))
    );
  };

  const removeExtra = (i: number) => {
    setExtras((cur) => cur.filter((_, idx) => idx !== i));
  };

  // Render a sample of the uploaded font onto a canvas (Arabic + Latin
  // glyphs) and return a data URL. We deliberately do NOT ship the font
  // file itself to the model — neither Opus nor NanoBanana can install
  // fonts, so a rendered image is the only signal that's actually useful.
  const onLoadFont = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      addToast("ملف الخط أكبر من 6MB", "error");
      return;
    }
    setRenderingFont(true);
    setFontError(null);
    let face: FontFace | null = null;
    const familyId = `wizard-font-${Date.now()}`;
    try {
      const buf = await file.arrayBuffer();
      face = new FontFace(familyId, buf);
      await face.load();
      // Keep the loaded face attached so the canvas paints with it; we
      // detach when the wizard closes (best effort).
      (document as Document & { fonts: FontFaceSet }).fonts.add(face);

      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 360;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas غير مدعوم");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#0a0a0a";
      ctx.textBaseline = "top";

      ctx.font = `64px "${familyId}", system-ui, sans-serif`;
      ctx.direction = "rtl";
      ctx.textAlign = "right";
      ctx.fillText("نموذج خط: استثمارات الشركات الناشئة", canvas.width - 24, 24);

      ctx.font = `48px "${familyId}", system-ui, sans-serif`;
      ctx.direction = "ltr";
      ctx.textAlign = "left";
      ctx.fillText("The quick brown fox jumps", 24, 120);
      ctx.fillText("0123456789  AaBbGgQq  &@%", 24, 180);

      ctx.font = `32px "${familyId}", system-ui, sans-serif`;
      ctx.direction = "rtl";
      ctx.textAlign = "right";
      ctx.fillText("أبجد هوّز حطي كلمن سعفص قرشت", canvas.width - 24, 260);

      const url = canvas.toDataURL("image/png");
      setFontSampleUrl(url);
      setFontFileName(file.name);
      // Default the family name to the file's stem so the admin can edit
      // it; it's just a text label that travels in the prompt.
      if (!fontFamily.trim()) {
        const stem = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
        setFontFamily(stem);
      }
      addToast("تم تحميل الخط", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "فشل تحميل الخط";
      setFontError(msg);
      addToast(`فشل تحميل الخط: ${msg}`, "error");
      if (face) {
        try {
          (document as Document & { fonts: FontFaceSet }).fonts.delete(face);
        } catch {
          // swallow — cleanup best-effort
        }
      }
    } finally {
      setRenderingFont(false);
    }
  };

  const clearFont = () => {
    setFontSampleUrl(null);
    setFontFileName(null);
    setFontFamily("");
    setFontError(null);
  };

  // Build the {extras, font} payload reused by every action below.
  const aiPayload = (): { extras: ExtraImg[]; font: { sampleDataUrl?: string; family?: string } } => ({
    extras,
    font: {
      sampleDataUrl: fontSampleUrl ?? undefined,
      family: fontFamily.trim() || undefined,
    },
  });

  const callBuilder = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/image-template-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let data: Record<string, unknown> = {};
    try {
      data = await res.json();
    } catch {
      // server returned non-JSON — keep going so the caller can surface
      // a generic error message instead of crashing.
    }
    return { ok: res.ok, status: res.status, data };
  };

  const onAnalyze = async () => {
    if (examples.length < 2) {
      addToast("ارفع صورتين على الأقل", "warning");
      return;
    }
    setAnalyzing(true);
    try {
      const { ok, data } = await callBuilder({
        action: "analyze",
        examples,
        brandNotes: brandNotes.trim() || undefined,
        ...aiPayload(),
      });
      if (!ok) {
        const msg = (data.error as string) || "فشل التحليل";
        addToast(msg, "error");
        return;
      }
      const generatedWasf = (data.wasf as string) ?? "";
      if (!generatedWasf) {
        addToast("لم يُرجع النموذج وصفاً", "error");
        return;
      }
      setWasf(generatedWasf);
      setStep("wasf");
      addToast("تم استخراج وصف القالب", "success");
    } catch {
      addToast("خطأ في الشبكة", "error");
    } finally {
      setAnalyzing(false);
    }
  };

  const onPreview = async () => {
    if (!wasf.trim()) {
      addToast("وصف القالب فارغ", "warning");
      return;
    }
    if (!sampleText.trim()) {
      addToast("اكتب نص العيّنة لتجريب القالب", "warning");
      return;
    }
    setPreviewing(true);
    try {
      const { ok, data } = await callBuilder({
        action: "preview",
        wasf,
        sampleText,
        examples: examples.slice(0, 1), // first example as style anchor
        aspectRatio,
        imageSize,
        ...aiPayload(),
      });
      if (!ok) {
        const msg = (data.error as string) || "فشل توليد المعاينة";
        addToast(msg, "error");
        return;
      }
      const url = data.imageUrl as string | undefined;
      if (!url) {
        addToast("لم يُرجع النموذج صورة", "error");
        return;
      }
      setPreviewUrl(url);
      setRevisions((cur) => [...cur, { previewUrl: url, wasf }]);
      setStep("preview");
      addToast("تم توليد المعاينة", "success");
    } catch {
      addToast("خطأ في الشبكة", "error");
    } finally {
      setPreviewing(false);
    }
  };

  const onRevise = async () => {
    if (!previewUrl) {
      addToast("لا توجد معاينة لتعديلها", "warning");
      return;
    }
    if (!editPrompt.trim()) {
      addToast("اكتب طلب التعديل", "warning");
      return;
    }
    setRevising(true);
    try {
      const { ok, data } = await callBuilder({
        action: "revise",
        examples,
        previousWasf: wasf,
        previewImage: previewUrl,
        editPrompt,
        ...aiPayload(),
      });
      if (!ok) {
        const msg = (data.error as string) || "فشل تحديث الوصف";
        addToast(msg, "error");
        return;
      }
      const newWasf = (data.wasf as string) ?? "";
      if (!newWasf) {
        addToast("لم يُرجع النموذج وصفاً جديداً", "error");
        return;
      }
      setWasf(newWasf);
      setRevisions((cur) => {
        const last = cur[cur.length - 1];
        return [
          ...cur.slice(0, -1),
          last ? { ...last, editPrompt } : last,
        ].filter(Boolean) as typeof cur;
      });
      setEditPrompt("");
      addToast("تم تحديث الوصف — اضغط معاينة لتوليد نسخة جديدة", "success");
      setStep("wasf");
    } catch {
      addToast("خطأ في الشبكة", "error");
    } finally {
      setRevising(false);
    }
  };

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^#/, "");
    if (!t) return;
    if (tags.length >= 10) return;
    if (tags.map((x) => x.toLowerCase()).includes(t.toLowerCase())) return;
    setTags([...tags, t]);
  };

  const onApprove = () => {
    if (!previewUrl) {
      addToast("ولّد المعاينة أولاً", "warning");
      return;
    }
    setStep("save");
  };

  const onSubmitSave = async () => {
    if (!name.trim()) {
      addToast("اسم القالب مطلوب", "warning");
      return;
    }
    if (!previewUrl) {
      addToast("لا توجد صورة معاينة لحفظها", "warning");
      return;
    }
    if (!wasf.trim()) {
      addToast("وصف القالب فارغ", "warning");
      return;
    }
    setSaving(true);
    try {
      // Truncate to 4000 to fit the existing instructions column. We keep the
      // most informative top of the وصف.
      const truncatedWasf = wasf.length > 4000 ? wasf.slice(0, 4000) : wasf;
      await onSave({
        name: name.trim(),
        description: description.trim(),
        dataUrl: previewUrl,
        tags,
        instructions: truncatedWasf,
        aspectRatio,
        imageSize,
      });
      addToast("تم حفظ القالب", "success");
      onClose();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const StepBadge = ({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) => (
    <div className="flex items-center gap-1.5">
      <span
        className={`w-5 h-5 rounded-full flex items-center justify-center text-[0.6rem] font-black border ${
          done
            ? "bg-emerald-400/20 border-emerald-400/60 text-emerald-300"
            : active
            ? "bg-purple-400/20 border-purple-400/60 text-purple-200"
            : "bg-neutral-800 border-neutral-700 text-neutral-500"
        }`}
      >
        {done ? <CheckCircle2 className="w-3 h-3" /> : n}
      </span>
      <span className={`text-[0.65rem] font-bold ${active ? "text-white" : "text-neutral-500"}`}>{label}</span>
    </div>
  );

  return (
    <div className="zto-card zto-section space-y-4 border-purple-500/30">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Wand2 className="w-5 h-5 text-purple-400" />
          <h3 className="text-sm font-bold text-white">بناء قالب بالذكاء الاصطناعي</h3>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <StepBadge n={1} label="الأمثلة" active={step === "examples"} done={["wasf", "preview", "save"].includes(step)} />
          <span className="text-neutral-700">›</span>
          <StepBadge n={2} label="وصف القالب" active={step === "wasf"} done={["preview", "save"].includes(step)} />
          <span className="text-neutral-700">›</span>
          <StepBadge n={3} label="المعاينة" active={step === "preview"} done={step === "save"} />
          <span className="text-neutral-700">›</span>
          <StepBadge n={4} label="الحفظ" active={step === "save"} done={false} />
        </div>
      </div>

      {/* === Step 1: Examples === */}
      {step === "examples" && (
        <div className="space-y-4">
          <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-3 text-[0.7rem] text-neutral-300 leading-relaxed">
            ارفع صورتين على الأقل (حتى 6) من تصاميمك المعتادة. سيقوم النظام بتحليلها واستخراج وصف القالب — أسلوب الخطوط، الألوان، التوزيع، مكان الشعار، وغيرها.
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {examples.map((url, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-neutral-800 bg-[#1a1a1a]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`example ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  onClick={() => removeExample(i)}
                  className="absolute top-1 right-1 bg-black/60 hover:bg-black rounded p-0.5 text-white"
                  title="حذف"
                >
                  <X className="w-3 h-3" />
                </button>
                <span className="absolute bottom-1 left-1 text-[0.55rem] bg-black/60 text-white rounded px-1.5 py-0.5 font-mono">
                  {i + 1}
                </span>
              </div>
            ))}
            {examples.length < 6 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-lg border-2 border-dashed border-neutral-700 hover:border-purple-400 hover:text-purple-300 text-neutral-500 transition-colors flex flex-col items-center justify-center gap-1"
              >
                <Upload className="w-5 h-5" />
                <span className="text-[0.6rem] font-bold">إضافة</span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_MIME}
            hidden
            onChange={onAddExamples}
          />
          <div>
            <SubLabel>ملاحظات عن العلامة (اختياري)</SubLabel>
            <textarea
              className="zto-input min-h-[60px] text-xs"
              placeholder="مثال: لون العلامة #c8a85a، الخط الأساسي Noto Kufi Arabic، الشعار دائماً في الزاوية اليمنى العليا..."
              value={brandNotes}
              onChange={(e) => setBrandNotes(e.target.value)}
              maxLength={2000}
            />
          </div>

          {/* === Accompanying images (max 2) === */}
          <div className="border-t border-neutral-800 pt-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <SubLabel className="!mb-0">صور مرافقة (اختياري — حتى صورتين)</SubLabel>
              <span className="text-[0.55rem] text-neutral-500 font-mono">{extras.length}/2</span>
            </div>
            <p className="text-[0.6rem] text-neutral-500 leading-relaxed mb-2">
              صورة شعار، منتج، أو شخصية تريد دمجها داخل التصميم. اكتب لكل صورة ملاحظة قصيرة عن مكانها أو معاملتها (مثل
              «شعار في الزاوية اليمنى العليا»، «خلفية شفّافة»). تُرسَل مع الأمثلة لمرحلة التحليل ولمرحلة المعاينة معاً ليتم دمجها في التصميم النهائي.
            </p>
            <div className="space-y-2">
              {extras.map((ex, i) => (
                <div
                  key={i}
                  className="bg-[#0d0d0d] border border-neutral-800 rounded-lg p-2 flex items-start gap-2"
                >
                  <div className="relative w-16 h-16 rounded overflow-hidden border border-neutral-800 bg-[#1a1a1a] shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ex.dataUrl} alt={`extra ${i + 1}`} className="w-full h-full object-cover" />
                  </div>
                  <textarea
                    className="zto-input min-h-[64px] text-xs flex-1"
                    placeholder="ماذا نفعل بهذه الصورة في التصميم؟"
                    value={ex.note}
                    onChange={(e) => updateExtraNote(i, e.target.value)}
                    maxLength={600}
                  />
                  <button
                    onClick={() => removeExtra(i)}
                    className="text-neutral-500 hover:text-red-400 p-1 shrink-0"
                    title="حذف"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {extras.length < 2 && (
                <button
                  onClick={() => extrasInputRef.current?.click()}
                  className="w-full py-2 rounded-lg border-2 border-dashed border-neutral-700 hover:border-purple-400 hover:text-purple-300 text-neutral-500 text-[0.65rem] font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  إضافة صورة مرافقة
                </button>
              )}
            </div>
            <input
              ref={extrasInputRef}
              type="file"
              accept={ACCEPT_MIME}
              hidden
              onChange={onAddExtras}
            />
          </div>

          {/* === Font file (optional) === */}
          <div className="border-t border-neutral-800 pt-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <SubLabel className="!mb-0">الخط (اختياري)</SubLabel>
              {fontSampleUrl && (
                <button
                  onClick={clearFont}
                  className="text-[0.6rem] text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> إزالة الخط
                </button>
              )}
            </div>
            <p className="text-[0.6rem] text-neutral-500 leading-relaxed mb-2">
              ارفع ملف
              <code className="text-amber-400 mx-1 font-mono">.ttf</code>
              أو
              <code className="text-amber-400 mx-1 font-mono">.otf</code>
              أو
              <code className="text-amber-400 mx-1 font-mono">.woff[2]</code>.
              نرسم منه عيّنة عربية + لاتينية على الـcanvas في متصفّحك ونرسلها للنظام ليصف أسلوبه بدقّة كافية ليُحاكَى في المعاينة (لا يمكن تركيب خط مخصّص داخل نموذج التوليد، لذا نعتمد على وصف الأسلوب).
            </p>
            <div className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-2">
                <div>
                  <button
                    onClick={() => fontInputRef.current?.click()}
                    disabled={renderingFont}
                    className="w-full h-[42px] rounded-lg border-2 border-dashed border-neutral-700 hover:border-purple-400 hover:text-purple-300 text-neutral-500 text-[0.65rem] font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {renderingFont ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    {fontFileName ? "استبدال الخط" : "رفع ملف خط"}
                  </button>
                  {fontFileName && (
                    <p className="text-[0.55rem] text-neutral-500 mt-1 truncate font-mono" dir="ltr">
                      {fontFileName}
                    </p>
                  )}
                </div>
                <input
                  type="text"
                  className="zto-input text-xs"
                  placeholder="اسم عائلة الخط (يساعد النموذج، اختياري)"
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value.slice(0, 200))}
                />
              </div>
              <input
                ref={fontInputRef}
                type="file"
                accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
                hidden
                onChange={onLoadFont}
              />
              {fontError && (
                <p className="text-[0.6rem] text-red-400">{fontError}</p>
              )}
              {fontSampleUrl && (
                <div className="rounded-lg overflow-hidden border border-neutral-800 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fontSampleUrl} alt="font sample" className="w-full h-auto" />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[0.65rem] text-neutral-500">
              {examples.length} / 6 صور — الحد الأدنى 2.
            </p>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="zto-btn zto-btn-ghost zto-btn-sm">إلغاء</button>
              <button
                onClick={onAnalyze}
                disabled={analyzing || examples.length < 2}
                className="zto-btn zto-btn-sm zto-btn-outline border-purple-500/40 !text-purple-300"
              >
                {analyzing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                تحليل الأمثلة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === Step 2: Wasf + sample text === */}
      {step === "wasf" && (
        <div className="space-y-4">
          <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-3 text-[0.7rem] text-neutral-300 leading-relaxed">
            هذا هو <span className="font-bold">وصف القالب</span> الذي استخرجه النظام. يمكنك تعديله يدوياً قبل المعاينة. ثم اكتب نصاً تجريبياً لتوليد معاينة فعليّة.
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <SubLabel className="!mb-0">وصف القالب</SubLabel>
              <span className="text-[0.55rem] text-neutral-500 font-mono">{wasf.length} حرف</span>
            </div>
            <textarea
              className="zto-input min-h-[260px] text-xs leading-relaxed font-mono"
              value={wasf}
              onChange={(e) => setWasf(e.target.value)}
              dir="auto"
              maxLength={12000}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-3">
            <div>
              <SubLabel>نص العيّنة (يُستخدم كنص المنشور للمعاينة)</SubLabel>
              <textarea
                className="zto-input min-h-[80px] text-xs"
                placeholder="مثال: شركة ناشئة سعودية تجمع 5 ملايين دولار بقيادة صندوق سُند..."
                value={sampleText}
                onChange={(e) => setSampleText(e.target.value)}
                maxLength={4000}
              />
            </div>
            <div>
              <SubLabel>نسبة الأبعاد</SubLabel>
              <select
                className="zto-input text-xs"
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
              >
                {ASPECTS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div>
              <SubLabel>الجودة</SubLabel>
              <select
                className="zto-input text-xs"
                value={imageSize}
                onChange={(e) => setImageSize(e.target.value)}
              >
                {SIZES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button onClick={() => setStep("examples")} className="zto-btn zto-btn-ghost zto-btn-sm">
              ← العودة للأمثلة
            </button>
            <button
              onClick={onPreview}
              disabled={previewing || !wasf.trim() || !sampleText.trim()}
              className="zto-btn zto-btn-gold zto-btn-sm"
            >
              {previewing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ImageIcon className="w-3.5 h-3.5" />
              )}
              توليد المعاينة
            </button>
          </div>
        </div>
      )}

      {/* === Step 3: Preview === */}
      {step === "preview" && previewUrl && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4">
            <div>
              <SubLabel>المعاينة</SubLabel>
              <div className="rounded-lg overflow-hidden border border-neutral-800 bg-[#1a1a1a]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="preview" className="w-full h-auto" />
              </div>
              <p className="text-[0.6rem] text-neutral-500 mt-1.5 text-center">
                {aspectRatio} · {imageSize}
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <SubLabel>هل التصميم يطابق ما تتوقعه؟</SubLabel>
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    onClick={onApprove}
                    className="zto-btn zto-btn-sm zto-btn-outline border-emerald-500/40 !text-emerald-300"
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                    ممتاز — احفظ كقالب
                  </button>
                  <button
                    onClick={() => setStep("wasf")}
                    className="zto-btn zto-btn-ghost zto-btn-sm"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    إعادة المعاينة
                  </button>
                </div>
              </div>
              <div>
                <SubLabel>أو اطلب تعديلاً ذكياً على الوصف</SubLabel>
                <textarea
                  className="zto-input min-h-[100px] text-xs"
                  placeholder="مثال: اجعل الخلفية أغمق، حرّك الشعار للزاوية اليسرى، استخدم خطاً أعرض للعنوان..."
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  maxLength={2000}
                />
                <button
                  onClick={onRevise}
                  disabled={revising || !editPrompt.trim()}
                  className="zto-btn zto-btn-sm zto-btn-outline border-purple-500/40 !text-purple-300 mt-2 w-full"
                >
                  {revising ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5" />
                  )}
                  تحديث وصف القالب
                </button>
                <p className="text-[0.6rem] text-neutral-500 mt-1.5 leading-relaxed">
                  سيتم إرسال الأمثلة الأصلية + المعاينة الحالية + الوصف الحالي + طلبك إلى نظام التحليل
                  لتحديث الوصف. ستحتاج لتوليد معاينة جديدة بعد ذلك.
                </p>
              </div>
              {revisions.length > 1 && (
                <div className="border-t border-neutral-800 pt-3">
                  <SubLabel>المعاينات السابقة ({revisions.length - 1})</SubLabel>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {revisions.slice(0, -1).map((r, i) => (
                      <button
                        key={i}
                        onClick={() => setPreviewUrl(r.previewUrl)}
                        className="w-12 h-12 rounded border border-neutral-800 hover:border-amber-400 overflow-hidden"
                        title={r.editPrompt || `Revision ${i + 1}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.previewUrl} alt={`rev ${i + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* === Step 4: Save form === */}
      {step === "save" && previewUrl && (
        <div className="space-y-4">
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 text-[0.7rem] text-emerald-300 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>المعاينة معتمدة. أكمل بيانات القالب لحفظه واستخدامه لاحقاً من تبويب التوليد.</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4">
            <div>
              <SubLabel>المعاينة المعتمدة</SubLabel>
              <div className="aspect-square w-full rounded-lg overflow-hidden border border-neutral-800 bg-[#1a1a1a]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="approved" className="w-full h-full object-cover" />
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <SubLabel>اسم القالب *</SubLabel>
                <input
                  type="text"
                  className="zto-input text-xs"
                  placeholder="مثال: قالب أخبار الاستثمار"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <SubLabel>وصف موجز (اختياري)</SubLabel>
                <input
                  type="text"
                  className="zto-input text-xs"
                  placeholder="ما الذي يميّز هذا القالب؟"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div>
                <SubLabel>الوسوم</SubLabel>
                <div className="flex items-center flex-wrap gap-1.5 mb-2">
                  {SUGGESTED_TAGS.map((t) => (
                    <button
                      key={t}
                      onClick={() => addTag(t)}
                      className="text-[0.65rem] rounded-full px-2 py-0.5 border border-neutral-700 text-neutral-400 hover:border-amber-400 hover:text-amber-400 transition-colors"
                    >
                      + {t}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Tag className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
                  <input
                    type="text"
                    className="zto-input text-xs"
                    style={{ paddingInlineStart: "2.5rem" }}
                    placeholder="اكتب وسماً واضغط Enter"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag(tagInput);
                        setTagInput("");
                      }
                    }}
                  />
                </div>
                {tags.length > 0 && (
                  <div className="flex items-center flex-wrap gap-1.5 mt-2">
                    {tags.map((t) => (
                      <span
                        key={t}
                        className="text-[0.65rem] rounded-full px-2 py-0.5 bg-amber-400/15 text-amber-400 border border-amber-400/40 flex items-center gap-1"
                      >
                        #{t}
                        <button onClick={() => setTags(tags.filter((x) => x !== t))}>
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-[0.6rem] text-neutral-500 leading-relaxed">
                نسبة الأبعاد المُقترحة: <span className="text-amber-400 font-mono">{aspectRatio}</span> ·
                الجودة: <span className="text-amber-400 font-mono">{imageSize}</span>
                <br />
                وصف القالب ({wasf.length} حرف) سيُحفظ كتعليمات استخدام
                {wasf.length > 4000 && (
                  <span className="text-amber-400">
                    {" "}— سيُختصر إلى أول 4000 حرف لمطابقة قيود التخزين.
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button onClick={() => setStep("preview")} className="zto-btn zto-btn-ghost zto-btn-sm">
              ← العودة للمعاينة
            </button>
            <button
              onClick={onSubmitSave}
              disabled={saving || !name.trim()}
              className="zto-btn zto-btn-gold zto-btn-sm"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
              حفظ القالب
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
