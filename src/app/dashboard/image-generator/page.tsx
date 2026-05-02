"use client";

import { useState, useRef } from "react";
import { useAppStore } from "@/store/app-store";
import {
  ImageIcon,
  Upload,
  Sparkles,
  Loader2,
  RefreshCw,
  Download,
  X,
  AlertCircle,
  Wand2,
  MessageSquare,
  Building2,
  Image as ImagePreview,
  Trash2,
  RotateCcw,
} from "lucide-react";

/* Inline social icons (lucide-react no longer ships brand marks) */
function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
function LinkedinIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.852 3.37-1.852 3.601 0 4.267 2.37 4.267 5.455v6.288zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.777 13.019H3.555V9h3.559v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

/* ────────── Types ────────── */

interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

interface ConversationMessage {
  role: "user" | "assistant";
  // What's stored to send back to the model
  content: string | ContentPart[];
  // Display fields
  displayText: string;
  displayUserImages?: string[];
  // For assistant messages
  images?: Array<{ type: string; image_url: { url: string } }>;
  generatedAt?: string;
}

const ASPECT_RATIOS = [
  { value: "1:1", label: "1:1 — مربع (Instagram/X)" },
  { value: "16:9", label: "16:9 — أفقي (LinkedIn/X)" },
  { value: "4:5", label: "4:5 — عمودي (LinkedIn)" },
  { value: "9:16", label: "9:16 — قصة" },
  { value: "3:2", label: "3:2 — أفقي" },
  { value: "2:3", label: "2:3 — عمودي" },
];

const IMAGE_SIZES = [
  { value: "1K", label: "1K (افتراضي)" },
  { value: "2K", label: "2K" },
  { value: "4K", label: "4K (عالي الجودة)" },
];

type PreviewMode = "x_feed" | "linkedin_feed" | "linkedin_company";

/* ────────── Helpers ────────── */

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ────────── Component ────────── */

