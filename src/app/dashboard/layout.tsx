"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Database, Shield, Bot, ScrollText, LogOut, Menu, X, Loader2, User, Rss, Building2, BarChart3, Wand2, Users, ChevronsRight, ChevronsLeft, PenTool, Bell, ListChecks } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TaskBell } from "@/components/TaskBell";

type NavRole = "admin" | "editor" | "content_writer" | "viewer";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Database;
  // Roles allowed to see this nav entry. Missing/empty means "everyone".
  // content_writer is intentionally locked down — see the explicit
  // allowlist below.
  roles?: NavRole[];
  // When true, the entry is gated by the per-user `tasksEnabled` flag
  // in addition to the role check. Admins always pass this gate.
  requireTasksEnabled?: boolean;
}

// The full nav list. The render path below filters by role:
//   admin  → everything
//   editor → everything except admin-only items (Access control + Logs)
//   content_writer → ONLY the items where roles[] includes content_writer
//   viewer → everything except admin-only items
const NAV: NavItem[] = [
  { href: "/dashboard",                  label: "قاعدة البيانات",     icon: Database,    roles: ["admin", "editor", "content_writer", "viewer"] },
  { href: "/dashboard/brands",           label: "العلامات والمصادر",  icon: Building2 },
  { href: "/dashboard/data-sources",     label: "مصادر البيانات",     icon: Rss },
  { href: "/dashboard/analytics",        label: "التحليلات",           icon: BarChart3 },
  { href: "/dashboard/access-control",   label: "الصلاحيات",           icon: Shield,      roles: ["admin"] },
  { href: "/dashboard/views",            label: "لوحات الفريق",        icon: Users },
  { href: "/dashboard/tasks",            label: "المهام",              icon: ListChecks,  roles: ["admin", "editor", "content_writer", "viewer"], requireTasksEnabled: true },
  { href: "/dashboard/agents",           label: "وكلاء الكتابة",       icon: Bot,         roles: ["admin", "editor", "content_writer"] },
  { href: "/dashboard/image-generator",  label: "مولّد الصور",         icon: Wand2,       roles: ["admin", "editor", "content_writer"] },
  { href: "/dashboard/logs",             label: "السجلات",             icon: ScrollText,  roles: ["admin"] },
];

const ROLE_LABEL: Record<NavRole, string> = {
  admin: "مدير",
  editor: "محرر",
  content_writer: "كاتب محتوى",
  viewer: "مراجع",
};

const ROLE_ICON: Record<NavRole, typeof User> = {
  admin: Shield,
  editor: User,
  content_writer: PenTool,
  viewer: User,
};

