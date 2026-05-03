"use client";

// Four-way theme picker:
//   dark         → ZTO gold-on-near-black (default)
//   light        → ZTO gold-on-paper
//   signal       → Signal Engineering, dark
//   signal-light → Signal Engineering, light
//
// All four themes are pure CSS-token swaps driven by data-theme on <html>;
// see globals.css for the token definitions. The user's choice persists in
// localStorage under the same key the original toggles used. The control
// renders as a segmented pill with one icon per option; a small "ZTO"/"SIG"
// label sits between the gold pair and the signal pair so users can tell
// which family each icon belongs to at a glance.

import { useEffect, useState } from "react";
import { Sun, Moon, Radio, Cpu } from "lucide-react";

type Theme = "dark" | "light" | "signal" | "signal-light";

const STORAGE_KEY = "zto-theme";

interface ThemeOption {
  key: Theme;
  hint: string;
  Icon: typeof Sun;
  // family used for the divider label
  family: "zto" | "signal";
}

const THEMES: ThemeOption[] = [
  { key: "dark",         hint: "ZTO ذهبي · داكن",        Icon: Moon,  family: "zto"    },
  { key: "light",        hint: "ZTO ذهبي · فاتح",        Icon: Sun,   family: "zto"    },
  { key: "signal",       hint: "Signal · داكن (هندسي)",  Icon: Radio, family: "signal" },
  { key: "signal-light", hint: "Signal · فاتح (هندسي)",  Icon: Cpu,   family: "signal" },
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
    const initial: Theme =
      saved === "light" || saved === "signal" || saved === "signal-light" || saved === "dark"
        ? saved
        : "dark";
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
      {THEMES.map(({ key, hint, Icon, family }, i) => {
        const active = theme === key;
        const prevFamily = i > 0 ? THEMES[i - 1].family : null;
        const showFamilyDivider = prevFamily !== null && prevFamily !== family;
        return (
          <span key={key} className="flex items-center">
            {showFamilyDivider && (
              <span
                className="mx-1 h-3 w-px bg-[var(--c-brand-border)]"
                aria-hidden="true"
              />
            )}
            <button
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
          </span>
        );
      })}
    </div>
  );
}
