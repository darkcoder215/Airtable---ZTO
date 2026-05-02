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
} from "lucide-react";
import { useAppStore } from "@/store/app-store";

/* ───────── Constants ───────── */

const ASPECTS = [
  { value: "1:1", label: "1:1 — مربّع (X / LinkedIn feed)" },
  { value: "16:9", label: "16:9 — أفقي (LinkedIn / غلاف)" },
  { value: "4:5", label: "4:5 — رأسي (LinkedIn feed)" },
  { value: "9:16", label: "9:16 — رأسي طويل" },
] as const;

const SIZES = [
  { value: "1K", label: "1K — سريع" },
  { value: "2K", label: "2K — متوازن" },
  { value: "4K", label: "4K — أعلى جودة" },
] as const;

const MAX_FILE_BYTES = 6 * 1024 * 1024; // 6MB
const ACCEPT_MIME = "image/png,image/jpeg,image/webp,image/gif";

/* ───────── Helpers ───────── */

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const v = reader.result;
      if (typeof v !== "string") reject(new Error("read failed"));
      else resolve(v);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

interface HistoryTurn {
  role: "user" | "assistant";
  text?: string;
  imageUrl?: string;
}

/* ───────── Component ───────── */

export default function ImageGeneratorPage() {
  const { user, addToast } = useAppStore();

  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [referenceDataUrl, setReferenceDataUrl] = useState<string | null>(null);
  const [postText, setPostText] = useState("");
  const [edits, setEdits] = useState("");
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");
  const [imageSize, setImageSize] = useState<string>("2K");

  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [generatedHistory, setGeneratedHistory] = useState<HistoryTurn[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [refineText, setRefineText] = useState("");
  const [previewTab, setPreviewTab] = useState<"x" | "linkedin-feed" | "linkedin-company">("x");

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const refInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-pick a reasonable aspect ratio based on selected preview surface.
  useEffect(() => {
    if (previewTab === "x") setAspectRatio((p) => (p === "1:1" || p === "16:9" ? p : "16:9"));
    if (previewTab === "linkedin-feed") setAspectRatio((p) => (p === "1:1" || p === "4:5" ? p : "1:1"));
    if (previewTab === "linkedin-company") setAspectRatio("16:9");
  }, [previewTab]);

  const handleFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (v: string | null) => void,
    label: string
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      addToast(`${label} كبير جداً (الحد 6MB)`, "error");
      e.target.value = "";
      return;
    }
    try {
      const url = await readAsDataUrl(file);
      setter(url);
    } catch {
      addToast(`فشل قراءة ${label}`, "error");
    }
    e.target.value = "";
  };

  const reset = () => {
    setLogoDataUrl(null);
    setReferenceDataUrl(null);
    setPostText("");
    setEdits("");
    setRefineText("");
    setGeneratedUrl(null);
    setGeneratedHistory([]);
    setError(null);
  };

  const callApi = async (body: Record<string, unknown>): Promise<{
    ok: boolean;
    imageUrl?: string;
    text?: string;
    error?: string;
  }> => {
    try {
      const res = await fetch("/api/image-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || `HTTP ${res.status}` };
      }
      return { ok: true, imageUrl: data.imageUrl, text: data.text };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "خطأ في الشبكة",
      };
    }
  };

  const onGenerate = async () => {
    if (!logoDataUrl) {
      addToast("ارفع شعارك أولاً", "warning");
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
    const result = await callApi({
      postText,
      edits,
      logoDataUrl,
      referenceDataUrl,
      aspectRatio,
      imageSize,
    });
    setGenerating(false);
    if (!result.ok) {
      setError(result.error ?? "فشل التوليد");
      addToast(result.error ?? "فشل التوليد", "error");
      return;
    }
    setGeneratedUrl(result.imageUrl ?? null);
    setGeneratedHistory([
      {
        role: "assistant",
        imageUrl: result.imageUrl,
        text: result.text,
      },
    ]);
    addToast("تم توليد الصورة", "success");
  };

  const onRefine = async () => {
    if (!generatedUrl) return;
    if (!refineText.trim()) {
      addToast("اكتب التعديلات المطلوبة", "warning");
      return;
    }
    setGenerating(true);
    setError(null);
    const newHistory: HistoryTurn[] = [
      ...generatedHistory,
      { role: "user", text: refineText },
    ];
    const result = await callApi({
      postText,
      edits: refineText, // become the revision instruction
      logoDataUrl,
      referenceDataUrl,
      aspectRatio,
      imageSize,
      history: newHistory,
    });
    setGenerating(false);
    if (!result.ok) {
      setError(result.error ?? "فشل التعديل");
      addToast(result.error ?? "فشل التعديل", "error");
      return;
    }
    const updatedHistory: HistoryTurn[] = [
      ...newHistory,
      {
        role: "assistant",
        imageUrl: result.imageUrl,
        text: result.text,
      },
    ];
    setGeneratedHistory(updatedHistory);
    setGeneratedUrl(result.imageUrl ?? null);
    setRefineText("");
    addToast("تم التحديث", "success");
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

  const brandName = useMemo(() => user?.name || "علامتك التجارية", [user?.name]);

  /* ───────── Preview surfaces ───────── */

  const PreviewWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="bg-neutral-100 dark:bg-[#0a0a0a] rounded-2xl p-4 overflow-x-auto" dir="ltr">
      <div className="mx-auto max-w-[560px]">{children}</div>
    </div>
  );

  const XFeedPreview = () => (
    <div className="bg-black border border-neutral-800 rounded-2xl p-4 text-white">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-white shrink-0 overflow-hidden flex items-center justify-center">
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoDataUrl} alt="logo" className="w-full h-full object-cover" />
          ) : (
            <span className="text-black text-[10px] font-bold">LOGO</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-[14px]">
            <span className="font-bold truncate">{brandName}</span>
            <span className="text-neutral-500 truncate">@{brandName.toLowerCase().replace(/\s+/g, "")}</span>
            <span className="text-neutral-500">· الآن</span>
          </div>
          <p className="text-[15px] mt-1 whitespace-pre-wrap leading-snug">
            {postText || "اكتب نص منشورك هنا..."}
          </p>
          {generatedUrl && (
            <div className="mt-3 rounded-2xl overflow-hidden border border-neutral-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={generatedUrl} alt="generated" className="w-full block" />
            </div>
          )}
          <div className="flex items-center justify-between mt-3 text-neutral-500 text-[13px] max-w-[400px]">
            <span className="flex items-center gap-1.5"><MessageCircle className="w-4 h-4" /> 12</span>
            <span className="flex items-center gap-1.5"><Repeat2 className="w-4 h-4" /> 8</span>
            <span className="flex items-center gap-1.5"><Heart className="w-4 h-4" /> 124</span>
            <span className="flex items-center gap-1.5"><Eye className="w-4 h-4" /> 3.4K</span>
          </div>
        </div>
      </div>
    </div>
  );

  const LinkedInFeedPreview = () => (
    <div className="bg-white border border-neutral-200 rounded-lg shadow-sm text-neutral-900">
      <div className="flex items-start gap-3 p-3">
        <div className="w-12 h-12 rounded-full bg-neutral-200 shrink-0 overflow-hidden flex items-center justify-center">
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoDataUrl} alt="logo" className="w-full h-full object-cover" />
          ) : (
            <span className="text-neutral-500 text-[10px] font-bold">LOGO</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[14px] truncate">{brandName}</div>
          <div className="text-neutral-500 text-[12px]">Company · 12,345 followers</div>
          <div className="text-neutral-500 text-[12px]">الآن · 🌐</div>
        </div>
      </div>
      <p className="px-4 pb-3 text-[14px] whitespace-pre-wrap leading-relaxed">
        {postText || "اكتب نص منشورك هنا..."}
      </p>
      {generatedUrl && (
        <div className="border-y border-neutral-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={generatedUrl} alt="generated" className="w-full block" />
        </div>
      )}
      <div className="flex items-center justify-between px-3 py-2 text-neutral-500 text-[12px]">
        <span>👍❤️ 248</span>
        <span>32 comments · 9 reposts</span>
      </div>
      <div className="flex items-center justify-around border-t border-neutral-200 py-1 text-neutral-600 text-[13px] font-semibold">
        <span className="flex items-center gap-1.5 px-3 py-2"><ThumbsUp className="w-4 h-4" /> Like</span>
        <span className="flex items-center gap-1.5 px-3 py-2"><MessageCircle className="w-4 h-4" /> Comment</span>
        <span className="flex items-center gap-1.5 px-3 py-2"><Repeat2 className="w-4 h-4" /> Repost</span>
        <span className="flex items-center gap-1.5 px-3 py-2"><Send className="w-4 h-4" /> Send</span>
      </div>
    </div>
  );

  const LinkedInCompanyPreview = () => (
    <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden text-neutral-900 shadow-sm">
      {/* Cover */}
      <div className="relative h-32 bg-gradient-to-r from-blue-100 to-blue-50">
        {generatedUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={generatedUrl} alt="cover" className="w-full h-full object-cover" />
        )}
      </div>
      {/* Logo + name */}
      <div className="px-5 pb-5 -mt-10">
        <div className="w-20 h-20 rounded-lg bg-white border-4 border-white shadow-md overflow-hidden flex items-center justify-center">
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoDataUrl} alt="logo" className="w-full h-full object-cover" />
          ) : (
            <span className="text-neutral-500 text-[10px] font-bold">LOGO</span>
          )}
        </div>
        <h3 className="mt-2 text-[20px] font-bold leading-tight">{brandName}</h3>
        <p className="text-[13px] text-neutral-600 leading-snug whitespace-pre-wrap line-clamp-3">
          {postText || "أضف تعريفاً موجزاً عن شركتك هنا — هذا هو ما يظهر تحت اسم الصفحة في LinkedIn."}
        </p>
        <div className="flex items-center gap-2 text-[12px] text-neutral-500 mt-2">
          <span>Software · Riyadh, Saudi Arabia</span>
          <span>·</span>
          <span className="text-blue-700 font-semibold">12,345 followers</span>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button className="px-4 py-1.5 bg-blue-700 text-white rounded-full text-[14px] font-semibold">+ Follow</button>
          <button className="px-4 py-1.5 border border-blue-700 text-blue-700 rounded-full text-[14px] font-semibold">Visit website</button>
        </div>
      </div>
    </div>
  );

  /* ───────── Render ───────── */

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-amber-400" />
            مولّد صور المنشورات
          </h2>
          <p className="text-neutral-500 text-sm mt-1">
            ارفع شعارك ونص المنشور وصورة مرجعية اختيارية لتوليد صورة مناسبة، مع إمكانية التعديل لاحقاً.
          </p>
        </div>
        <button onClick={reset} className="zto-btn zto-btn-ghost zto-btn-sm" title="إعادة تعيين">
          <RotateCcw className="w-3.5 h-3.5" />
          مسح
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ── Inputs ── */}
        <div className="zto-card p-5 space-y-5">
          {/* Logo */}
          <div>
            <label className="zto-label">الشعار *</label>
            <div className="flex items-center gap-3">
              {logoDataUrl ? (
                <div className="relative w-20 h-20 bg-[#1a1a1a] border border-neutral-800 rounded-lg overflow-hidden shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoDataUrl} alt="logo" className="w-full h-full object-cover" />
                  <button
                    onClick={() => setLogoDataUrl(null)}
                    className="absolute top-1 right-1 bg-black/60 rounded p-0.5 text-white hover:bg-black"
                    title="حذف"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="w-20 h-20 bg-[#1a1a1a] border border-dashed border-neutral-800 rounded-lg flex items-center justify-center shrink-0">
                  <ImageIcon className="w-6 h-6 text-neutral-600" />
                </div>
              )}
              <div className="flex-1">
                <button
                  onClick={() => logoInputRef.current?.click()}
                  className="zto-btn zto-btn-outline zto-btn-sm"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {logoDataUrl ? "تغيير الشعار" : "ارفع الشعار"}
                </button>
                <p className="text-[10px] text-neutral-500 mt-1.5">PNG / JPG / WebP — حد 6MB</p>
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept={ACCEPT_MIME}
                hidden
                onChange={(e) => handleFile(e, setLogoDataUrl, "الشعار")}
              />
            </div>
          </div>

          {/* Post text */}
          <div>
            <label className="zto-label">نص المنشور *</label>
            <textarea
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              placeholder="مثال: نحن متحمسون لإطلاق منتجنا الجديد..."
              className="zto-input min-h-[120px]"
              maxLength={8000}
            />
            <p className="text-[10px] text-neutral-500 mt-1">
              {postText.length} / 8000
            </p>
          </div>

          {/* Reference image */}
          <div>
            <label className="zto-label">صورة مرجعية (اختياري)</label>
            <div className="flex items-center gap-3">
              {referenceDataUrl ? (
                <div className="relative w-20 h-20 bg-[#1a1a1a] border border-neutral-800 rounded-lg overflow-hidden shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={referenceDataUrl} alt="reference" className="w-full h-full object-cover" />
                  <button
                    onClick={() => setReferenceDataUrl(null)}
                    className="absolute top-1 right-1 bg-black/60 rounded p-0.5 text-white hover:bg-black"
                    title="حذف"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="w-20 h-20 bg-[#1a1a1a] border border-dashed border-neutral-800 rounded-lg flex items-center justify-center shrink-0">
                  <ImageIcon className="w-6 h-6 text-neutral-600" />
                </div>
              )}
              <div className="flex-1">
                <button
                  onClick={() => refInputRef.current?.click()}
                  className="zto-btn zto-btn-outline zto-btn-sm"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {referenceDataUrl ? "تغيير المرجع" : "ارفع مثالاً مشابهاً"}
                </button>
                <p className="text-[10px] text-neutral-500 mt-1.5">
                  يستخدم النموذج الأسلوب لا المحتوى الحرفي
                </p>
              </div>
              <input
                ref={refInputRef}
                type="file"
                accept={ACCEPT_MIME}
                hidden
                onChange={(e) => handleFile(e, setReferenceDataUrl, "الصورة المرجعية")}
              />
            </div>
          </div>

          {/* Edits / customizations */}
          <div>
            <label className="zto-label">تعديلات أو تخصيصات (اختياري)</label>
            <textarea
              value={edits}
              onChange={(e) => setEdits(e.target.value)}
              placeholder="مثال: ألوان داكنة، نص بالخط الكوفي، خلفية متدرجة..."
              className="zto-input min-h-[80px]"
              maxLength={4000}
            />
          </div>

          {/* Aspect + size */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="zto-label">نسبة الأبعاد</label>
              <div className="zto-select-wrap">
                <select
                  className="zto-input text-xs"
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                >
                  {ASPECTS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="zto-label">الجودة</label>
              <div className="zto-select-wrap">
                <select
                  className="zto-input text-xs"
                  value={imageSize}
                  onChange={(e) => setImageSize(e.target.value)}
                >
                  {SIZES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <button
            onClick={onGenerate}
            disabled={generating || !logoDataUrl || !postText.trim()}
            className="zto-btn zto-btn-gold w-full"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {generatedUrl ? "إعادة التوليد من جديد" : "توليد الصورة"}
          </button>

          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* ── Output + Preview ── */}
        <div className="space-y-4">
          {/* Generated image */}
          <div className="zto-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-amber-400" />
                النتيجة
              </h3>
              {generatedUrl && (
                <button
                  onClick={onDownload}
                  className="zto-btn zto-btn-ghost zto-btn-sm text-amber-400"
                  title="تنزيل"
                >
                  <Download className="w-3.5 h-3.5" />
                  تنزيل
                </button>
              )}
            </div>
            <div className="bg-[#1a1a1a] border border-neutral-800 rounded-lg min-h-[280px] flex items-center justify-center overflow-hidden">
              {generating && !generatedUrl && (
                <div className="text-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-400 mx-auto" />
                  <p className="text-xs text-neutral-500 mt-3">قد يستغرق هذا حتى دقيقتين...</p>
                </div>
              )}
              {!generating && !generatedUrl && (
                <div className="text-center py-12">
                  <ImageIcon className="w-10 h-10 text-neutral-700 mx-auto" />
                  <p className="text-xs text-neutral-500 mt-3">سيظهر التوليد هنا</p>
                </div>
              )}
              {generatedUrl && (
                <div className="w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={generatedUrl} alt="generated" className="w-full block" />
                </div>
              )}
            </div>

            {/* Refine */}
            {generatedUrl && (
              <div className="mt-4 space-y-2">
                <label className="zto-label">تحسينات إضافية</label>
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
                    title="تحديث"
                  >
                    {generating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wand2 className="w-4 h-4" />
                    )}
                    تحديث
                  </button>
                </div>
                <p className="text-[10px] text-neutral-500">
                  {generatedHistory.filter((t) => t.role === "assistant").length} نسخة في الذاكرة
                </p>
              </div>
            )}
          </div>

          {/* Preview tabs */}
          <div className="zto-card p-4">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Eye className="w-4 h-4 text-amber-400" />
                معاينة
              </h3>
              <div className="flex bg-[#1a1a1a] border border-neutral-800 rounded-lg p-0.5 mr-auto">
                <button
                  onClick={() => setPreviewTab("x")}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                    previewTab === "x" ? "bg-white text-black" : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  X
                </button>
                <button
                  onClick={() => setPreviewTab("linkedin-feed")}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                    previewTab === "linkedin-feed" ? "bg-white text-black" : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  LinkedIn Feed
                </button>
                <button
                  onClick={() => setPreviewTab("linkedin-company")}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                    previewTab === "linkedin-company" ? "bg-white text-black" : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  LinkedIn Company
                </button>
              </div>
            </div>
            <PreviewWrapper>
              {previewTab === "x" && <XFeedPreview />}
              {previewTab === "linkedin-feed" && <LinkedInFeedPreview />}
              {previewTab === "linkedin-company" && <LinkedInCompanyPreview />}
            </PreviewWrapper>
          </div>
        </div>
      </div>
    </div>
  );
}