const SIDEBAR_PREF_KEY = "zto-sidebar-collapsed";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, setUser, sidebarOpen, toggleSidebar, logout, toasts, removeToast } = useAppStore();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  // Desktop-only collapse — distinct from sidebarOpen (which is the
  // mobile slide-in toggle). When collapsed the rail shrinks to 64px
  // and only icons remain visible. Persisted to localStorage so the
  // user's choice survives reloads.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_PREF_KEY) === "1");
    } catch {}
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((cur) => {
      const next = !cur;
      try {
        localStorage.setItem(SIDEBAR_PREF_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    fetch("/api/auth").then((r) => r.json())
      .then((d) => { if (d.user) setUser(d.user); else window.location.href = "/"; })
      .catch(() => { window.location.href = "/"; })
      .finally(() => setLoading(false));
  }, [setUser]);

  // Hard-stop content_writers when they navigate to an off-limits route
  // (typing the URL by hand, bookmark, or a stale link). We bounce them
  // back to /dashboard without flashing the page they shouldn't see.
  useEffect(() => {
    if (!user || user.role !== "content_writer") return;
    const allowed = NAV
      .filter((n) => n.roles?.includes("content_writer"))
      .filter((n) => !n.requireTasksEnabled || user.tasksEnabled === true)
      .map((n) => n.href);
    const ok = allowed.some((href) => pathname === href || pathname.startsWith(`${href}/`));
    if (!ok && pathname !== "/dashboard") {
      window.location.href = "/dashboard";
    }
  }, [pathname, user]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
      </div>
    );
  }

  const role = (user.role as NavRole) ?? "viewer";
  const navItems = NAV.filter((n) => {
    if (n.roles && !n.roles.includes(role)) return false;
    if (!n.roles && role === "content_writer") return false;
    // Per-user gate: Tasks tab only renders when the admin enabled it
    // (admins always see it so they can manage assignments).
    if (n.requireTasksEnabled && role !== "admin" && user.tasksEnabled !== true) {
      return false;
    }
    return true;
  });
  const roleName = ROLE_LABEL[role] ?? role;
  const RoleIcon = ROLE_ICON[role] ?? User;
  const railWidth = collapsed ? "w-[64px]" : "w-[240px]";

  return (
    <div className="min-h-screen flex">
      {/* Subtle geometric backdrop — sits behind everything via z-index:-1 */}
      <div className="zto-grid-backdrop" aria-hidden />
      {/* Sidebar */}
      <aside
        data-zto-chrome="sidebar"
        className={`fixed lg:static inset-y-0 right-0 z-40 ${railWidth} bg-[#151515] border-l border-neutral-800 flex flex-col transition-all duration-200 ${
          sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-0"
        } ${sidebarOpen ? "!w-[240px]" : ""} lg:${collapsed ? "w-[64px]" : "w-[240px]"}`}
      >
        {/* Logo */}
        <div className="px-3 py-5 border-b border-neutral-800">
          <div className="flex items-center justify-between gap-2">
            <Link href="/dashboard" className={`flex items-center gap-3 min-w-0 ${collapsed ? "lg:justify-center lg:flex-1" : ""}`}>
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shrink-0">
                <span className="text-black text-[7px] font-black leading-none text-center">صفر<br />لـواحد</span>
              </div>
              <div className={`min-w-0 ${collapsed ? "lg:hidden" : ""}`}>
                <div className="text-white text-[14px] font-black leading-tight truncate">صفر لـواحد</div>
                <div className="text-neutral-600 text-[9px] font-bold tracking-[0.15em]">ZERO TO ONE</div>
              </div>
            </Link>
            <button onClick={toggleSidebar} className="lg:hidden text-neutral-500 hover:text-white shrink-0"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.map((n) => {
            const active = pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href));
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`zto-nav-item ${active ? "zto-nav-active" : ""} ${collapsed ? "lg:justify-center lg:px-2" : ""}`}
                title={collapsed ? n.label : undefined}
              >
                <n.icon className="w-[18px] h-[18px] shrink-0" />
                <span className={collapsed ? "lg:hidden" : ""}>{n.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-neutral-800">
          <div className={`flex items-center gap-3 mb-3 ${collapsed ? "lg:justify-center" : ""}`}>
            <div className="w-9 h-9 rounded-xl bg-[#232323] flex items-center justify-center shrink-0">
              <RoleIcon className="w-4 h-4 text-neutral-400" />
            </div>
            <div className={`min-w-0 flex-1 ${collapsed ? "lg:hidden" : ""}`}>
              <div className="text-[13px] font-bold text-white truncate">{user.name}</div>
              <div className="text-[10px] text-neutral-500 font-bold tracking-wider uppercase">{roleName}</div>
            </div>
          </div>
          <button
            onClick={logout}
            className={`zto-btn zto-btn-ghost w-full text-red-400 hover:!text-red-400 hover:!bg-[rgba(248,113,113,0.1)] text-[12px] ${
              collapsed ? "lg:!px-2" : ""
            }`}
            title={collapsed ? "تسجيل الخروج" : undefined}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className={collapsed ? "lg:hidden" : ""}>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={toggleSidebar} />}

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header data-zto-chrome="header" className="bg-[#151515] border-b border-neutral-800 px-6 h-[56px] flex items-center gap-4 sticky top-0 z-20">
          <button onClick={toggleSidebar} className="lg:hidden text-neutral-500 hover:text-white">
            <Menu className="w-5 h-5" />
          </button>
          {/* Desktop collapse — flip the rail down to 64px so tables can
              take the full screen. The icon points the direction the
              rail will move (RTL: collapse = right) for clarity. */}
          <button
            onClick={toggleCollapsed}
            className="hidden lg:inline-flex items-center justify-center w-8 h-8 rounded-md text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
            title={collapsed ? "توسيع الشريط الجانبي" : "طيّ الشريط الجانبي"}
          >
            {collapsed ? <ChevronsLeft className="w-4 h-4" /> : <ChevronsRight className="w-4 h-4" />}
          </button>
          <div className="flex-1" />
          <TaskBell enabled={role === "admin" || user.tasksEnabled === true} />
          <ThemeToggle />
          <span className="zto-badge zto-badge-gold">{roleName}</span>
          <span className="text-[13px] text-neutral-400 font-bold hidden sm:inline">{user.name}</span>
        </header>

        <div data-zto-chrome="main" className="flex-1 p-6 overflow-auto">{children}</div>
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
