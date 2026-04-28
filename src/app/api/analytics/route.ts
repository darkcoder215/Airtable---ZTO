import { NextRequest, NextResponse } from "next/server";
import {
  getDataSources,
  getArticles,
  getFilterHistory,
} from "@/lib/data-sources";
import { listBrands } from "@/lib/brands";
import { listRecords } from "@/lib/airtable";
import { verifySessionToken, getUserById } from "@/lib/auth";
import { logger } from "@/lib/logger";

const ZTO_BASE_ID = "appIpXIFs2yxyxaUm";
const APIFY_TABLE_NAME = "Apify - Websites";

function getUser(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  if (!token) return null;
  const session = verifySessionToken(token);
  if (!session) return null;
  return getUserById(session.userId);
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = getUser(request);
  if (!user) {
    return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  }

  const sources = getDataSources();
  const articles = getArticles();
  const filterHistory = getFilterHistory();
  const brands = await listBrands(true);

  // Load up to 1000 most recent records from Airtable's Apify - Websites
  // table to compute "saved per source" counts over the last 30 days.
  let savedByBrand: Record<string, number> = {};
  let savedBySource: Record<string, number> = {};
  let savedTotal = 0;
  let savedRecent7d = 0;
  try {
    const sourceNameToBrand: Record<string, string> = {};
    for (const s of sources) sourceNameToBrand[s.name] = s.brand;

    let offset: string | undefined;
    let pages = 0;
    const maxPages = 10; // up to 1000 records
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600_000;
    do {
      const result = await listRecords(ZTO_BASE_ID, APIFY_TABLE_NAME, {
        pageSize: 100,
        offset,
        filterByFormula:
          "IS_AFTER(CREATED_TIME(),DATEADD(NOW(),-30,'days'))",
        fields: ["Source"],
      });
      for (const rec of result.records) {
        const sourceName = String(rec.fields["Source"] || "");
        if (!sourceName) continue;
        savedTotal++;
        savedBySource[sourceName] = (savedBySource[sourceName] || 0) + 1;
        const brand = sourceNameToBrand[sourceName] || "Unknown";
        savedByBrand[brand] = (savedByBrand[brand] || 0) + 1;
        if (rec.createdTime) {
          const ms = new Date(rec.createdTime).getTime();
          if (!isNaN(ms) && ms >= sevenDaysAgo) savedRecent7d++;
        }
      }
      offset = result.offset;
      pages++;
    } while (offset && pages < maxPages);
  } catch (err) {
    logger.warn("Analytics: failed to load Airtable counts", "Analytics", err);
  }

  // Source-level breakdown: per-type and per-brand counts
  const byType: Record<string, number> = {};
  const byBrand: Record<string, { sources: number; active: number }> = {};
  for (const s of sources) {
    byType[s.type] = (byType[s.type] || 0) + 1;
    if (!byBrand[s.brand]) byBrand[s.brand] = { sources: 0, active: 0 };
    byBrand[s.brand].sources++;
    if (s.isActive) byBrand[s.brand].active++;
  }

  // AI filter aggregate stats (last 100 runs)
  const recentFilters = filterHistory.slice(0, 100);
  const filterTotals = recentFilters.reduce(
    (acc, f) => {
      acc.total += f.totalArticles;
      acc.passed += f.passedArticles;
      acc.rejected += f.rejectedArticles;
      return acc;
    },
    { total: 0, passed: 0, rejected: 0 }
  );

  return NextResponse.json({
    summary: {
      totalSources: sources.length,
      activeSources: sources.filter((s) => s.isActive).length,
      totalBrands: brands.length,
      articlesInMemory: articles.length,
      savedTotal30d: savedTotal,
      savedRecent7d,
      filterRunsRecent: recentFilters.length,
      filterTotals,
    },
    brands: brands.map((b) => ({
      id: b.id,
      name: b.name,
      scrapeIntervalMinutes: b.scrapeIntervalMinutes,
      sourceCount: byBrand[b.name]?.sources || 0,
      activeSourceCount: byBrand[b.name]?.active || 0,
      savedRecords30d: savedByBrand[b.name] || 0,
    })),
    byType,
    sourcesTop: sources
      .map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        brand: s.brand,
        isActive: s.isActive,
        lastFetchedAt: s.lastFetchedAt,
        savedCount30d: savedBySource[s.name] || 0,
      }))
      .sort((a, b) => b.savedCount30d - a.savedCount30d)
      .slice(0, 30),
    recentFilters: recentFilters.slice(0, 15).map((f) => ({
      id: f.id,
      sourceName: f.sourceName,
      timestamp: f.timestamp,
      totalArticles: f.totalArticles,
      passedArticles: f.passedArticles,
      rejectedArticles: f.rejectedArticles,
    })),
  });
}
