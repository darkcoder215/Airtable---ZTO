"use client";

// PageGuide — drop-in collapsible help card every dashboard page can use.
// Shows a friendly Arabic walkthrough of what the page does, what each
// button means, and the common workflows. Collapses to a single line so
// it doesn't get in the way once admins are familiar with the page.

import { useState } from "react";
import { BookOpen, ChevronDown, Sparkles } from "lucide-react";

export interface GuideTip {
  // Short imperative title — e.g. "أضف مصدراً جديداً".
  title: string;
  // Body in Arabic; can include inline JSX (icons, codes) so callers can
  // show keyboard shortcuts or sample tokens.
  body: React.ReactNode;
}

interface Props {
  pageName: string; // shown in the header — e.g. "مصادر البيانات"
  intro: React.ReactNode; // 1-3 lines summarising the page's purpose
  tips: GuideTip[];
  // Optional accent — when omitted defaults to amber (matches the
  // dashboard's primary highlight colour).
  accent?: "amber" | "purple" | "emerald" | "blue" | "indigo" | "pink";
  // Open by default for first-time visitors. Pass false on pages where
  // the guide should stay collapsed.
  defaultOpen?: boolean;
  // Optional storage key — if supplied, the open/closed state is
  // remembered per-browser. Useful so admins don't have to re-collapse
  // the same guide on every visit.
  storageKey?: string;
}

const ACCENTS: Record<NonNullable<Props["accent"]>, { border: string; text: string; bg: string }> = {
  amber:   { border: "border-amber-400/30",   text: "text-amber-300",   bg: "bg-amber-400/5" },
  purple:  { border: "border-purple-400/30",  text: "text-purple-300",  bg: "bg-purple-400/5" },
  emerald: { border: "border-emerald-400/30", text: "text-emerald-300", bg: "bg-emerald-400/5" },
  blue:    { border: "border-blue-400/30",    text: "text-blue-300",    bg: "bg-blue-400/5" },
  indigo:  { border: "border-indigo-400/30",  text: "text-indigo-300",  bg: "bg-indigo-400/5" },
  pink:    { border: "border-pink-400/30",    text: "text-pink-300",    bg: "bg-pink-400/5" },
};

export default function PageGuide({
  pageName,
  intro,
  tips,
  accent = "amber",
  defaultOpen = false,
  storageKey,
}: Props) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    if (!storageKey) return defaultOpen;
    const saved = window.localStorage.getItem(`pg:${storageKey}`);
    if (saved === "open") return true;
    if (saved === "closed") return false;
    return defaultOpen;
  });

  const toggle = () => {
    setOpen((cur) => {
      const next = !cur;
      if (storageKey && typeof window !== "undefined") {
        window.localStorage.setItem(`pg:${storageKey}`, next ? "open" : "closed");
      }
      return next;
    });
  };

  const a = ACCENTS[accent];

  return (
    <div
      className={`zto-card overflow-hidden transition-colors ${a.border} ${a.bg}`}
    >
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 p-4 text-right hover:bg-white/[0.02] transition-colors"
      >
        <div className={`w-9 h-9 rounded-lg ${a.bg} ${a.border} border flex items-center justify-center shrink-0`}>
          <BookOpen className={`w-4 h-4 ${a.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
            دليل الاستخدام: {pageName}
            <Sparkles className={`w-3.5 h-3.5 ${a.text}`} />
          </p>
          <p className="text-[0.7rem] text-neutral-400 mt-0.5 line-clamp-1">
            {open ? "اضغط لإخفاء الشرح" : "اضغط لمعرفة كيف تستخدم هذه الصفحة بأقصى فاعلية"}
          </p>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-neutral-500 transition-transform shrink-0 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="border-t border-neutral-800 p-4 space-y-4">
          <div className="text-[0.75rem] text-neutral-300 leading-relaxed">{intro}</div>

          {tips.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {tips.map((t, i) => (
                <div
                  key={i}
                  className="bg-[#0d0d0d] border border-neutral-800 rounded-lg p-3 hover:border-neutral-700 transition-colors"
                >
                  <p
                    className={`text-[0.7rem] font-bold mb-1.5 flex items-center gap-1.5 ${a.text}`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full ${a.bg} ${a.border} border flex items-center justify-center text-[0.55rem] font-mono`}
                    >
                      {i + 1}
                    </span>
                    {t.title}
                  </p>
                  <div className="text-[0.65rem] text-neutral-400 leading-relaxed">
                    {t.body}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
