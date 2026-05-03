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
  resolveFilterAgentForSource,
  runFilterAgent,
  passSetsFromFilterResult,
  SourceValidationError,
  VALID_SOURCE_TYPES,
  type SourceType,
  type FilterAgentSpec,
} from "@/lib/data-sources";
import { getAgents, getAgentById } from "@/lib/agents";
import { verifySessionToken, getUserById } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  getPerTypeMapping,
  setPerTypeMapping,
  getMappingForType,
  applyMapping,
  sanitizePerTypeMapping,
  ARTICLE_TOKENS,
  ARTICLE_TOKEN_META_BY_TYPE,
  MAPPABLE_SOURCE_TYPES,
  DESTINATION_BASE_ID,
  type TypeMapping,
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

  // Filtering agents available for assignment to a source. Returns a
  // resolved-default flag so the UI can show "default" for the seeded one.
  if (action === "filter-agents") {
    try {
      const agents = await getAgents();
      const filtering = agents
        .filter((a) => a.agentType === "filtering")
        .map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          modelName: a.modelName,
          temperature: a.temperature,
          maxTokens: a.maxTokens,
          isActive: a.isActive,
        }));
      return NextResponse.json({ agents: filtering });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (action === "destination-mapping") {
    try {
      const mapping = await getPerTypeMapping();
      return NextResponse.json({
        mapping,
        baseId: DESTINATION_BASE_ID,
        articleTokens: ARTICLE_TOKENS,
        // Per-type token metadata (Arabic label + one-line description +
        // populated flag). Lets the UI show only fields the chosen source
        // type actually fills, with a short hint next to each.
        articleTokenMetaByType: ARTICLE_TOKEN_META_BY_TYPE,
        sourceTypes: MAPPABLE_SOURCE_TYPES,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // List all tables in the destination base — used by the table picker so the
  // admin can choose a different table per source type.
  if (action === "destination-tables") {
    try {
      const tables = await listTables(DESTINATION_BASE_ID);
      return NextResponse.json({
        baseId: DESTINATION_BASE_ID,
        tables: tables.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          fieldCount: t.fields.length,
        })),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  // Columns for a specific table. Caller passes ?tableName=...; returns the
  // live schema so the mapping UI can flag mismatches in real time.
  if (action === "destination-columns") {
    try {
      const tableName = searchParams.get("tableName");
      if (!tableName) {
        return NextResponse.json(
          { error: "يجب تحديد اسم الجدول" },
          { status: 400 }
        );
      }
      const tables = await listTables(DESTINATION_BASE_ID);
      const table = tables.find((t) => t.name === tableName || t.id === tableName);
      if (!table) {
        return NextResponse.json(
          { error: `الجدول "${tableName}" غير موجود في قاعدة Airtable` },
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
      case "test-filter-agent": {
        // Stateless preview of how a filtering agent would classify a small
        // set of articles. Caller can pass:
        //   { agentId } → load that agent record from the DB
        //   { sourceId } → resolve the agent that source uses
        //   inline override { systemPrompt, model, temperature, maxTokens }
        // and any combination thereof. Articles default to the latest 10
        // saved articles so the admin doesn't have to type them out.
        if (user.role !== "admin") {
          return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
        }
        try {
          let spec: FilterAgentSpec | null = null;

          const agentId = (data as { agentId?: unknown }).agentId;
          if (typeof agentId === "string" && agentId.length > 0) {
            const a = await getAgentById(agentId);
            if (!a) {
              return NextResponse.json({ error: "الوكيل غير موجود" }, { status: 404 });
            }
            spec = {
              agentId: a.id,
              agentName: a.name,
              model: a.modelName,
              systemPrompt: a.systemPrompt,
              temperature: a.temperature,
              maxTokens: a.maxTokens,
            };
          }

          const sourceIdRaw = (data as { sourceId?: unknown }).sourceId;
          if (!spec && typeof sourceIdRaw === "string" && sourceIdRaw.length > 0) {
            const src = await getDataSourceById(sourceIdRaw);
            if (src) {
              spec = await resolveFilterAgentForSource(src);
            }
          }

          // Inline override (admin tweaking the prompt before saving the agent).
          const overrides = data as {
            systemPrompt?: unknown;
            model?: unknown;
            temperature?: unknown;
            maxTokens?: unknown;
          };
          if (typeof overrides.systemPrompt === "string" && overrides.systemPrompt.length > 0) {
            spec = {
              agentId: spec?.agentId ?? null,
              agentName: spec?.agentName ?? "(تعديل مؤقت)",
              systemPrompt: overrides.systemPrompt,
              model:
                typeof overrides.model === "string" && overrides.model
                  ? overrides.model
                  : spec?.model ?? "openai/gpt-4o-mini",
              temperature:
                typeof overrides.temperature === "number"
                  ? overrides.temperature
                  : spec?.temperature ?? 0,
              maxTokens:
                typeof overrides.maxTokens === "number"
                  ? overrides.maxTokens
                  : spec?.maxTokens ?? 4000,
            };
          }

          if (!spec) {
            spec = await resolveFilterAgentForSource({ filterAgentId: null });
          }

          // Pull a sample to test on. Caller can pass their own array, else
          // we use the most recent 10 articles (any source).
          let sample: Array<{ title: string; url: string }> = [];
          const articlesIn = (data as { articles?: unknown }).articles;
          if (Array.isArray(articlesIn) && articlesIn.length > 0) {
            sample = articlesIn
              .filter((a): a is { title: string; url: string } =>
                !!a &&
                typeof a === "object" &&
                typeof (a as { title?: unknown }).title === "string"
              )
              .slice(0, 20)
              .map((a) => ({
                title: String(a.title).slice(0, 400),
                url: typeof a.url === "string" ? a.url : "",
              }));
          } else {
            const recent = await getArticles();
            sample = recent.slice(0, 10).map((a) => ({ title: a.title, url: a.url }));
          }

          if (sample.length === 0) {
            return NextResponse.json({
              spec: { agentId: spec.agentId, agentName: spec.agentName, model: spec.model },
              parsed: null,
              rawResponse: "",
              note: "لا توجد مقالات لاختبار الوكيل",
              decisions: [],
            });
          }

          const result = await runFilterAgent(spec, sample);

          if (result.error || !result.parsed) {
            logger.warn(
              `Filter-agent test failed for "${spec.agentName}"`,
              "AIFilter",
              { agentId: spec.agentId, error: result.error },
              user.id
            );
            return NextResponse.json(
              {
                spec: {
                  agentId: spec.agentId,
                  agentName: spec.agentName,
                  model: spec.model,
                },
                parsed: null,
                rawResponse: result.rawResponse,
                error: result.error,
                decisions: [],
              },
              { status: 502 }
            );
          }

          const { passedUrls, passedTitles } = passSetsFromFilterResult(result.parsed);
          const decisions = sample.map((a) => {
            const t = a.title.trim();
            const passed =
              (a.url && passedUrls.has(a.url)) ||
              passedTitles.some(
                (p) =>
                  p.length > 10 &&
                  (t.toLowerCase().includes(p.toLowerCase()) ||
                    p.toLowerCase().includes(t.toLowerCase()))
              );
            return { title: a.title, url: a.url, passed: !!passed };
          });

          logger.info(
            `Filter-agent test "${spec.agentName}" — ${decisions.filter((d) => d.passed).length}/${decisions.length} passed`,
            "AIFilter",
            {
              agentId: spec.agentId,
              model: spec.model,
              total: decisions.length,
              passed: decisions.filter((d) => d.passed).length,
              investmentRelated: result.parsed.Investment_related,
            },
            user.id
          );

          return NextResponse.json({
            spec: {
              agentId: spec.agentId,
              agentName: spec.agentName,
              model: spec.model,
              temperature: spec.temperature,
              maxTokens: spec.maxTokens,
            },
            parsed: result.parsed,
            rawResponse: result.rawResponse,
            decisions,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          logger.error(`Filter-agent test threw: ${msg}`, "AIFilter", err, user.id);
          return NextResponse.json({ error: msg }, { status: 500 });
        }
      }

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
          const clean = sanitizePerTypeMapping(raw);
          // At least one type must have at least one column.
          const totalCols = Object.values(clean).reduce(
            (n, m) => n + (m ? Object.keys(m.columns).length : 0),
            0
          );
          if (totalCols === 0) {
            return NextResponse.json(
              { error: "لا يمكن حفظ مخطّط فارغ" },
              { status: 400 }
            );
          }
          const saved = await setPerTypeMapping(clean);
          const summary = Object.entries(saved)
            .map(
              ([t, m]) =>
                `${t}=${m ? Object.keys(m.columns).length : 0}c@${m?.tableName ?? "?"}`
            )
            .join(" ");
          logger.info(
            `Destination mapping updated by ${user.name} — ${summary}`,
            "DataSources",
            { mapping: saved },
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
          // Caller chooses the source type to preview against. Default to rss
          // for backward compat with the old single-mapping contract.
          const sourceType = ((data as { type?: unknown }).type ?? "rss") as
            | "rss"
            | "twitter"
            | "linkedin"
            | "apify"
            | "custom";
          const incoming = (data as { mapping?: unknown }).mapping;
          const perType = incoming
            ? sanitizePerTypeMapping(incoming)
            : await getPerTypeMapping();
          const mapping: TypeMapping = getMappingForType(perType, sourceType);

          // Pull the most recent article matching this type when possible so
          // the preview reflects the actual data shape that flows through.
          const allRecent = await getArticles();
          // We don't have type on the article — articles inherit from source.
          // Best-effort: pick the most recent article whose source still
          // exists and matches; fall back to the most recent article overall.
          const sources = await getDataSources();
          const sourceById = new Map(sources.map((s) => [s.id, s]));
          let article = allRecent.find(
            (a) => sourceById.get(a.sourceId)?.type === sourceType
          );
          if (!article) article = allRecent[0];

          if (!article) {
            return NextResponse.json({
              mapping,
              article: null,
              preview: {},
              note: "لا توجد مقالات بعد لاختبار المخطّط",
              missingColumns: [],
              tableName: mapping.tableName,
              sourceType,
            });
          }

          // Verify mapped columns against the live destination schema so the
          // UI can surface mismatches in the same response.
          let missingColumns: string[] = [];
          let liveColumns: string[] = [];
          try {
            const tables = await listTables(DESTINATION_BASE_ID);
            const t = tables.find(
              (tt) => tt.name === mapping.tableName || tt.id === mapping.tableName
            );
            if (t) {
              liveColumns = t.fields.map((f) => f.name);
              const known = new Set(liveColumns);
              missingColumns = Object.keys(mapping.columns).filter((c) => !known.has(c));
            }
          } catch {
            // Non-fatal — the preview can still render without the schema
          }

          const { fields: preview } = applyMapping(mapping, article);
          return NextResponse.json({
            mapping,
            sourceType,
            tableName: mapping.tableName,
            article: {
              id: article.id,
              title: article.title,
              sourceName: article.sourceName,
              url: article.url,
              publishedAt: article.publishedAt,
            },
            preview,
            missingColumns,
            liveColumns,
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
