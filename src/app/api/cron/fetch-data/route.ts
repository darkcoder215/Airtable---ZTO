import { NextRequest, NextResponse } from "next/server";
import { fetchAllSources } from "@/lib/data-sources";
import { logger } from "@/lib/logger";

// Force dynamic execution — cron must always hit fresh sources
export const dynamic = "force-dynamic";
// Allow up to 5 minutes for the full sweep (Vercel max for hobby is 300s)
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // If no secret is configured, only allow Vercel's internal cron header
  // (Vercel attaches Authorization: Bearer $CRON_SECRET when CRON_SECRET is set,
  //  and x-vercel-cron: 1 on every cron invocation regardless).
  const authHeader = request.headers.get("authorization");
  const vercelCronHeader = request.headers.get("x-vercel-cron");

  if (secret) {
    return authHeader === `Bearer ${secret}`;
  }
  // Fallback: trust Vercel's signed cron header when no secret is configured.
  return vercelCronHeader === "1";
}

async function runCron(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const results = await fetchAllSources();
    const totalArticles = results.reduce(
      (sum, r) => sum + r.result.articles.length,
      0
    );
    const failed = results.filter((r) => r.result.error);
    const durationMs = Date.now() - startedAt;

    logger.info(
      `Cron fetched ${totalArticles} articles from ${results.length} sources (${failed.length} errored) in ${durationMs}ms`,
      "Cron"
    );

    return NextResponse.json({
      ok: true,
      sourcesProcessed: results.length,
      totalArticles,
      errored: failed.length,
      durationMs,
      results: results.map((r) => ({
        sourceId: r.sourceId,
        sourceName: r.sourceName,
        articleCount: r.result.articles.length,
        error: r.result.error,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown cron error";
    logger.error("Cron fetch-data failed", "Cron", err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return runCron(request);
}

export async function POST(request: NextRequest) {
  return runCron(request);
}
