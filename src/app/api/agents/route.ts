import { NextRequest, NextResponse } from "next/server";
import {
  getAgents,
  getAgentById,
  createAgent,
  updateAgent,
  deleteAgent,
  executeAgent,
  addExecution,
  updateExecution,
  getOpenRouterKey,
  OPENROUTER_MODELS,
} from "@/lib/agents";
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

  if (action === "status") {
    const hasKey = !!getOpenRouterKey();
    return NextResponse.json({ configured: hasKey, models: OPENROUTER_MODELS });
  }

  const agents = await getAgents();
  return NextResponse.json({ agents });
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
        const agent = await createAgent({ ...data, createdBy: user.id });
        logger.info(`Agent "${agent.name}" created by ${user.name}`, "Agents", null, user.id);
        return NextResponse.json({ agent });
      }

      case "update": {
        if (user.role !== "admin") {
          return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
        }
        const { id, ...update } = data;
        const updated = await updateAgent(id, update);
        if (!updated) {
          return NextResponse.json({ error: "الوكيل غير موجود" }, { status: 404 });
        }
        logger.info(`Agent ${id} updated by ${user.name}`, "Agents", null, user.id);
        return NextResponse.json({ agent: updated });
      }

      case "delete": {
        if (user.role !== "admin") {
          return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
        }
        const deleted = await deleteAgent(data.id);
        if (!deleted) {
          return NextResponse.json({ error: "الوكيل غير موجود" }, { status: 404 });
        }
        logger.info(`Agent ${data.id} deleted by ${user.name}`, "Agents", null, user.id);
        return NextResponse.json({ success: true });
      }

      case "execute": {
        const agent = await getAgentById(data.agentId);
        if (!agent) {
          return NextResponse.json({ error: "الوكيل غير موجود" }, { status: 404 });
        }
        if (!agent.isActive) {
          return NextResponse.json({ error: "الوكيل غير مفعل" }, { status: 400 });
        }

        const execution = await addExecution({
          agentId: agent.id,
          agentName: agent.name,
          modelUsed: data.modelOverride || agent.modelName,
          input: data.input,
          output: "",
          status: "running",
          executedAt: new Date().toISOString(),
          executedBy: user.id,
        });

        try {
          const output = await executeAgent(agent, data.input, data.modelOverride);
          const updated = await updateExecution(execution.id, { output, status: "completed" });
          logger.info(`Agent "${agent.name}" executed with ${execution.modelUsed}`, "Agents", null, user.id);
          return NextResponse.json({ execution: updated ?? execution });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "خطأ غير معروف";
          const updated = await updateExecution(execution.id, {
            status: "error",
            error: errMsg,
          });
          logger.error(`Agent "${agent.name}" execution failed`, "Agents", err, user.id);
          return NextResponse.json({ execution: updated ?? execution, error: errMsg }, { status: 500 });
        }
      }

      case "preview": {
        const agent = await getAgentById(data.agentId);
        if (!agent) {
          return NextResponse.json({ error: "الوكيل غير موجود" }, { status: 404 });
        }
        try {
          const output = await executeAgent(agent, data.input, data.modelOverride);
          return NextResponse.json({ preview: output });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "خطأ غير معروف";
          return NextResponse.json({ error: errMsg }, { status: 500 });
        }
      }

      case "test": {
        const agent = await getAgentById(data.agentId);
        if (!agent) {
          return NextResponse.json({ error: "الوكيل غير موجود" }, { status: 404 });
        }
        const models: string[] = data.models || [];
        if (models.length === 0) {
          return NextResponse.json({ error: "اختر نموذج واحد على الأقل" }, { status: 400 });
        }

        const results = await Promise.allSettled(
          models.map(async (model) => {
            const start = Date.now();
            const output = await executeAgent(agent, data.input, model);
            const duration = Date.now() - start;
            return { model, output, duration };
          })
        );

        const testResults = results.map((r, i) => {
          if (r.status === "fulfilled") {
            return { model: models[i], output: r.value.output, duration: r.value.duration, error: null };
          } else {
            return { model: models[i], output: null, duration: 0, error: r.reason?.message || "خطأ غير معروف" };
          }
        });

        return NextResponse.json({ testResults });
      }

      default:
        return NextResponse.json({ error: "إجراء غير صالح" }, { status: 400 });
    }
  } catch (error) {
    logger.error("Agent API error", "Agents", error, user?.id);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}
