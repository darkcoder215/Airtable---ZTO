// AI Agent configuration storage - in memory for now
// All model calls go through OpenRouter API

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  modelName: string;
  systemPrompt: string;
  examplePosts: ExamplePost[];
  temperature: number;
  maxTokens: number;
  agentType: "writing" | "filtering" | "editing" | "summarizing";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

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

export interface AgentExecution {
  id: string;
  agentId: string;
  agentName: string;
  modelUsed: string;
  input: string;
  output: string;
  status: "pending" | "running" | "completed" | "error";
  error?: string;
  executedAt: string;
  executedBy: string;
}

// OpenRouter model list — curated set of popular models
export const OPENROUTER_MODELS = [
  { id: "openai/gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", provider: "OpenAI" },
  { id: "openai/gpt-4-turbo", label: "GPT-4 Turbo", provider: "OpenAI" },
  { id: "anthropic/claude-opus-4-20250514", label: "Claude Opus 4", provider: "Anthropic" },
  { id: "anthropic/claude-sonnet-4-20250514", label: "Claude Sonnet 4", provider: "Anthropic" },
  { id: "anthropic/claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", provider: "Anthropic" },
  { id: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash", provider: "Google" },
  { id: "google/gemini-pro-1.5", label: "Gemini Pro 1.5", provider: "Google" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", provider: "Meta" },
  { id: "mistralai/mistral-large-latest", label: "Mistral Large", provider: "Mistral" },
  { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3", provider: "DeepSeek" },
  { id: "qwen/qwen-2.5-72b-instruct", label: "Qwen 2.5 72B", provider: "Qwen" },
];

// In-memory stores
let agents: AgentConfig[] = [];
const executions: AgentExecution[] = [];

// OpenRouter API key (set via env or per-request)
export function getOpenRouterKey(): string | null {
  return process.env.OPENROUTER_API_KEY || null;
}

export function getAgents(): AgentConfig[] {
  return [...agents];
}

export function getAgentById(id: string): AgentConfig | null {
  return agents.find((a) => a.id === id) || null;
}

export function createAgent(
  config: Omit<AgentConfig, "id" | "createdAt" | "updatedAt">
): AgentConfig {
  const agent: AgentConfig = {
    ...config,
    id: `agent-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  agents.push(agent);
  return agent;
}

export function updateAgent(
  id: string,
  update: Partial<AgentConfig>
): AgentConfig | null {
  const index = agents.findIndex((a) => a.id === id);
  if (index === -1) return null;
  agents[index] = {
    ...agents[index],
    ...update,
    updatedAt: new Date().toISOString(),
  };
  return agents[index];
}

export function deleteAgent(id: string): boolean {
  const index = agents.findIndex((a) => a.id === id);
  if (index === -1) return false;
  agents.splice(index, 1);
  return true;
}

export function addExecution(exec: Omit<AgentExecution, "id">): AgentExecution {
  const execution: AgentExecution = { ...exec, id: `exec-${Date.now()}` };
  executions.push(execution);
  return execution;
}

export function getExecutions(agentId?: string): AgentExecution[] {
  if (agentId) return executions.filter((e) => e.agentId === agentId);
  return [...executions];
}

// Execute an agent via OpenRouter
export async function executeAgent(
  agent: AgentConfig,
  userInput: string,
  modelOverride?: string,
  apiKeyOverride?: string
): Promise<string> {
  const examplesContext = agent.examplePosts
    .map(
      (ex, i) =>
        `مثال ${i + 1}:\nالعنوان: ${ex.title}\nالمحتوى: ${ex.content}`
    )
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
