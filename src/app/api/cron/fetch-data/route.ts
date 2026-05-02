// Heartbeat cron endpoint hit by Supabase pg_cron + pg_net every few minutes.
// Auth model: a single shared secret in the Authorization header. The secret is
// stored only in the runtime env (CRON_SECRET) and Supabase Vault — never in
// source. Constant-time compare blocks timing oracles. No session cookie path,
// no role check inside — possession of the secret IS the authorization.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { listDueSources } from "@/lib/scraper/db";
import { fetchSource } from "@/lib/data-sources";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization");
  if (!header) return false;
  const provided = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function runHeartbeat() {
  const due = await listDueSources();
  if (due.length === 0) {
    // Log proof-of-life every tick. Without this, an admin debugging
    // "why hasn't anything been fetched?" sees nothing in /dashboard/logs
    // and can't tell whether the cron is firing at all.
    logger.info("Cron heartbeat tick — no sources due", "Cron", { dueCount: 0 });
    return { ranAt: new Date().toISOString(), dueCount: 0, results: [] };
  }
  const results = await Promise.allSettled(
    due.map(async (s) => {
      const result = await fetchSource(s.id);
      return {
        sourceId: s.id,
        sourceName: s.name,
        articles: result.articles.length,
        error: result.error,
      };
    })
  );
  const flat = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          sourceId: due[i].id,
          sourceName: due[i].name,
          articles: 0,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        }
  );
  const errored = flat.filter((f) => f.error).length;
  logger.info(
    `Cron heartbeat: ran ${due.length} due source(s) (${errored} errored)`,
    "Cron",
    { dueCount: due.length, errored, results: flat }
  );
  return { ranAt: new Date().toISOString(), dueCount: due.length, results: flat };
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runHeartbeat();
    return NextResponse.json(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    logger.error("Cron heartbeat failed", "Cron", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET also supported so a browser test or `curl -H "Authorization: Bearer …"`
// works without specifying a method. Same auth gate.
export async function GET(request: NextRequest) {
  return POST(request);
}
