import { NextRequest, NextResponse } from "next/server";
import {
  getDataSources,
  getDataSourceById,
  createDataSource,
  updateDataSource,
  deleteDataSource,
  getArticles,
  getArticleById,
  fetchSource,
  fetchAllSources,
  saveArticleToAirtable,
  saveArticlesToAirtable,
  getApifyToken,
  getFilterHistory,
} from "@/lib/data-sources";
import { verifySessionToken, getUserById } from "@/lib/auth";
import { logger } from "@/lib/logger";

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
    return NextResponse.json({
      apifyConfigured: !!getApifyToken(),
      openrouterConfigured: !!process.env.OPENROUTER_API_KEY,
    });
  }

  if (action === "filter-history") {
    const history = await getFilterHistory();
    return NextResponse.json({ history });
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
      case "create": {
        if (user.role !== "admin") {
          return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
        }
        const source = await createDataSource(data);
        logger.info(
          `Data source "${source.name}" created by ${user.name}`,
          "DataSources",
          null,
          user.id
        );
        return NextResponse.json({ source });
      }

      case "update": {
        const { id, ...update } = data;
        if (!id) {
          return NextResponse.json({ error: "معرّف المصدر مطلوب" }, { status: 400 });
        }
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
        if (!sourceId) {
          return NextResponse.json({ error: "معرّف المصدر مطلوب" }, { status: 400 });
        }
        const source = await getDataSourceById(sourceId);
        if (!source) {
          return NextResponse.json({ error: "المصدر غير موجود" }, { status: 404 });
        }
        try {
          const result = await fetchSource(sourceId);
          logger.info(
            `Fetched ${result.articles.length} articles from "${source.name}"`,
            "DataSources",
            null,
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
            `Fetch failed for source "${source.name}"`,
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
