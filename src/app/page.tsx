"use client";

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
    fetch("/api/auth").then((r) => r.json()).then((d) => {
      if (d.user) { setUser(d.user); window.location.href = "/dashboard"; }
    }).catch(() => {}).finally(() => setChecking(false));
  }, [setUser]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const d = await res.json();
      if (!res.ok) { setError(d.error); return; }
      setUser(d.user); window.location.href = "/dashboard";
    } catch { setError("فشل الاتصال بالخادم"); } finally { setLoading(false); }
  };

  if (checking) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-neutral-500" /></div>;

  return (
    <div className="min-h-screen flex">
      {/* Brand side */}
      <div className="hidden lg:flex w-[45%] bg-[#151515] items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-bl from-[#1e1e1e] via-[#151515] to-[#0d0d0d]" />
        <div className="relative z-10 text-center max-w-[340px]">
          <h1 className="text-[64px] font-black text-white leading-[1.1] tracking-tight mb-2">صفر</h1>
          <h1 className="text-[64px] font-black text-white leading-[1.1] tracking-tight">لـواحد</h1>
          <div className="w-16 h-[2px] bg-[#c9a84c] mx-auto my-8" />
          <p className="text-[15px] text-neutral-500 leading-relaxed">
            منصة إدارة المحتوى الداخلية<br />لفريق الكتابة والتحرير
          </p>
        </div>
        <div className="absolute bottom-6 left-6 text-[11px] text-neutral-700 tracking-widest font-bold">
          ZTO &copy; {new Date().getFullYear()}
        </div>
      </div>

      {/* Form side */}
      <div className="flex-1 flex items-center justify-center p-8 bg-[#111]">
        <div className="w-full max-w-[380px]">
          <div className="lg:hidden text-center mb-10">
            <h1 className="text-4xl font-black text-white">صفر لـواحد</h1>
            <p className="text-neutral-500 text-sm mt-1">منصة إدارة المحتوى</p>
          </div>

          <h2 className="text-[22px] font-black text-white mb-1">تسجيل الدخول</h2>
          <p className="text-neutral-500 text-[14px] mb-8">أدخل بياناتك للوصول إلى المنصة</p>

          <form onSubmit={login} className="space-y-5">
            <div>
              <label className="zto-label">اسم المستخدم</label>
              <input type="text" className="zto-input" placeholder="أدخل اسم المستخدم" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
            </div>
            <div>
              <label className="zto-label">كلمة المرور</label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} className="zto-input" style={{ paddingLeft: 40 }} placeholder="أدخل كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-300 transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && <div className="zto-alert zto-alert-err">{error}</div>}
            <button type="submit" disabled={loading} className="zto-btn zto-btn-fill w-full">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>تسجيل الدخول</span><ArrowLeft className="w-4 h-4" /></>}
            </button>
          </form>

          <p className="text-[11px] text-neutral-600 mt-8 leading-relaxed text-center">
            حسابك الإداري الأول يُنشأ تلقائياً من متغيّرات البيئة عند أول إقلاع.
            بعد الدخول يمكنك إضافة بقية المستخدمين من صفحة الصلاحيات.
          </p>
        </div>
      </div>
    </div>
  );
}
