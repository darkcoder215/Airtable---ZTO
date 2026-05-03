"use client";

// Three-way theme picker: dark (gold) / light / signal (engineering blue).
// All three themes are pure CSS-token swaps driven by data-theme on <html>;
// see globals.css for the token definitions. The user's choice persists in
// localStorage under the same key the original two-way toggle used.

import { useEffect, useState } from "react";
import { Sun, Moon, Radio } from "lucide-react";

type Theme = "dark" | "light" | "signal";

const STORAGE_KEY = "zto-theme";
const THEMES: Array<{
  key: Theme;
  // Tooltip text — used because the picker collapses to icons.
  hint: string;
  // Icon component from lucide. Sized to 16x16 in render.
  Icon: typeof Sun;
}> = [
  { key: "dark",   hint: "السمة الذهبية الداكنة",                 Icon: Moon },
  { key: "light",  hint: "السمة الفاتحة",                          Icon: Sun },
  { key: "signal", hint: "Signal Engineering — هندسي بلون أزرق",  Icon: Radio },
];

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  // Hydrate the saved preference once on mount; the SSR placeholder below
  // matches a "dark" render to avoid the well-known hydration warning.
  useEffect(() => {
    const saved = (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY)) as Theme | null;
    const initial: Theme = saved === "light" || saved === "signal" || saved === "dark" ? saved : "dark";
    setTheme(initial);
    applyTheme(initial);
    setMounted(true);
  }, []);

  function pick(next: Theme) {
    if (next === theme) return;
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage may be unavailable (private mode) — ignore
    }
  }

  if (!mounted) {
    return (
      <div
        className="inline-flex items-center bg-[var(--c-brand-lighter)] border border-[var(--c-brand-border)] rounded-lg p-0.5"
        suppressHydrationWarning
        aria-label="تبديل السمة"
      >
        <span className="px-2 py-1.5 rounded-md bg-[var(--c-brand)] text-[var(--c-txt)]">
          <Moon className="w-4 h-4" />
        </span>
      </div>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="السمة"
      className="inline-flex items-center bg-[var(--c-brand-lighter)] border border-[var(--c-brand-border)] rounded-lg p-0.5 gap-0.5"
      title="تبديل السمة"
    >
      {THEMES.map(({ key, hint, Icon }) => {
        const active = theme === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => pick(key)}
            title={hint}
            className={`px-2 py-1.5 rounded-md transition-all duration-150 flex items-center gap-1.5 text-[11px] font-bold ${
              active
                ? "bg-[var(--c-brand)] text-[var(--c-gold)] shadow-sm"
                : "text-[var(--c-txt-dim)] hover:text-[var(--c-txt)]"
            }`}
          >
            <Icon className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );
}
