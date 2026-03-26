type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  details?: unknown;
  userId?: string;
}

// In-memory log store (limited to last 500 entries)
const logStore: LogEntry[] = [];
const MAX_LOGS = 500;

function createEntry(
  level: LogLevel,
  message: string,
  context?: string,
  details?: unknown,
  userId?: string
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
    details,
    userId,
  };
}

function addLog(entry: LogEntry) {
  logStore.push(entry);
  if (logStore.length > MAX_LOGS) {
    logStore.shift();
  }

  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]${entry.context ? ` [${entry.context}]` : ""}`;
  const msg = `${prefix} ${entry.message}`;

  switch (entry.level) {
    case "error":
      console.error(msg, entry.details || "");
      break;
    case "warn":
      console.warn(msg, entry.details || "");
      break;
    case "debug":
      console.debug(msg, entry.details || "");
      break;
    default:
      console.log(msg, entry.details || "");
  }
}

export const logger = {
  info(message: string, context?: string, details?: unknown, userId?: string) {
    addLog(createEntry("info", message, context, details, userId));
  },
  warn(message: string, context?: string, details?: unknown, userId?: string) {
    addLog(createEntry("warn", message, context, details, userId));
  },
  error(message: string, context?: string, details?: unknown, userId?: string) {
    addLog(createEntry("error", message, context, details, userId));
  },
  debug(message: string, context?: string, details?: unknown, userId?: string) {
    addLog(createEntry("debug", message, context, details, userId));
  },
  getLogs(level?: LogLevel, limit = 100): LogEntry[] {
    let filtered = level ? logStore.filter((l) => l.level === level) : [...logStore];
    return filtered.slice(-limit).reverse();
  },
  clear() {
    logStore.length = 0;
  },
};
