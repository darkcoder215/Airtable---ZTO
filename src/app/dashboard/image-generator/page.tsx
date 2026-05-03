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
} from "lucide-react";
import { useAppStore } from "@/store/app-store";

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
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [referenceUploadDataUrl, setReferenceUploadDataUrl] = useState<string | null>(null);
  const [postText, setPostText] = useState("");
  const [edits, setEdits] = useState("");
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");
  const [imageSize, setImageSize] = useState<string>("2K");
  const [tagFilter, setTagFilter] = useState<string>("");

  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [generatedHistory, setGeneratedHistory] = useState<HistoryTurn[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [refineText, setRefineText] = useState("");
  const [previewTab, setPreviewTab] = useState<"x" | "linkedin-feed" | "linkedin-company">("linkedin-feed");

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const refInputRef = useRef<HTMLInputElement | null>(null);

  /* Library forms */
  const [showLogoForm, setShowLogoForm] = useState(false);
  const [showTemplateForm, setShowTemplateForm] = useState(false);

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
    extras?: { history?: HistoryTurn[]; edits?: string }
  ): Record<string, unknown> => ({
    postText,
    edits: extras?.edits ?? edits,
    logoId: selectedLogoId || undefined,
    logoDataUrl: logoUploadDataUrl ?? undefined,
    templateId: selectedTemplateId || undefined,
    referenceDataUrl: referenceUploadDataUrl ?? undefined,
    aspectRatio,
    imageSize,
    history: extras?.history,
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
    if (!effectiveLogoUrl) {
      addToast("اختر شعاراً محفوظاً أو ارفع واحداً", "warning");
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
    setSelectedTemplateId("");
    setReferenceUploadDataUrl(null);
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

  /* ─────────────── Render ─────────────── */

  return (
    <div className="space-y-6 zto-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-amber-400" />
            مولّد صور المنشورات
          </h2>
          <p className="text-neutral-500 text-sm mt-1">
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

      {/* Top tab bar */}
      <div className="flex items-center gap-1 p-1 bg-[#1a1a1a] border border-neutral-800 rounded-xl w-fit">
        <TabBtn active={tab === "generate"} onClick={() => setTab("generate")} icon={<Sparkles className="w-3.5 h-3.5" />} label="توليد" />
        <TabBtn active={tab === "logos"} onClick={() => setTab("logos")} icon={<Bookmark className="w-3.5 h-3.5" />} label={`الشعارات${logos.length ? ` (${logos.length})` : ""}`} />
        <TabBtn active={tab === "templates"} onClick={() => setTab("templates")} icon={<Layers className="w-3.5 h-3.5" />} label={`القوالب${templates.length ? ` (${templates.length})` : ""}`} />
      </div>

      {/* === GENERATE TAB === */}
      {tab === "generate" && (
        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-5">
          {/* Inputs column */}
          <div className="space-y-4 xl:max-h-[calc(100vh-260px)] xl:overflow-y-auto pr-1">
            {/* Step 1 — brand & template */}
            <section className="zto-card zto-section">
              <SectionHead step={1} icon={<Bookmark className="w-4 h-4 text-amber-400" />} title="العلامة والقالب" />

              <SubLabel>الشعار *</SubLabel>
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

              <SubLabel className="mt-4">القالب (اختياري)</SubLabel>
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

            {/* Step 2 — copy */}
            <section className="zto-card zto-section">
              <SectionHead step={2} icon={<MessageCircle className="w-4 h-4 text-blue-400" />} title="نص المنشور والتعديلات" />
              <SubLabel>نص المنشور *</SubLabel>
              <textarea
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                placeholder="مثال: نحن متحمّسون لإطلاق منتجنا الجديد..."
                className="zto-input min-h-[110px]"
                maxLength={8000}
              />
              <p className="text-[0.6rem] text-neutral-500 mt-1">{postText.length} / 8000</p>

              <SubLabel className="mt-3">تخصيصات (اختياري)</SubLabel>
              <textarea
                value={edits}
                onChange={(e) => setEdits(e.target.value)}
                placeholder="ألوان، خطوط عربية، خلفية متدرّجة، مكان الشعار..."
                className="zto-input min-h-[70px]"
                maxLength={4000}
              />
            </section>

            {/* Step 3 — format */}
            <section className="zto-card zto-section">
              <SectionHead step={3} icon={<Layers className="w-4 h-4 text-purple-400" />} title="التنسيق والجودة" />
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
              disabled={generating || !effectiveLogoUrl || !postText.trim()}
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
            {/* Result */}
            <section className="zto-card zto-section">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">النتيجة</h3>
                  {generatedHistory.length > 1 && (
                    <span className="text-[0.6rem] text-neutral-500">
                      نسخة {generatedHistory.filter((t) => t.role === "assistant").length}
                    </span>
                  )}
                </div>
                {generatedUrl && (
                  <button onClick={onDownload} className="zto-btn zto-btn-ghost zto-btn-sm text-amber-400">
                    <Download className="w-3.5 h-3.5" />
                    تنزيل
                  </button>
                )}
              </div>
              <div className="relative bg-[#0d0d0d] border border-neutral-800 rounded-xl overflow-hidden min-h-[280px] flex items-center justify-center">
                {generating && !generatedUrl && <GeneratingState />}
                {!generating && !generatedUrl && (
                  <div className="text-center py-12">
                    <ImageIcon className="w-10 h-10 text-neutral-700 mx-auto" />
                    <p className="text-xs text-neutral-500 mt-3">سيظهر التوليد هنا</p>
                  </div>
                )}
                {generatedUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={generatedUrl} alt="generated" className="w-full block" />
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

            {/* Realistic preview */}
            <section className="zto-card zto-section">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <Eye className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">معاينة منصّات</h3>
                <div className="flex bg-[#1a1a1a] border border-neutral-800 rounded-lg p-0.5 mr-auto">
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
              </div>
              <PreviewSurface
                tab={previewTab}
                logoUrl={effectiveLogoUrl}
                brandName={effectiveLogoName}
                postText={postText}
                generatedUrl={generatedUrl}
              />
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

function SectionHead({ step, icon, title }: { step: number; icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-neutral-800">
      <span className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400/30 to-amber-400/10 border border-amber-400/30 flex items-center justify-center text-[0.65rem] font-black text-amber-400">
        {step}
      </span>
      {icon}
      <h3 className="text-sm font-bold text-white">{title}</h3>
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
      </div>

      {isAdmin && (
        <div className="flex items-center justify-end">
          <button onClick={() => setShowForm(!showForm)} className="zto-btn zto-btn-gold zto-btn-sm">
            <Plus className="w-3.5 h-3.5" />
            {showForm ? "إلغاء" : "قالب جديد"}
          </button>
        </div>
      )}

      {showForm && isAdmin && (
        <NewTemplateForm onSubmit={onCreate} onCancel={() => setShowForm(false)} />
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
                  className="zto-input pr-10 text-xs"
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
