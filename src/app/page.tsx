"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { LogIn, Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const { setUser } = useAppStore();

  useEffect(() => {
    // Check if already logged in
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-bl from-primary-50 via-surface to-accent-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-bl from-primary-50 via-surface to-accent-50 p-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 text-white text-3xl font-bold mb-4 shadow-lg">
            ZTO
          </div>
          <h1 className="text-2xl font-bold text-text-primary">نظام إدارة المحتوى</h1>
          <p className="text-text-secondary mt-2">Zero to One - مرحباً بك في منصة الكتابة</p>
        </div>

        {/* Login Card */}
        <div className="card p-8">
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
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-xs text-text-tertiary text-center mb-3">حسابات تجريبية</p>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center bg-surface-tertiary rounded-lg px-3 py-2">
                <span className="text-text-secondary">مدير: admin / admin123</span>
                <button
                  type="button"
                  onClick={() => { setUsername("admin"); setPassword("admin123"); }}
                  className="text-primary-600 hover:text-primary-700 font-medium"
                >
                  استخدام
                </button>
              </div>
              <div className="flex justify-between items-center bg-surface-tertiary rounded-lg px-3 py-2">
                <span className="text-text-secondary">كاتب: writer1 / writer123</span>
                <button
                  type="button"
                  onClick={() => { setUsername("writer1"); setPassword("writer123"); }}
                  className="text-primary-600 hover:text-primary-700 font-medium"
                >
                  استخدام
                </button>
              </div>
              <div className="flex justify-between items-center bg-surface-tertiary rounded-lg px-3 py-2">
                <span className="text-text-secondary">مراجع: viewer1 / viewer123</span>
                <button
                  type="button"
                  onClick={() => { setUsername("viewer1"); setPassword("viewer123"); }}
                  className="text-primary-600 hover:text-primary-700 font-medium"
                >
                  استخدام
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
