"use client";

// Login page. Single-column on every viewport — the previous two-pane
// layout with a brand-panel sidebar at lg+ was hitting responsive-class
// edge cases that left the brand panel visible on viewports where it
// shouldn't have been. A single centred card works the same on mobile
// and desktop, so there's no breakpoint footgun.

import { useState, useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { Loader2, ArrowLeft, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const { setUser } = useAppStore();

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          setUser(d.user);
          window.location.href = "/dashboard";
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [setUser]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error);
        return;
      }
      setUser(d.user);
      window.location.href = "/dashboard";
    } catch {
      setError("فشل الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight">
            صفر لـواحد
          </h1>
          <p className="text-neutral-500 text-sm mt-2">منصة إدارة المحتوى الداخلية</p>
        </div>

        <div className="zto-card p-6 sm:p-7">
          <h2 className="text-lg font-black text-white mb-1">تسجيل الدخول</h2>
          <p className="text-neutral-500 text-[13px] mb-6">
            أدخل بياناتك للوصول إلى المنصة
          </p>

          <form onSubmit={login} className="space-y-4">
            <div>
              <label className="zto-label">اسم المستخدم</label>
              <input
                type="text"
                className="zto-input"
                placeholder="أدخل اسم المستخدم"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="zto-label">كلمة المرور</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  className="zto-input"
                  style={{ paddingInlineStart: 40 }}
                  placeholder="أدخل كلمة المرور"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors"
                  style={{ insetInlineStart: 12 }}
                  aria-label={showPw ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && <div className="zto-alert zto-alert-err">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="zto-btn zto-btn-fill w-full"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>تسجيل الدخول</span>
                  <ArrowLeft className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-[11px] text-neutral-600 mt-6 leading-relaxed text-center">
          حسابك الإداري الأول يُنشأ تلقائياً من متغيّرات البيئة عند أول إقلاع.
          بعد الدخول يمكنك إضافة بقية المستخدمين من صفحة الصلاحيات.
        </p>
        <p className="text-[10px] text-neutral-700 mt-3 tracking-widest font-bold text-center">
          ZTO &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
