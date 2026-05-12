"use client";

// Topbar bell that polls /api/tasks?action=unread once a minute and
// shows a count badge when the assignee has unread tasks. Clicking it
// jumps to the tasks page; the page itself is responsible for clearing
// the count via mark-read.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

const POLL_MS = 60_000;

interface TaskBellProps {
  enabled: boolean;
}

export function TaskBell({ enabled }: TaskBellProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/tasks?action=unread", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { count?: number };
        if (!cancelled) setCount(typeof j.count === "number" ? j.count : 0);
      } catch {
        // Network blip — keep prior count, retry next tick.
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <Link
      href="/dashboard/tasks"
      className="relative inline-flex items-center justify-center w-8 h-8 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
      title={count > 0 ? `${count} مهمّة جديدة` : "المهام"}
    >
      <Bell className="w-4 h-4" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-amber-400 text-black text-[9px] font-black flex items-center justify-center leading-none">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
