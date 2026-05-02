import { NextRequest, NextResponse } from "next/server";
import {
  getDataSources,
  getDataSourceById,
  createDataSource,
  updateDataSource,
  deleteDataSource,
  bulkCreateDataSources,
  getArticles,
  getArticleById,
  fetchSource,
  fetchAllSources,
  previewSource,
  saveArticleToAirtable,
  saveArticlesToAirtable,
  getApifyToken,
  getFilterHistory,
  SourceValidationError,
  VALID_SOURCE_TYPES,
  type SourceType,
} from "@/lib/data-sources";
import { verifySessionToken, getUserById } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  getDestinationMapping,
  setDestinationMapping,
  applyMapping,
  sanitizeMapping,
  ARTICLE_TOKENS,
  DESTINATION_BASE_ID,
  DESTINATION_TABLE_NAME,
  type DestinationMapping,
} from "@/lib/destination-mapping";
import { listTables } from "@/lib/airtable";

function getUser(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  if (!token) return null;
  const session = verifySessionToken(token);
  if (!session) return null;
  return getUserById(session.userId);
}

export async function GET(request: NextRequest) {
  const user = getUser(request);
  if (!user) {
    return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const sourceId = searchParams.get("sourceId");

  if (action === "articles") {
    const articles = await getArticles(sourceId || undefined);
    return NextResponse.json({ articles });
  }

  if (action === "fetch" && sourceId) {
    try {
      const result = await fetchSource(sourceId);
      if (result.error) {
        return NextResponse.json(
          { error: result.error, articles: result.articles },
          { status: 502 }
        );
      }
      return NextResponse.json({
        articles: result.articles,
        count: result.articles.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      logger.error(`Data source fetch error: ${msg}`, "DataSources", err, user.id);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (action === "status") {
    // Generic capability flags. Vendor identifiers are intentionally kept off
    // the wire so the public dashboard doesn't enumerate the provider stack.
    return NextResponse.json({
      socialFetchEnabled: !!getApifyToken(),
      aiFilterEnabled: !!process.env.OPENROUTER_API_KEY,
    });
  }

  if (action === "filter-history") {
    const history = await getFilterHistory();
    return NextResponse.json({ history });
  }

  if (action === "destination-mapping") {
    try {
      const mapping = await getDestinationMapping();
      return NextResponse.json({
        mapping,
        baseId: DESTINATION_BASE_ID,
        tableName: DESTINATION_TABLE_NAME,
        articleTokens: ARTICLE_TOKENS,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (action === "destination-columns") {
    // Refresh-from-Airtable: list the live columns of the destination table.
    try {
      const tables = await listTables(DESTINATION_BASE_ID);
      const table = tables.find(
        (t) => t.name === DESTINATION_TABLE_NAME || t.id === DESTINATION_TABLE_NAME
      );
      if (!table) {
        return NextResponse.json(
          { error: "جدول الوجهة غير موجود في قاعدة Airtable" },
          { status: 404 }
        );
      }
      return NextResponse.json({
        baseId: DESTINATION_BASE_ID,
        tableName: table.name,
        tableId: table.id,
        columns: table.fields.map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type,
          description: f.description,
        })),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  const sources = await getDataSources();
  return NextResponse.json({ sources });
}

export async function POST(request: NextRequest) {
  const user = getUser(request);
  if (!user) {
    return NextResponse.json({ error: "غير مصادق" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, ...data } = body;

    switch (action) {
      case "test-source": {
        // Stateless preview — admin-only since fetching can hit paid APIs.
        if (user.role !== "admin") {
          return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
        }
        const type = data.type as SourceType;
        const url = typeof data.url === "string" ? data.url : "";
        if (!type || !VALID_SOURCE_TYPES.includes(type)) {
          return NextResponse.json({ error: "نوع المصدر غير صالح" }, { status: 400 });
        }
        if (!url.trim()) {
          return NextResponse.json({ error: "الرابط مطلوب" }, { status: 400 });
        }
        const limit = Number.isFinite(data.limit)
          ? Math.max(1, Math.min(10, Math.round(Number(data.limit))))
          : 5;
        const result = await previewSource({ type, url, limit });
        if (result.error && result.articles.length === 0) {
          return NextResponse.json(
            { error: result.error, articles: [] },
            { status: 502 }
          );
        }
        // Strip transient ids and trim payload sizes for the wire.
        const items = result.articles.map((a) => ({
          title: a.title,
          description: (a.description ?? "").slice(0, 600),
          url: a.url,
          author: a.author,
          publishedAt: a.publishedAt,
          imageUrl: a.imageUrl,
        }));
        return NextResponse.json({
          articles: items,
          count: items.length,
          warning: result.error ?? null,
        });
      }

      case "create": {
        if (user.role !== "admin") {
          return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
        }
        try {
          const source = await createDataSource(data);
          logger.info(
            `Data source "${source.name}" created by ${user.name}`,
            "DataSources",
            null,
            user.id
          );
          return NextResponse.json({ source });
        } catch (err) {
          if (err instanceof SourceValidationError) {
            return NextResponse.json({ error: err.message }, { status: 400 });
          }
          throw err;
        }
      }

      case "bulk-create": {
        if (user.role !== "admin") {
          return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
        }
        const sources = Array.isArray(data.sources) ? data.sources : null;
        if (!sources) {
          return NextResponse.json({ error: "sources يجب أن يكون مصفوفة" }, { status: 400 });
        }
        try {
          const { results, created } = await bulkCreateDataSources(sources);
          logger.info(
            `Bulk create: ${created}/${results.length} sources created by ${user.name}`,
            "DataSources",
            null,
            user.id
          );
          const failed = results.filter((r) => !r.ok).length;
          return NextResponse.json({
            results,
            created,
            failed,
            total: results.length,
          });
        } catch (err) {
          if (err instanceof SourceValidationError) {
            return NextResponse.json({ error: err.message }, { status: 400 });
          }
          throw err;
        }
      }

      case "update": {
        const { id, ...update } = data;
        if (!id) {
          return NextResponse.json({ error: "معرّف المصدر مطلوب" }, { status: 400 });
        }
        // Non-admins may only toggle isActive; any other field requires admin.
        if (user.role !== "admin") {
          const allowedKeys = ["isActive"];
          const submittedKeys = Object.keys(update);
          const disallowed = submittedKeys.filter((k) => !allowedKeys.includes(k));
          if (disallowed.length > 0) {
            return NextResponse.json(
              { error: "صلاحيات المدير مطلوبة لتعديل هذه الحقول" },
              { status: 403 }
            );
          }
        }
        try {
          const updated = await updateDataSource(id, update);
          if (!updated) {
            return NextResponse.json({ error: "المصدر غير موجود" }, { status: 404 });
          }
          logger.info(
            `Data source ${id} updated by ${user.name}`,
            "DataSources",
            null,
            user.id
          );
          return NextResponse.json({ source: updated });
        } catch (err) {
          if (err instanceof SourceValidationError) {
            return NextResponse.json({ error: err.message }, { status: 400 });
          }
          throw err;
        }
      }

      case "delete": {
        if (user.role !== "admin") {
          return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
        }
        if (!data.id) {
          return NextResponse.json({ error: "معرّف المصدر مطلوب" }, { status: 400 });
        }
        const deleted = await deleteDataSource(data.id);
        if (!deleted) {
          return NextResponse.json({ error: "المصدر غير موجود" }, { status: 404 });
        }
        logger.info(
          `Data source ${data.id} deleted by ${user.name}`,
          "DataSources",
          null,
          user.id
        );
        return NextResponse.json({ success: true });
      }

      case "fetch": {
        const sourceId = data.sourceId || data.id;
        if (!sourceId || typeof sourceId !== "string") {
          return NextResponse.json({ error: "معرّف المصدر مطلوب" }, { status: 400 });
        }
        try {
          // fetchSource itself does the lookup and short-circuits with
          // { error: "Source not found" } — no need to pre-fetch the row
          // (that double round-trip was the source of stale-state 404s
          // when the page held an ID the DB no longer had).
          const result = await fetchSource(sourceId);
          if (result.error === "Source not found") {
            logger.warn(
              `Manual fetch hit unknown source id ${sourceId}`,
              "DataSources",
              { sourceId, requestedBy: user.name },
              user.id
            );
            return NextResponse.json(
              { error: "المصدر غير موجود — حدّث القائمة وحاول مرة أخرى", stale: true },
              { status: 404 }
            );
          }
          logger.info(
            `Manual fetch returned ${result.articles.length} article(s) for source ${sourceId}`,
            "DataSources",
            { sourceId, articleCount: result.articles.length, error: result.error ?? null },
            user.id
          );
          if (result.error) {
            return NextResponse.json(
              {
                error: result.error,
                articles: result.articles,
                count: result.articles.length,
              },
              { status: 502 }
            );
          }
          return NextResponse.json({
            articles: result.articles,
            count: result.articles.length,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          logger.error(
            `Manual fetch threw for source ${sourceId}: ${msg}`,
            "DataSources",
            err,
            user.id
          );
          return NextResponse.json({ error: msg }, { status: 500 });
        }
      }

      case "save-to-airtable": {
        const articleId = data.articleId;
        const sourceName = data.sourceName || "Unknown";
        if (articleId) {
          const article = await getArticleById(articleId);
          if (!article) {
            return NextResponse.json({ error: "المقال غير موجود" }, { status: 404 });
          }
          const ok = await saveArticleToAirtable(article, sourceName);
          if (ok) {
            logger.info(
              `Article saved to Airtable: ${article.title?.slice(0, 50)}`,
              "DataSources",
              null,
              user.id
            );
            return NextResponse.json({ success: true });
          }
          return NextResponse.json({ error: "فشل الحفظ في Airtable" }, { status: 500 });
        }
        const bulkSourceId = data.sourceId;
        if (bulkSourceId) {
          const articles = await getArticles(bulkSourceId);
          const unsaved = articles.filter((a) => !a.savedToAirtable);
          const source = await getDataSourceById(bulkSourceId);
          const count = await saveArticlesToAirtable(unsaved, source?.name || sourceName);
          logger.info(
            `Bulk saved ${count} articles to Airtable from "${source?.name}"`,
            "DataSources",
            null,
            user.id
          );
          return NextResponse.json({ success: true, saved: count });
        }
        return NextResponse.json({ error: "articleId أو sourceId مطلوب" }, { status: 400 });
      }

      case "save-destination-mapping": {
        if (user.role !== "admin") {
          return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
        }
        const raw = (data as { mapping?: unknown }).mapping;
        try {
          const clean = sanitizeMapping(raw);
          if (Object.keys(clean.columns).length === 0) {
            return NextResponse.json(
              { error: "لا يمكن حفظ مخطّط فارغ" },
              { status: 400 }
            );
          }
          const saved = await setDestinationMapping(clean);
          logger.info(
            `Destination mapping updated by ${user.name} (${
              Object.keys(saved.columns).length
            } columns)`,
            "DataSources",
            { columnCount: Object.keys(saved.columns).length },
            user.id
          );
          return NextResponse.json({ mapping: saved });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          return NextResponse.json({ error: msg }, { status: 500 });
        }
      }

      case "test-destination-mapping": {
        if (user.role !== "admin") {
          return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
        }
        try {
          // Use the just-edited mapping if provided, else the persisted one.
          const incoming = (data as { mapping?: unknown }).mapping;
          const mapping: DestinationMapping = incoming
            ? sanitizeMapping(incoming)
            : await getDestinationMapping();

          // Pull the most recent article overall (any source, any topic) to
          // give a realistic preview.
          const recent = await getArticles();
          const article = recent[0] ?? null;
          if (!article) {
            return NextResponse.json({
              mapping,
              article: null,
              preview: {},
              note: "لا توجد مقالات بعد لاختبار المخطّط",
            });
          }
          const preview = applyMapping(mapping, article);
          return NextResponse.json({
            mapping,
            article: {
              id: article.id,
              title: article.title,
              sourceName: article.sourceName,
              url: article.url,
              publishedAt: article.publishedAt,
            },
            preview,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          return NextResponse.json({ error: msg }, { status: 500 });
        }
      }

      case "fetch-all": {
        try {
          const results = await fetchAllSources();
          const totalArticles = results.reduce(
            (sum, r) => sum + r.result.articles.length,
            0
          );
          logger.info(
            `Fetched all sources: ${totalArticles} articles from ${results.length} sources`,
            "DataSources",
            null,
            user.id
          );
          return NextResponse.json({
            results,
            totalArticles,
            sourcesProcessed: results.length,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          logger.error("Fetch-all failed", "DataSources", err, user.id);
          return NextResponse.json({ error: msg }, { status: 500 });
        }
      }

      default:
        return NextResponse.json({ error: "إجراء غير صالح" }, { status: 400 });
    }
  } catch (error) {
    logger.error("DataSources API error", "DataSources", error, user?.id);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}
