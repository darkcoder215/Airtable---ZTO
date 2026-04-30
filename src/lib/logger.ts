// Persistent logger backed by Supabase (scraper_logs).
// Public methods (info/warn/error/debug) keep a sync signature — the DB write
// is fire-and-forget so callers don't need to await. Console output happens
// immediately for live visibility.

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type LogLevel = "info" | "warn" | "error" | "debug";
type LogDetailsJson = Database["public"]["Tables"]["scraper_logs"]["Insert"]["details"];

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  details?: unknown;
  userId?: string;
}

function consoleEcho(level: LogLevel, message: string, context?: string, details?: unknown) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]${context ? ` [${context}]` : ""}`;
  const msg = `${prefix} ${message}`;
  switch (level) {
    case "error":
      console.error(msg, details ?? "");
      break;
    case "warn":
      console.warn(msg, details ?? "");
      break;
    case "debug":
      console.debug(msg, details ?? "");
      break;
    default:
      console.log(msg, details ?? "");
  }
}

function serialize(details: unknown): Record<string, unknown> {
  if (details == null) return {};
  if (details instanceof Error) {
    return { name: details.name, message: details.message, stack: details.stack };
  }
  if (typeof details === "object") return details as Record<string, unknown>;
  return { value: String(details) };
}

function persist(level: LogLevel, message: string, context?: string, details?: unknown, userId?: string) {
  if (!isSupabaseConfigured()) return;
  // Fire-and-forget — never throw from logger.
  const sb = getSupabaseAdmin();
  void sb
    .from("scraper_logs")
    .insert({
      level,
      message: message.slice(0, 4000),
      context: context ?? null,
      details: serialize(details) as LogDetailsJson,
      user_id: userId ?? null,
    })
    .then(({ error }) => {
      if (error) console.error("[logger] failed to persist log:", error.message);
    });
}

export const logger = {
  info(message: string, context?: string, details?: unknown, userId?: string) {
    consoleEcho("info", message, context, details);
    persist("info", message, context, details, userId);
  },
  warn(message: string, context?: string, details?: unknown, userId?: string) {
    consoleEcho("warn", message, context, details);
    persist("warn", message, context, details, userId);
  },
  error(message: string, context?: string, details?: unknown, userId?: string) {
    consoleEcho("error", message, context, details);
    persist("error", message, context, details, userId);
  },
  debug(message: string, context?: string, details?: unknown, userId?: string) {
    consoleEcho("debug", message, context, details);
    persist("debug", message, context, details, userId);
  },
  async getLogs(level?: LogLevel, limit = 100): Promise<LogEntry[]> {
    if (!isSupabaseConfigured()) return [];
    const sb = getSupabaseAdmin();
    let q = sb
      .from("scraper_logs")
      .select("level, message, context, details, user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (level) q = q.eq("level", level);
    const { data, error } = await q;
    if (error) {
      console.error("[logger] getLogs error:", error.message);
      return [];
    }
    return (data ?? []).map((r) => ({
      timestamp: r.created_at,
      level: r.level as LogLevel,
      message: r.message,
      context: r.context ?? undefined,
      details: r.details,
      userId: r.user_id ?? undefined,
    }));
  },
};
