"use client";

// Two-theme picker:
//   editorial-dark  → Editorial serif, dark (default)
//   editorial-light → Editorial serif, light
//
// Both themes are pure CSS-token swaps driven by data-theme on <html>;
// see globals.css for the token definitions. The user's choice persists
// in localStorage under the same key the original toggles used.

import { useEffect, useState } from "react";
import { BookOpen, Feather } from "lucide-react";

type Theme = "editorial-dark" | "editorial-light";

const STORAGE_KEY = "zto-theme";
const VALID: ReadonlySet<Theme> = new Set(["editorial-dark", "editorial-light"]);
const DEFAULT_THEME: Theme = "editorial-dark";

interface ThemeOption {
  key: Theme;
  hint: string;
  Icon: typeof BookOpen;
}

const THEMES: ThemeOption[] = [
  { key: "editorial-dark",  hint: "تحريري · داكن (سيريف)", Icon: BookOpen },
  { key: "editorial-light", hint: "تحريري · فاتح (سيريف)", Icon: Feather  },
];

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [mounted, setMounted] = useState(false);

  // Hydrate the saved preference once on mount; the SSR placeholder
  // below matches a default render to avoid the well-known hydration
  // warning.
  useEffect(() => {
    const saved = (typeof window !== "undefined"
      ? localStorage.getItem(STORAGE_KEY)
      : null) as Theme | null;
    const initial: Theme = saved && VALID.has(saved) ? saved : DEFAULT_THEME;
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
          <BookOpen className="w-4 h-4" />
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
