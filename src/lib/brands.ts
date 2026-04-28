// Brand management — persisted in Airtable table "Brands" in the same base
// as scraped content. Each brand has a scrape interval (minutes) that the
// cron uses to gate per-source fetches.

import { createRecord, listRecords, updateRecord, deleteRecord } from "./airtable";
import { logger } from "./logger";

const ZTO_BASE_ID = "appIpXIFs2yxyxaUm";
const BRANDS_TABLE_NAME = "Brands";
const FIELD_NAME = "Name";
const FIELD_INTERVAL = "Scrape Interval (Minutes)";

const DEFAULT_INTERVAL_MINUTES = 30;

export interface Brand {
  id: string;
  name: string;
  scrapeIntervalMinutes: number;
  createdAt: string;
}

// In-memory cache to avoid hitting Airtable on every request. Refreshed on
// mutations and lazily expired after CACHE_TTL_MS.
const CACHE_TTL_MS = 60_000;
let cache: { brands: Brand[]; loadedAt: number } | null = null;

function invalidateCache() {
  cache = null;
}

function recordToBrand(rec: { id: string; fields: Record<string, unknown>; createdTime: string }): Brand {
  const intervalRaw = rec.fields[FIELD_INTERVAL];
  const intervalNum =
    typeof intervalRaw === "number"
      ? intervalRaw
      : typeof intervalRaw === "string"
        ? parseInt(intervalRaw, 10)
        : DEFAULT_INTERVAL_MINUTES;
  return {
    id: rec.id,
    name: String(rec.fields[FIELD_NAME] || "").trim(),
    scrapeIntervalMinutes:
      Number.isFinite(intervalNum) && intervalNum > 0 ? intervalNum : DEFAULT_INTERVAL_MINUTES,
    createdAt: rec.createdTime,
  };
}

export async function listBrands(forceRefresh = false): Promise<Brand[]> {
  if (!forceRefresh && cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.brands;
  }
  try {
    const all: Brand[] = [];
    let offset: string | undefined;
    do {
      const result = await listRecords(ZTO_BASE_ID, BRANDS_TABLE_NAME, {
        pageSize: 100,
        offset,
      });
      for (const rec of result.records) {
        const brand = recordToBrand(rec);
        if (brand.name) all.push(brand);
      }
      offset = result.offset;
    } while (offset);
    cache = { brands: all, loadedAt: Date.now() };
    return all;
  } catch (err) {
    logger.warn(
      `Failed to load brands from Airtable — table "${BRANDS_TABLE_NAME}" may not exist yet`,
      "Brands",
      err
    );
    return [];
  }
}

export async function getBrandByName(name: string): Promise<Brand | null> {
  const brands = await listBrands();
  return brands.find((b) => b.name === name) || null;
}

export async function createBrand(
  name: string,
  scrapeIntervalMinutes: number
): Promise<Brand> {
  if (!name?.trim()) throw new Error("اسم البراند مطلوب");
  const interval =
    Number.isFinite(scrapeIntervalMinutes) && scrapeIntervalMinutes > 0
      ? Math.floor(scrapeIntervalMinutes)
      : DEFAULT_INTERVAL_MINUTES;

  const existing = await getBrandByName(name.trim());
  if (existing) throw new Error("اسم البراند موجود مسبقاً");

  const rec = await createRecord(ZTO_BASE_ID, BRANDS_TABLE_NAME, {
    [FIELD_NAME]: name.trim(),
    [FIELD_INTERVAL]: interval,
  });
  invalidateCache();
  return recordToBrand(rec);
}

export async function updateBrand(
  id: string,
  patch: { name?: string; scrapeIntervalMinutes?: number }
): Promise<Brand> {
  const fields: Record<string, unknown> = {};
  if (patch.name?.trim()) fields[FIELD_NAME] = patch.name.trim();
  if (
    typeof patch.scrapeIntervalMinutes === "number" &&
    Number.isFinite(patch.scrapeIntervalMinutes) &&
    patch.scrapeIntervalMinutes > 0
  ) {
    fields[FIELD_INTERVAL] = Math.floor(patch.scrapeIntervalMinutes);
  }
  if (Object.keys(fields).length === 0) {
    throw new Error("لا توجد حقول للتحديث");
  }
  const rec = await updateRecord(ZTO_BASE_ID, BRANDS_TABLE_NAME, id, fields);
  invalidateCache();
  return recordToBrand(rec);
}

export async function deleteBrandById(id: string): Promise<void> {
  await deleteRecord(ZTO_BASE_ID, BRANDS_TABLE_NAME, id);
  invalidateCache();
}

// Map of brand name → interval minutes, used by the cron to gate fetches.
export async function getBrandIntervalMap(): Promise<Record<string, number>> {
  const brands = await listBrands();
  const map: Record<string, number> = {};
  for (const b of brands) map[b.name] = b.scrapeIntervalMinutes;
  return map;
}

export const DEFAULT_BRAND_INTERVAL_MINUTES = DEFAULT_INTERVAL_MINUTES;
