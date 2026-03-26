"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Database,
  Shield,
  Bot,
  ScrollText,
  LogOut,
  Menu,
  X,
  Loader2,
  User,
  ChevronLeft,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "قاعدة البيانات", icon: Database, desc: "عرض وتعديل البيانات" },
  { href: "/dashboard/access-control", label: "الصلاحيات", icon: Shield, desc: "إدارة الوصول", adminOnly: true },
  { href: "/dashboard/agents", label: "وكلاء الكتابة", icon: Bot, desc: "الذكاء الاصطناعي" },
  { href: "/dashboard/logs", label: "السجلات", icon: ScrollText, desc: "سجل النظام", adminOnly: true },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, setUser, sidebarOpen, toggleSidebar, logout, toasts, removeToast } = useAppStore();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user);
        } else {
          window.location.href = "/";
        }
      })
      .catch(() => {
        window.location.href = "/";
      })
      .finally(() => setLoading(false));
  }, [setUser]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-zto-black)]">
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-zto-gray-500)] mx-auto mb-3" />
          <p className="text-[var(--color-zto-gray-600)] text-xs font-bold">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  const filteredNav = NAV_ITEMS.filter((item) => !item.adminOnly || user.role === "admin");
  const currentPage = filteredNav.find(
    (item) => pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))
  );

  const roleLabel = user.role === "admin" ? "مدير" : user.role === "editor" ? "محرر" : "مراجع";

  return (
    <div className="min-h-screen bg-[var(--color-zto-black)] flex">
      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 right-0 z-40 w-64 bg-[var(--color-zto-charcoal)] border-l border-[var(--color-zto-gray-800)] flex flex-col transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-0"
        }`}
      >
        {/* Brand header */}
        <div className="p-5 border-b border-[var(--color-zto-gray-800)]">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-3 group">
              <div className="w-9 h-9 bg-[var(--color-zto-white)] rounded-lg flex items-center justify-center">
                <span className="text-[var(--color-zto-black)] text-[0.5rem] font-black leading-none text-center">
                  صفر<br/>لـواحد
                </span>
              </div>
              <div>
                <h2 className="text-[var(--color-zto-white)] font-black text-sm leading-none">صفر لـواحد</h2>
                <p className="text-[var(--color-zto-gray-600)] text-[0.6rem] font-bold mt-0.5 tracking-wider">ZERO TO ONE</p>
              </div>
            </Link>
            <button onClick={toggleSidebar} className="lg:hidden text-[var(--color-zto-gray-500)] hover:text-[var(--color-zto-white)]">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 mt-2">
          {filteredNav.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${isActive ? "sidebar-link-active" : "sidebar-link-inactive"}`}
              >
                <Icon className="w-[1.1rem] h-[1.1rem] shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="block text-[0.8125rem]">{item.label}</span>
                </div>
                {isActive && <ChevronLeft className="w-3.5 h-3.5 shrink-0 opacity-50" />}
              </Link>
            );
          })}
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-[var(--color-zto-gray-800)]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-zto-gray-800)] flex items-center justify-center">
              <User className="w-4 h-4 text-[var(--color-zto-gray-400)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[var(--color-zto-white)] truncate">{user.name}</p>
              <p className="text-[0.65rem] text-[var(--color-zto-gray-500)] font-bold uppercase tracking-wider">{roleLabel}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="btn-ghost w-full text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] hover:text-[var(--color-danger)] text-xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={toggleSidebar} />
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="bg-[var(--color-zto-charcoal)] border-b border-[var(--color-zto-gray-800)] px-6 py-3 flex items-center gap-4 sticky top-0 z-20">
          <button onClick={toggleSidebar} className="text-[var(--color-zto-gray-500)] hover:text-[var(--color-zto-white)] lg:hidden">
            <Menu className="w-5 h-5" />
          </button>

          {/* Page title */}
          <div className="flex-1 flex items-center gap-3">
            {currentPage && (
              <>
                <currentPage.icon className="w-4 h-4 text-[var(--color-accent)]" />
                <h1 className="text-sm font-black text-[var(--color-zto-white)]">{currentPage.label}</h1>
                <span className="hidden sm:inline text-[var(--color-zto-gray-600)] text-xs font-medium">— {currentPage.desc}</span>
              </>
            )}
          </div>

          {/* User badge */}
          <div className="flex items-center gap-2">
            <span className="badge-accent">{roleLabel}</span>
            <span className="text-xs text-[var(--color-zto-gray-400)] font-bold hidden sm:inline">{user.name}</span>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 p-6 overflow-auto">{children}</div>
      </main>

      {/* Toasts */}
      <div className="fixed bottom-4 left-4 z-[60] space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="toast cursor-pointer"
            onClick={() => removeToast(toast.id)}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full shrink-0 animate-pulse-dot ${
                toast.type === "error" ? "bg-[var(--color-danger)]"
                  : toast.type === "success" ? "bg-[var(--color-success)]"
                  : toast.type === "warning" ? "bg-[var(--color-warning)]"
                  : "bg-[var(--color-info)]"
              }`}
            />
            <span
              className={`text-sm font-medium ${
                toast.type === "error" ? "text-[var(--color-danger)]"
                  : toast.type === "success" ? "text-[var(--color-success)]"
                  : toast.type === "warning" ? "text-[var(--color-warning)]"
                  : "text-[var(--color-info)]"
              }`}
            >
              {toast.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
