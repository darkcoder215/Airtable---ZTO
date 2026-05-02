"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Database, Shield, Bot, ScrollText, LogOut, Menu, X, Loader2, User, Rss, Building2, BarChart3, Wand2 } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV = [
  { href: "/dashboard", label: "قاعدة البيانات", icon: Database },
  { href: "/dashboard/brands", label: "العلامات والمصادر", icon: Building2 },
  { href: "/dashboard/data-sources", label: "مصادر البيانات", icon: Rss },
  { href: "/dashboard/analytics", label: "التحليلات", icon: BarChart3 },
  { href: "/dashboard/access-control", label: "الصلاحيات", icon: Shield, admin: true },
  { href: "/dashboard/agents", label: "وكلاء الكتابة", icon: Bot },
  { href: "/dashboard/image-generator", label: "مولّد الصور", icon: Wand2 },
  { href: "/dashboard/logs", label: "السجلات", icon: ScrollText, admin: true },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, setUser, sidebarOpen, toggleSidebar, logout, toasts, removeToast } = useAppStore();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth").then((r) => r.json())
      .then((d) => { if (d.user) setUser(d.user); else window.location.href = "/"; })
      .catch(() => { window.location.href = "/"; })
      .finally(() => setLoading(false));
  }, [setUser]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
      </div>
    );
  }

  const navItems = NAV.filter((n) => !n.admin || user.role === "admin");
  const roleName = user.role === "admin" ? "مدير" : user.role === "editor" ? "محرر" : "مراجع";

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 right-0 z-40 w-[240px] bg-[#151515] border-l border-neutral-800 flex flex-col transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-0"}`}>
        {/* Logo */}
        <div className="px-5 py-5 border-b border-neutral-800">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shrink-0">
                <span className="text-black text-[7px] font-black leading-none text-center">صفر<br />لـواحد</span>
              </div>
              <div>
                <div className="text-white text-[14px] font-black leading-tight">صفر لـواحد</div>
                <div className="text-neutral-600 text-[9px] font-bold tracking-[0.15em]">ZERO TO ONE</div>
              </div>
            </Link>
            <button onClick={toggleSidebar} className="lg:hidden text-neutral-500 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((n) => {
            const active = pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href));
            return (
              <Link key={n.href} href={n.href} className={`zto-nav-item ${active ? "zto-nav-active" : ""}`}>
                <n.icon className="w-[18px] h-[18px] shrink-0" />
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-neutral-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-[#232323] flex items-center justify-center">
              <User className="w-4 h-4 text-neutral-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold text-white truncate">{user.name}</div>
              <div className="text-[10px] text-neutral-500 font-bold tracking-wider uppercase">{roleName}</div>
            </div>
          </div>
          <button onClick={logout} className="zto-btn zto-btn-ghost w-full text-red-400 hover:!text-red-400 hover:!bg-[rgba(248,113,113,0.1)] text-[12px]">
            <LogOut className="w-3.5 h-3.5" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={toggleSidebar} />}

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="bg-[#151515] border-b border-neutral-800 px-6 h-[56px] flex items-center gap-4 sticky top-0 z-20">
          <button onClick={toggleSidebar} className="lg:hidden text-neutral-500 hover:text-white">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <ThemeToggle />
          <span className="zto-badge zto-badge-gold">{roleName}</span>
          <span className="text-[13px] text-neutral-400 font-bold hidden sm:inline">{user.name}</span>
        </header>

        <div className="flex-1 p-6 overflow-auto">{children}</div>
      </main>

      {/* Toasts */}
      <div className="fixed bottom-5 left-5 z-[60] space-y-2">
        {toasts.map((t) => (
          <div key={t.id} className="zto-toast cursor-pointer" onClick={() => removeToast(t.id)}>
            <div className={`w-2 h-2 rounded-full shrink-0 ${t.type === "error" ? "bg-red-400" : t.type === "success" ? "bg-emerald-400" : t.type === "warning" ? "bg-amber-400" : "bg-blue-400"}`} />
            <span className={`text-[13px] font-semibold ${t.type === "error" ? "text-red-400" : t.type === "success" ? "text-emerald-400" : t.type === "warning" ? "text-amber-400" : "text-blue-400"}`}>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
