import { NextRequest, NextResponse } from "next/server";
import { getAgents, getAgentById, createAgent, updateAgent, deleteAgent, executeAgent, addExecution } from "@/lib/agents";
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

  const agents = getAgents();
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
        const agent = createAgent({ ...data, createdBy: user.id });
        logger.info(`Agent "${agent.name}" created by ${user.name}`, "Agents", null, user.id);
        return NextResponse.json({ agent });
      }

      case "update": {
        if (user.role !== "admin") {
          return NextResponse.json({ error: "صلاحيات المدير مطلوبة" }, { status: 403 });
        }
        const { id, ...update } = data;
        const updated = updateAgent(id, update);
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
        const deleted = deleteAgent(data.id);
        if (!deleted) {
          return NextResponse.json({ error: "الوكيل غير موجود" }, { status: 404 });
        }
        logger.info(`Agent ${data.id} deleted by ${user.name}`, "Agents", null, user.id);
        return NextResponse.json({ success: true });
      }

      case "execute": {
        const agent = getAgentById(data.agentId);
        if (!agent) {
          return NextResponse.json({ error: "الوكيل غير موجود" }, { status: 404 });
        }
        if (!agent.isActive) {
          return NextResponse.json({ error: "الوكيل غير مفعل" }, { status: 400 });
        }

        const execution = addExecution({
          agentId: agent.id,
          input: data.input,
          output: "",
          status: "running",
          executedAt: new Date().toISOString(),
          executedBy: user.id,
        });

        try {
          const output = await executeAgent(agent, data.input);
          execution.output = output;
          execution.status = "completed";
          logger.info(`Agent "${agent.name}" executed successfully`, "Agents", null, user.id);
          return NextResponse.json({ execution });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "خطأ غير معروف";
          execution.status = "error";
          execution.error = errMsg;
          logger.error(`Agent "${agent.name}" execution failed`, "Agents", err, user.id);
          return NextResponse.json({ execution, error: errMsg }, { status: 500 });
        }
      }

      case "preview": {
        const agent = getAgentById(data.agentId);
        if (!agent) {
          return NextResponse.json({ error: "الوكيل غير موجود" }, { status: 404 });
        }
        try {
          const output = await executeAgent(agent, data.input);
          return NextResponse.json({ preview: output });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "خطأ غير معروف";
          return NextResponse.json({ error: errMsg }, { status: 500 });
        }
      }

      default:
        return NextResponse.json({ error: "إجراء غير صالح" }, { status: 400 });
    }
  } catch (error) {
    logger.error("Agent API error", "Agents", error, user?.id);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}
