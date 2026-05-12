import { create } from "zustand";

interface UserInfo {
  id: string;
  username: string;
  name: string;
  role: "admin" | "editor" | "content_writer" | "viewer";
  email: string;
  // For content_writer accounts this carries the explicit list of
  // Airtable table IDs the user is allowed to see. NULL = no
  // restriction (admin/editor/viewer roles already grant full access).
  allowedTableIds?: string[] | null;
  // True when the Tasks tab + bell are visible for this user. Default
  // true for content_writer; admin can flip per user from access-control.
  tasksEnabled?: boolean;
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

interface AppState {
  user: UserInfo | null;
  isAuthenticated: boolean;
  selectedBaseId: string | null;
  selectedTableId: string | null;
  sidebarOpen: boolean;
  toasts: Toast[];

  setUser: (user: UserInfo | null) => void;
  setSelectedBase: (baseId: string | null) => void;
  setSelectedTable: (tableId: string | null) => void;
  toggleSidebar: () => void;
  addToast: (message: string, type: Toast["type"]) => void;
  removeToast: (id: string) => void;
  logout: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  isAuthenticated: false,
  selectedBaseId: null,
  selectedTableId: null,
  sidebarOpen: true,
  toasts: [],

  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setSelectedBase: (baseId) => set({ selectedBaseId: baseId, selectedTableId: null }),
  setSelectedTable: (tableId) => set({ selectedTableId: tableId }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  addToast: (message, type) => {
    const id = `toast-${Date.now()}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  logout: async () => {
    // Cookie is HttpOnly now — JS can't clear it. Call the auth route to
    // expire it server-side, then drop in-memory state and redirect home.
    try {
      await fetch("/api/auth", { method: "DELETE" });
    } catch {
      // best-effort; the redirect still happens.
    }
    set({ user: null, isAuthenticated: false, selectedBaseId: null, selectedTableId: null });
    window.location.href = "/";
  },
}));
