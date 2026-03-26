"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { LogIn, Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const { setUser } = useAppStore();

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user);
          window.location.href = "/dashboard";
        }
      })
      .catch(() => {})
      .finally(() => setCheckingSession(false));
  }, [setUser]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "حدث خطأ في تسجيل الدخول");
        return;
      }

      setUser(data.user);
      window.location.href = "/dashboard";
    } catch {
      setError("حدث خطأ في الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-zto-black)]">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--color-zto-gray-500)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[var(--color-zto-black)] relative grain overflow-hidden">
      {/* Left side — Brand panel */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center relative">
        <div className="absolute inset-0 bg-[var(--color-zto-charcoal)]" />
        {/* Decorative grain/pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`
        }} />

        <div className="relative z-10 text-center px-12 max-w-md">
          {/* Logo */}
          <div className="mb-12">
            <h1 className="text-6xl font-black text-[var(--color-zto-white)] leading-tight tracking-tight">
              صفر
            </h1>
            <div className="flex items-center justify-center gap-1 -mt-2">
              <h1 className="text-6xl font-black text-[var(--color-zto-white)] leading-tight tracking-tight">
                لـواحد
              </h1>
              <span className="text-lg font-black text-[var(--color-accent)] mt-[-1.5rem]">١٠</span>
            </div>
          </div>

          <div className="divider mb-8" />

          <p className="text-[var(--color-zto-gray-400)] text-sm leading-relaxed font-medium">
            منصة إدارة المحتوى الداخلية لفريق الكتابة والتحرير.
            <br />
            تحكّم في البيانات، أدِر الصلاحيات، واستخدم الذكاء الاصطناعي.
          </p>
        </div>

        {/* Corner decoration */}
        <div className="absolute bottom-8 left-8 text-[var(--color-zto-gray-700)] text-[0.65rem] font-bold tracking-widest uppercase">
          Zero to One &copy; {new Date().getFullYear()}
        </div>
      </div>

      {/* Right side — Login form */}
      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-10">
            <h1 className="text-4xl font-black text-[var(--color-zto-white)] leading-tight">
              صفر لـواحد
            </h1>
            <p className="text-[var(--color-zto-gray-500)] text-xs mt-2 font-medium">منصة إدارة المحتوى</p>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-black text-[var(--color-zto-white)] mb-1">تسجيل الدخول</h2>
            <p className="text-[var(--color-zto-gray-500)] text-sm font-medium">أدخل بياناتك للوصول إلى المنصة</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="label">اسم المستخدم</label>
              <input
                type="text"
                className="input"
                placeholder="أدخل اسم المستخدم"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="label">كلمة المرور</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="input pl-10"
                  placeholder="أدخل كلمة المرور"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-zto-gray-600)] hover:text-[var(--color-zto-gray-300)] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-[var(--color-danger-muted)] border border-[color-mix(in_srgb,var(--color-danger)_30%,transparent)] text-[var(--color-danger)] rounded-lg px-4 py-3 text-sm font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-sm"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  تسجيل الدخول
                  <ArrowLeft className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="mt-8 pt-6 border-t border-[var(--color-zto-gray-800)]">
            <p className="text-[0.6875rem] text-[var(--color-zto-gray-600)] mb-3 font-bold uppercase tracking-wider">حسابات تجريبية</p>
            <div className="space-y-2">
              {[
                { label: "مدير النظام", user: "admin", pass: "admin123", badge: "مدير" },
                { label: "أحمد الكاتب", user: "writer1", pass: "writer123", badge: "محرر" },
                { label: "خالد المراجع", user: "viewer1", pass: "viewer123", badge: "مراجع" },
              ].map((cred) => (
                <button
                  key={cred.user}
                  type="button"
                  onClick={() => { setUsername(cred.user); setPassword(cred.pass); }}
                  className="w-full flex items-center justify-between bg-[var(--color-zto-dark)] hover:bg-[var(--color-zto-gray-800)] border border-[var(--color-zto-gray-800)] hover:border-[var(--color-zto-gray-700)] rounded-lg px-4 py-2.5 transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span className="badge-primary">{cred.badge}</span>
                    <span className="text-[var(--color-zto-gray-300)] text-sm font-medium">{cred.label}</span>
                  </div>
                  <ArrowLeft className="w-3.5 h-3.5 text-[var(--color-zto-gray-600)] group-hover:text-[var(--color-accent)] transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
