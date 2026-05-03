// AI Agent configuration + execution log, persisted in Supabase
// (scraper_agents, scraper_agent_runs). All model calls go through OpenRouter.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type AgentRow = Database["public"]["Tables"]["scraper_agents"]["Row"];
type AgentRunRow = Database["public"]["Tables"]["scraper_agent_runs"]["Row"];

export type AgentType = "writing" | "filtering" | "editing" | "summarizing";
export type ExecutionStatus = "pending" | "running" | "completed" | "error";

export interface ExamplePost {
  id: string;
  title: string;
  content: string;
  source: "manual" | "airtable";
  airtableRef?: {
    baseId: string;
    tableId: string;
    recordId: string;
    fieldName: string;
  };
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  modelName: string;
  systemPrompt: string;
  examplePosts: ExamplePost[];
  temperature: number;
  maxTokens: number;
  agentType: AgentType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface AgentExecution {
  id: string;
  agentId: string;
  agentName: string;
  modelUsed: string;
  input: string;
  output: string;
  status: ExecutionStatus;
  error?: string;
  executedAt: string;
  executedBy: string;
}

// Internal model registry. The `id` is what the upstream API requires; the
// user-facing `label` and `tier` are intentionally anonymised so the UI
// doesn't surface vendor branding.
export const OPENROUTER_MODELS = [
  { id: "openai/gpt-4o-mini",                        label: "نموذج سريع وموفّر",   tier: "خفيف" },
  { id: "openai/gpt-4o",                             label: "نموذج متوازن",         tier: "قياسي" },
  { id: "openai/gpt-4-turbo",                        label: "نموذج عالي الأداء",    tier: "قياسي" },
  { id: "anthropic/claude-haiku-4-5-20251001",       label: "نموذج خفيف وسريع",     tier: "خفيف" },
  { id: "anthropic/claude-sonnet-4-20250514",        label: "نموذج متقدّم",          tier: "متقدم" },
  { id: "anthropic/claude-opus-4-20250514",          label: "نموذج رائد",            tier: "متقدم" },
  { id: "google/gemini-2.0-flash-exp:free",          label: "نموذج سريع — مجاني",   tier: "خفيف" },
  { id: "google/gemini-pro-1.5",                     label: "نموذج طويل السياق",    tier: "قياسي" },
  { id: "meta-llama/llama-3.3-70b-instruct",         label: "نموذج مفتوح كبير",      tier: "قياسي" },
  { id: "mistralai/mistral-large-latest",            label: "نموذج عام",             tier: "قياسي" },
  { id: "deepseek/deepseek-chat-v3-0324:free",       label: "نموذج اقتصادي",         tier: "خفيف" },
  { id: "qwen/qwen-2.5-72b-instruct",                label: "نموذج متعدد اللغات",   tier: "قياسي" },
];

export function getOpenRouterKey(): string | null {
  return process.env.OPENROUTER_API_KEY || null;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapAgent(row: AgentRow): AgentConfig {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    modelName: row.model_name,
    systemPrompt: row.system_prompt,
    examplePosts: Array.isArray(row.example_posts)
      ? (row.example_posts as unknown as ExamplePost[])
      : [],
    temperature: Number(row.temperature),
    maxTokens: row.max_tokens,
    agentType: row.agent_type as AgentType,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? "",
  };
}

function mapRun(row: AgentRunRow): AgentExecution {
  return {
    id: row.id,
    agentId: row.agent_id ?? "",
    agentName: row.agent_name,
    modelUsed: row.model_used,
    input: row.input,
    output: row.output,
    status: row.status as ExecutionStatus,
    error: row.error ?? undefined,
    executedAt: row.executed_at,
    executedBy: row.executed_by ?? "",
  };
}

// ---------------------------------------------------------------------------
// Agent CRUD
// ---------------------------------------------------------------------------

export async function getAgents(): Promise<AgentConfig[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_agents")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getAgents: ${error.message}`);
  return (data ?? []).map(mapAgent);
}

export async function getAgentById(id: string): Promise<AgentConfig | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_agents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getAgentById: ${error.message}`);
  return data ? mapAgent(data) : null;
}

export async function createAgent(
  config: Omit<AgentConfig, "id" | "createdAt" | "updatedAt">
): Promise<AgentConfig> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_agents")
    .insert({
      name: config.name,
      description: config.description,
      model_name: config.modelName,
      system_prompt: config.systemPrompt,
      example_posts: (config.examplePosts ?? []) as unknown as Database["public"]["Tables"]["scraper_agents"]["Insert"]["example_posts"],
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      agent_type: config.agentType,
      is_active: config.isActive,
      created_by: isUuid(config.createdBy) ? config.createdBy : null,
    })
    .select()
    .single();
  if (error) throw new Error(`createAgent: ${error.message}`);
  return mapAgent(data);
}

export async function updateAgent(
  id: string,
  update: Partial<AgentConfig>
): Promise<AgentConfig | null> {
  const sb = getSupabaseAdmin();
  const patch: Database["public"]["Tables"]["scraper_agents"]["Update"] = {
    updated_at: new Date().toISOString(),
  };
  if (update.name !== undefined) patch.name = update.name;
  if (update.description !== undefined) patch.description = update.description;
  if (update.modelName !== undefined) patch.model_name = update.modelName;
  if (update.systemPrompt !== undefined) patch.system_prompt = update.systemPrompt;
  if (update.examplePosts !== undefined) {
    patch.example_posts = update.examplePosts as unknown as typeof patch.example_posts;
  }
  if (update.temperature !== undefined) patch.temperature = update.temperature;
  if (update.maxTokens !== undefined) patch.max_tokens = update.maxTokens;
  if (update.agentType !== undefined) patch.agent_type = update.agentType;
  if (update.isActive !== undefined) patch.is_active = update.isActive;

  const { data, error } = await sb
    .from("scraper_agents")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`updateAgent: ${error.message}`);
  return data ? mapAgent(data) : null;
}

export async function deleteAgent(id: string): Promise<boolean> {
  const sb = getSupabaseAdmin();
  const { error, count } = await sb
    .from("scraper_agents")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw new Error(`deleteAgent: ${error.message}`);
  return (count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Execution log
// ---------------------------------------------------------------------------

export async function addExecution(
  exec: Omit<AgentExecution, "id">
): Promise<AgentExecution> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_agent_runs")
    .insert({
      agent_id: isUuid(exec.agentId) ? exec.agentId : null,
      agent_name: exec.agentName,
      model_used: exec.modelUsed,
      input: exec.input,
      output: exec.output,
      status: exec.status,
      error: exec.error ?? null,
      executed_by: exec.executedBy || null,
      executed_at: exec.executedAt,
    })
    .select()
    .single();
  if (error) throw new Error(`addExecution: ${error.message}`);
  return mapRun(data);
}

export async function updateExecution(
  id: string,
  patch: Partial<Pick<AgentExecution, "output" | "status" | "error">>
): Promise<AgentExecution | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("scraper_agent_runs")
    .update({
      output: patch.output,
      status: patch.status,
      error: patch.error ?? null,
    })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`updateExecution: ${error.message}`);
  return data ? mapRun(data) : null;
}

export async function getExecutions(agentId?: string): Promise<AgentExecution[]> {
  const sb = getSupabaseAdmin();
  let q = sb
    .from("scraper_agent_runs")
    .select("*")
    .order("executed_at", { ascending: false })
    .limit(200);
  if (agentId) q = q.eq("agent_id", agentId);
  const { data, error } = await q;
  if (error) throw new Error(`getExecutions: ${error.message}`);
  return (data ?? []).map(mapRun);
}

// ---------------------------------------------------------------------------
// OpenRouter execution
// ---------------------------------------------------------------------------

export async function executeAgent(
  agent: AgentConfig,
  userInput: string,
  modelOverride?: string,
  apiKeyOverride?: string
): Promise<string> {
  const examplesContext = agent.examplePosts
    .map((ex, i) => `مثال ${i + 1}:\nالعنوان: ${ex.title}\nالمحتوى: ${ex.content}`)
    .join("\n\n");

  const systemPrompt = `${agent.systemPrompt}\n\n${examplesContext ? `أمثلة مرجعية:\n${examplesContext}` : ""}`;
  const model = modelOverride || agent.modelName;
  const apiKey = apiKeyOverride || getOpenRouterKey();

  if (!apiKey) {
    throw new Error("مفتاح OpenRouter API غير مُعَد. أضف OPENROUTER_API_KEY في إعدادات البيئة.");
  }

  return callOpenRouter(apiKey, model, systemPrompt, userInput, agent.temperature, agent.maxTokens);
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "ZTO Airtable Agents",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`خطأ من OpenRouter (${response.status}): ${error}`);
  }

  const data = await response.json();
  if (!data.choices?.[0]?.message?.content) {
    throw new Error("لم يتم استلام رد من النموذج");
  }
  return data.choices[0].message.content;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string | null | undefined): boolean {
  return !!s && UUID_RE.test(s);
}
