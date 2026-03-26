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
  ChevronLeft,
  User,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "قاعدة البيانات", icon: Database },
  { href: "/dashboard/access-control", label: "إدارة الصلاحيات", icon: Shield, adminOnly: true },
  { href: "/dashboard/agents", label: "وكلاء الكتابة", icon: Bot },
  { href: "/dashboard/logs", label: "سجل النظام", icon: ScrollText, adminOnly: true },
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
      <div className="min-h-screen flex items-center justify-center bg-surface-secondary">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  const filteredNav = NAV_ITEMS.filter((item) => !item.adminOnly || user.role === "admin");

  return (
    <div className="min-h-screen bg-surface-secondary flex">
      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 right-0 z-40 w-72 bg-surface border-l border-border flex flex-col transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden"
        }`}
      >
        {/* Brand */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 text-white flex items-center justify-center font-bold text-sm">
                ZTO
              </div>
              <div>
                <h2 className="font-bold text-text-primary text-sm">نظام إدارة المحتوى</h2>
                <p className="text-xs text-text-tertiary">Zero to One</p>
              </div>
            </div>
            <button onClick={toggleSidebar} className="lg:hidden text-text-tertiary hover:text-text-primary">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {filteredNav.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={isActive ? "sidebar-link-active" : "sidebar-link-inactive"}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
                {isActive && <ChevronLeft className="w-4 h-4 mr-auto" />}
              </Link>
            );
          })}
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{user.name}</p>
              <p className="text-xs text-text-tertiary">
                {user.role === "admin" ? "مدير" : user.role === "editor" ? "محرر" : "مراجع"}
              </p>
            </div>
          </div>
          <button onClick={logout} className="btn-ghost w-full text-red-600 hover:bg-red-50 hover:text-red-700">
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0">
        {/* Top bar */}
        <header className="bg-surface border-b border-border px-6 py-4 flex items-center gap-4 sticky top-0 z-20">
          <button onClick={toggleSidebar} className="text-text-secondary hover:text-text-primary lg:hidden">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <span className="badge-primary">{user.role === "admin" ? "مدير" : user.role === "editor" ? "محرر" : "مراجع"}</span>
            <span className="text-sm text-text-secondary">{user.name}</span>
          </div>
        </header>

        {/* Page content */}
        <div className="p-6">{children}</div>
      </main>

      {/* Toasts */}
      <div className="fixed bottom-4 left-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast cursor-pointer ${
              toast.type === "error"
                ? "border-red-200 bg-red-50"
                : toast.type === "success"
                ? "border-green-200 bg-green-50"
                : toast.type === "warning"
                ? "border-amber-200 bg-amber-50"
                : "border-blue-200 bg-blue-50"
            }`}
            onClick={() => removeToast(toast.id)}
          >
            <span
              className={`text-sm ${
                toast.type === "error"
                  ? "text-red-700"
                  : toast.type === "success"
                  ? "text-green-700"
                  : toast.type === "warning"
                  ? "text-amber-700"
                  : "text-blue-700"
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