export default function ImageGeneratorPage() {
  const { user, addToast } = useAppStore();

  /* inputs */
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [postText, setPostText] = useState("");
  const [exampleImageUrl, setExampleImageUrl] = useState<string | null>(null);
  const [customizations, setCustomizations] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [imageSize, setImageSize] = useState("2K");

  /* conversation */
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [editPrompt, setEditPrompt] = useState("");

  /* state */
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* preview */
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("x_feed");

  /* refs */
  const logoInputRef = useRef<HTMLInputElement>(null);
  const exampleInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      addToast("الرجاء اختيار ملف صورة", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      addToast("حجم الصورة أكبر من 5 ميجابايت", "error");
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    setLogoDataUrl(dataUrl);
  };

  const handleExampleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      addToast("الرجاء اختيار ملف صورة", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      addToast("حجم الصورة أكبر من 5 ميجابايت", "error");
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    setExampleImageUrl(dataUrl);
  };

  const buildInitialPrompt = (): { content: ContentPart[]; displayText: string; userImages: string[] } => {
    const promptParts: string[] = [];
    promptParts.push(
      `Generate a professional social-media post image. Branding requirement: incorporate the provided LOGO tastefully (corner placement or as a subtle watermark — do not distort it). Match the visual style of the example image if provided.`
    );
    if (postText.trim()) {
      promptParts.push(`\n\n# Post content / theme:\n${postText.trim()}`);
    }
    if (customizations.trim()) {
      promptParts.push(`\n\n# Customization & style notes:\n${customizations.trim()}`);
    }
    promptParts.push(
      `\n\n# Output requirements:\n- Aspect ratio: ${aspectRatio}\n- Polished, high-contrast, social-media-ready composition.\n- Keep typography legible if any text is rendered.`
    );

    const content: ContentPart[] = [{ type: "text", text: promptParts.join("") }];
    const userImages: string[] = [];

    if (logoDataUrl) {
      content.push({ type: "text", text: "\n\n[LOGO — use this brand mark]" });
      content.push({ type: "image_url", image_url: { url: logoDataUrl } });
      userImages.push(logoDataUrl);
    }
    if (exampleImageUrl) {
      content.push({ type: "text", text: "\n\n[EXAMPLE — match this visual style]" });
      content.push({ type: "image_url", image_url: { url: exampleImageUrl } });
      userImages.push(exampleImageUrl);
    }

    return { content, displayText: promptParts.join(""), userImages };
  };

  const generate = async (messages: ConversationMessage[]) => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/image-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            images: m.images,
          })),
          aspect_ratio: aspectRatio,
          image_size: imageSize,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data?.error || "فشل توليد الصورة";
        setError(errMsg);
        addToast(errMsg, "error");
        return null;
      }
      const assistantMsg: ConversationMessage = {
        role: "assistant",
        content: data.text || "",
        displayText: data.text || "",
        images: (data.images || []).map((img: { url: string }) => ({
          type: "image_url",
          image_url: { url: img.url },
        })),
        generatedAt: new Date().toISOString(),
      };
      setConversation((prev) => [...prev, assistantMsg]);
      const firstImage = assistantMsg.images?.[0]?.image_url.url;
      if (firstImage) setSelectedImage(firstImage);
      addToast("تم توليد الصورة", "success");
      return assistantMsg;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطأ في الاتصال";
      setError(msg);
      addToast(msg, "error");
      return null;
    } finally {
      setGenerating(false);
    }
  };

  const handleInitialGenerate = async () => {
    if (!postText.trim()) {
      addToast("اكتب وصف المنشور أولاً", "warning");
      return;
    }
    if (!logoDataUrl) {
      addToast("ارفع شعار العلامة التجارية أولاً", "warning");
      return;
    }
    const { content, displayText, userImages } = buildInitialPrompt();
    const userMsg: ConversationMessage = {
      role: "user",
      content,
      displayText,
      displayUserImages: userImages,
    };
    const newConv = [userMsg];
    setConversation(newConv);
    await generate(newConv);
  };

  const handleEdit = async () => {
    if (!editPrompt.trim()) {
      addToast("اكتب طلب التعديل", "warning");
      return;
    }
    const userMsg: ConversationMessage = {
      role: "user",
      content: editPrompt.trim(),
      displayText: editPrompt.trim(),
    };
    const newConv = [...conversation, userMsg];
    setConversation(newConv);
    setEditPrompt("");
    await generate(newConv);
  };

  const handleRetry = async () => {
    if (conversation.length === 0) return;
    // Find last user message and resend the conversation up to (and including) that point
    const lastUserIdx = [...conversation].reverse().findIndex((m) => m.role === "user");
    if (lastUserIdx === -1) return;
    const upToIdx = conversation.length - lastUserIdx;
    const trimmed = conversation.slice(0, upToIdx);
    setConversation(trimmed);
    await generate(trimmed);
  };

  const reset = () => {
    if (
      conversation.length > 0 &&
      !confirm("سيتم مسح المحادثة الحالية والصور المولدة. هل تريد المتابعة؟")
    )
      return;
    setConversation([]);
    setSelectedImage(null);
    setError(null);
    setEditPrompt("");
  };

  const downloadImage = (url: string, idx: number) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `zto-generated-${Date.now()}-${idx}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  /* ──────────────────── JSX ──────────────────── */

  return (
    <div className="space-y-4 max-w-full">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Wand2 className="w-5 h-5 text-amber-400 shrink-0" />
        <h2 className="text-[15px] font-black text-white">مولّد صور المنشورات</h2>
        <span className="text-[10px] text-neutral-500 font-bold tracking-wider bg-[#1a1a1a] border border-neutral-800 rounded px-2 py-0.5">
          google/gemini-3-pro-image-preview
        </span>
      </div>
      <p className="text-[12px] text-neutral-500 -mt-2">
        ارفع الشعار والمنشور وصورة مرجعية، ثم ولّد صورة احترافية للنشر على X و LinkedIn — مع إمكانية طلب تعديلات والمعاينة قبل النشر.
      </p>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* ── Left: Inputs ── */}
        <div className="space-y-4">
          <div className="zto-card p-4 space-y-4">
            <h3 className="text-[13px] font-black text-white flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-amber-400" />
              المدخلات
            </h3>

            {/* Logo */}
            <div>
              <label className="zto-label flex items-center gap-1.5">
                <Upload className="w-3 h-3 text-amber-400" />
                شعار العلامة التجارية <span className="text-red-400">*</span>
              </label>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
              {logoDataUrl ? (
                <div className="flex items-center gap-3 bg-[#0d0d0d] border border-neutral-800 rounded-xl p-2">
                  <img
                    src={logoDataUrl}
                    alt="logo"
                    className="w-16 h-16 object-contain rounded-lg bg-white p-1"
                  />
                  <div className="flex-1 text-[11px] text-neutral-500">شعار جاهز</div>
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    className="zto-btn zto-btn-ghost zto-btn-sm"
                  >
                    تغيير
                  </button>
                  <button
                    onClick={() => setLogoDataUrl(null)}
                    className="zto-btn zto-btn-ghost zto-btn-sm text-red-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => logoInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-neutral-800 rounded-xl py-6 flex flex-col items-center justify-center gap-1 hover:border-amber-400/40 hover:bg-amber-400/5 transition-colors"
                >
                  <Upload className="w-5 h-5 text-neutral-500" />
                  <span className="text-[12px] text-neutral-400 font-bold">رفع الشعار</span>
                  <span className="text-[10px] text-neutral-600">PNG, JPG · حتى 5MB</span>
                </button>
              )}
            </div>

            {/* Post text */}
            <div>
              <label className="zto-label flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3 text-amber-400" />
                نص المنشور / الفكرة <span className="text-red-400">*</span>
              </label>
              <textarea
                className="zto-input min-h-[100px] text-[13px]"
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                placeholder="اكتب فكرة المنشور أو نصه — مثلاً: أعلن عن دورة تدريبية بعنوان 'صفر إلى واحد' للمبتدئين..."
              />
            </div>

            {/* Example image */}
            <div>
              <label className="zto-label flex items-center gap-1.5">
                <ImagePreview className="w-3 h-3 text-amber-400" />
                صورة مرجعية (اختياري)
              </label>
              <input
                ref={exampleInputRef}
                type="file"
                accept="image/*"
                onChange={handleExampleUpload}
                className="hidden"
              />
              {exampleImageUrl ? (
                <div className="flex items-center gap-3 bg-[#0d0d0d] border border-neutral-800 rounded-xl p-2">
                  <img
                    src={exampleImageUrl}
                    alt="example"
                    className="w-16 h-16 object-cover rounded-lg"
                  />
                  <div className="flex-1 text-[11px] text-neutral-500">سيتم محاكاة هذا الستايل</div>
                  <button
                    onClick={() => exampleInputRef.current?.click()}
                    className="zto-btn zto-btn-ghost zto-btn-sm"
                  >
                    تغيير
                  </button>
                  <button
                    onClick={() => setExampleImageUrl(null)}
                    className="zto-btn zto-btn-ghost zto-btn-sm text-red-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => exampleInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-neutral-800 rounded-xl py-5 flex flex-col items-center justify-center gap-1 hover:border-amber-400/40 hover:bg-amber-400/5 transition-colors"
                >
                  <Upload className="w-4 h-4 text-neutral-500" />
                  <span className="text-[11px] text-neutral-400 font-bold">رفع صورة مشابهة (مرجعية)</span>
                </button>
              )}
            </div>

            {/* Customizations */}
            <div>
              <label className="zto-label flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-amber-400" />
                ملاحظات وتعديلات
              </label>
              <textarea
                className="zto-input min-h-[60px] text-[13px]"
                value={customizations}
                onChange={(e) => setCustomizations(e.target.value)}
                placeholder="مثلاً: استخدم ألوان ذهبية وأسود، خط عربي عريض، خلفية متدرجة..."
              />
            </div>

            {/* Aspect / size */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="zto-label">الأبعاد</label>
                <div className="zto-select-wrap">
                  <select
                    className="zto-input text-[12px]"
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                  >
                    {ASPECT_RATIOS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="zto-label">الجودة</label>
                <div className="zto-select-wrap">
                  <select
                    className="zto-input text-[12px]"
                    value={imageSize}
                    onChange={(e) => setImageSize(e.target.value)}
                  >
                    {IMAGE_SIZES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleInitialGenerate}
                disabled={generating || !postText.trim() || !logoDataUrl}
                className="zto-btn zto-btn-gold flex-1"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {conversation.length === 0 ? "توليد الصورة" : "توليد جديد"}
              </button>
              {conversation.length > 0 && (
                <button onClick={reset} className="zto-btn zto-btn-outline" title="مسح المحادثة">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {error && (
              <div className="zto-alert zto-alert-err">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Edit / retry conversation */}
          {conversation.length > 0 && (
            <div className="zto-card p-4 space-y-3">
              <h3 className="text-[13px] font-black text-white flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-amber-400" />
                تعديلات وإعادة المحاولة
              </h3>
              <div className="space-y-2 max-h-48 overflow-auto">
                {conversation.map((msg, i) => (
                  <div
                    key={i}
                    className={`text-[11px] rounded-lg p-2 ${
                      msg.role === "user"
                        ? "bg-amber-400/5 border border-amber-400/20 text-amber-200"
                        : "bg-[#0d0d0d] border border-neutral-800 text-neutral-400"
                    }`}
                  >
                    <div className="font-bold mb-1">
                      {msg.role === "user" ? "أنت" : "النموذج"}
                    </div>
                    <div className="line-clamp-3 whitespace-pre-wrap">{msg.displayText || "—"}</div>
                    {msg.role === "assistant" && msg.images && msg.images.length > 0 && (
                      <div className="text-[10px] text-emerald-400 mt-1">
                        ✓ تم توليد {msg.images.length} صورة
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <textarea
                className="zto-input min-h-[60px] text-[13px]"
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder="مثلاً: اجعل الخلفية أغمق، حرّك الشعار للزاوية اليمنى، أضف زهور ذهبية..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleEdit();
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleEdit}
                  disabled={generating || !editPrompt.trim()}
                  className="zto-btn zto-btn-gold flex-1"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  طلب تعديل
                </button>
                <button
                  onClick={handleRetry}
                  disabled={generating}
                  className="zto-btn zto-btn-outline"
                  title="إعادة محاولة بنفس الطلب"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Preview ── */}
        <div className="space-y-4">
          <div className="zto-card p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-[13px] font-black text-white flex items-center gap-2">
                <ImagePreview className="w-4 h-4 text-amber-400" />
                المعاينة
              </h3>
              <div className="flex items-center bg-[#0d0d0d] border border-neutral-800 rounded-lg overflow-hidden">
                <button
                  onClick={() => setPreviewMode("x_feed")}
                  className={`px-2.5 py-1.5 text-[11px] font-bold flex items-center gap-1.5 ${
                    previewMode === "x_feed" ? "bg-white text-black" : "text-neutral-400"
                  }`}
                >
                  <XIcon className="w-3 h-3" /> X
                </button>
                <button
                  onClick={() => setPreviewMode("linkedin_feed")}
                  className={`px-2.5 py-1.5 text-[11px] font-bold flex items-center gap-1.5 border-r border-neutral-800 ${
                    previewMode === "linkedin_feed" ? "bg-[#0a66c2] text-white" : "text-neutral-400"
                  }`}
                >
                  <LinkedinIcon className="w-3 h-3" /> LinkedIn
                </button>
                <button
                  onClick={() => setPreviewMode("linkedin_company")}
                  className={`px-2.5 py-1.5 text-[11px] font-bold flex items-center gap-1.5 border-r border-neutral-800 ${
                    previewMode === "linkedin_company" ? "bg-[#0a66c2] text-white" : "text-neutral-400"
                  }`}
                >
                  <Building2 className="w-3 h-3" /> Company
                </button>
              </div>
            </div>

            {selectedImage ? (
              <SocialPreview
                imageUrl={selectedImage}
                postText={postText}
                userName={user?.name || "Zero to One"}
                mode={previewMode}
              />
            ) : (
              <div className="border-2 border-dashed border-neutral-800 rounded-xl py-16 flex flex-col items-center justify-center gap-2">
                <ImagePreview className="w-10 h-10 text-neutral-700" />
                <p className="text-[12px] text-neutral-500 font-bold">
                  لم يتم توليد أي صورة بعد
                </p>
                <p className="text-[11px] text-neutral-600">املأ الحقول واضغط &quot;توليد&quot;</p>
              </div>
            )}

            {/* Image gallery (variations across the conversation) */}
            {conversation.some((m) => m.images && m.images.length > 0) && (
              <div className="space-y-2">
                <p className="text-[11px] text-neutral-500 font-bold">جميع الإصدارات المولدة</p>
                <div className="grid grid-cols-4 gap-2">
                  {conversation.flatMap((msg, msgIdx) =>
                    (msg.images || []).map((img, imgIdx) => {
                      const url = img.image_url.url;
                      const isSelected = url === selectedImage;
                      return (
                        <div
                          key={`${msgIdx}-${imgIdx}`}
                          className={`relative rounded-lg overflow-hidden border-2 cursor-pointer group ${
                            isSelected ? "border-amber-400" : "border-neutral-800 hover:border-neutral-700"
                          }`}
                          onClick={() => setSelectedImage(url)}
                        >
                          <img src={url} alt={`gen-${msgIdx}-${imgIdx}`} className="w-full aspect-square object-cover" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadImage(url, msgIdx * 10 + imgIdx);
                            }}
                            className="absolute bottom-1 left-1 p-1 rounded bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            title="تنزيل"
                          >
                            <Download className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────── Social Previews ────────── */

function SocialPreview({
  imageUrl,
  postText,
  userName,
  mode,
}: {
  imageUrl: string;
  postText: string;
  userName: string;
  mode: PreviewMode;
}) {
  if (mode === "x_feed") {
    return (
      <div className="bg-black border border-neutral-800 rounded-xl overflow-hidden" dir="ltr">
        <div className="p-3 flex gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shrink-0 flex items-center justify-center text-black font-black">
            {userName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[13px]">
              <span className="font-bold text-white">{userName}</span>
              <span className="text-neutral-500">@{userName.toLowerCase().replace(/\s+/g, "_")}</span>
              <span className="text-neutral-600">·</span>
              <span className="text-neutral-500">now</span>
            </div>
            <div className="text-[14px] text-white mt-1 whitespace-pre-wrap break-words" dir="auto">
              {postText || "Your post text will appear here…"}
            </div>
            <div className="mt-2 rounded-2xl overflow-hidden border border-neutral-800">
              <img src={imageUrl} alt="post" className="w-full" />
            </div>
            <div className="flex items-center justify-between mt-2 text-neutral-500 text-[12px] max-w-md">
              <span>💬 24</span>
              <span>🔁 87</span>
              <span>♡ 312</span>
              <span>📊 5.2K</span>
              <span>↗</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "linkedin_feed") {
    return (
      <div className="bg-white text-black rounded-xl overflow-hidden border border-neutral-300" dir="ltr">
        <div className="p-3 flex gap-2 items-start">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shrink-0 flex items-center justify-center text-black font-black">
            {userName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold leading-tight">{userName}</div>
            <div className="text-[11px] text-neutral-600">Founder · Zero to One</div>
            <div className="text-[11px] text-neutral-500">Now · 🌐</div>
          </div>
          <div className="text-neutral-500 px-2">⋯</div>
        </div>
        <div className="px-3 pb-3 text-[13px] whitespace-pre-wrap break-words" dir="auto">
          {postText || "Your post text will appear here…"}
        </div>
        <div className="border-t border-b border-neutral-200">
          <img src={imageUrl} alt="post" className="w-full" />
        </div>
        <div className="px-3 py-1.5 flex items-center justify-between text-[11px] text-neutral-600">
          <span>👍❤️🎉 142</span>
          <span>23 comments · 8 reposts</span>
        </div>
        <div className="border-t border-neutral-200 grid grid-cols-4 text-[12px] font-bold text-neutral-700">
          <div className="py-2 flex items-center justify-center gap-1.5">👍 Like</div>
          <div className="py-2 flex items-center justify-center gap-1.5">💬 Comment</div>
          <div className="py-2 flex items-center justify-center gap-1.5">🔁 Repost</div>
          <div className="py-2 flex items-center justify-center gap-1.5">📤 Send</div>
        </div>
      </div>
    );
  }

  // linkedin_company — company page post layout
  return (
    <div className="bg-white text-black rounded-xl overflow-hidden border border-neutral-300" dir="ltr">
      {/* Cover band to evoke company page */}
      <div className="h-12 bg-gradient-to-r from-[#0a66c2] to-[#004182]" />
      <div className="px-3 pb-2 -mt-6">
        <div className="w-14 h-14 rounded-lg bg-white border-2 border-white shadow flex items-center justify-center text-[#0a66c2] font-black text-lg">
          {userName.charAt(0)}
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <div>
            <div className="text-[15px] font-black leading-tight">{userName}</div>
            <div className="text-[11px] text-neutral-600">Education · Riyadh</div>
            <div className="text-[11px] text-neutral-500">12,453 followers</div>
          </div>
          <button className="text-[12px] font-bold text-[#0a66c2] border border-[#0a66c2] rounded-full px-3 py-1 bg-white">
            + Follow
          </button>
        </div>
      </div>

      <div className="border-t border-neutral-200 mt-2 p-3 flex gap-2 items-start">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#0a66c2] to-[#004182] flex items-center justify-center text-white font-black">
          {userName.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold leading-tight">{userName}</div>
          <div className="text-[11px] text-neutral-500">12,453 followers</div>
          <div className="text-[11px] text-neutral-500">Now · 🌐</div>
          <div className="text-[13px] mt-2 whitespace-pre-wrap break-words" dir="auto">
            {postText || "Your company post text will appear here…"}
          </div>
        </div>
      </div>
      <div className="border-t border-b border-neutral-200">
        <img src={imageUrl} alt="post" className="w-full" />
      </div>
      <div className="px-3 py-1.5 flex items-center justify-between text-[11px] text-neutral-600">
        <span>👍❤️🎉 287</span>
        <span>52 comments · 14 reposts</span>
      </div>
      <div className="border-t border-neutral-200 grid grid-cols-4 text-[12px] font-bold text-neutral-700">
        <div className="py-2 flex items-center justify-center gap-1.5">👍 Like</div>
        <div className="py-2 flex items-center justify-center gap-1.5">💬 Comment</div>
        <div className="py-2 flex items-center justify-center gap-1.5">🔁 Repost</div>
        <div className="py-2 flex items-center justify-center gap-1.5">📤 Send</div>
      </div>
    </div>
  );
}
