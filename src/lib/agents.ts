// AI Agent configuration storage - in memory for now

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  modelProvider: "openai" | "anthropic" | "google" | "custom";
  modelName: string;
  apiKey: string;
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
  input: string;
  output: string;
  status: "pending" | "running" | "completed" | "error";
  error?: string;
  executedAt: string;
  executedBy: string;
}

// In-memory stores
let agents: AgentConfig[] = [];
const executions: AgentExecution[] = [];

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

// Execute an agent by calling the configured model API
export async function executeAgent(
  agent: AgentConfig,
  userInput: string
): Promise<string> {
  const examplesContext = agent.examplePosts
    .map(
      (ex, i) =>
        `مثال ${i + 1}:\nالعنوان: ${ex.title}\nالمحتوى: ${ex.content}`
    )
    .join("\n\n");

  const fullPrompt = `${agent.systemPrompt}\n\n${examplesContext ? `أمثلة مرجعية:\n${examplesContext}\n\n` : ""}طلب المستخدم: ${userInput}`;

  if (agent.modelProvider === "openai") {
    return callOpenAI(agent.apiKey, agent.modelName, fullPrompt, agent.temperature, agent.maxTokens);
  } else if (agent.modelProvider === "anthropic") {
    return callAnthropic(agent.apiKey, agent.modelName, fullPrompt, agent.temperature, agent.maxTokens);
  } else if (agent.modelProvider === "google") {
    return callGoogle(agent.apiKey, agent.modelName, fullPrompt, agent.temperature, agent.maxTokens);
  } else {
    throw new Error(`مزود النموذج غير مدعوم: ${agent.modelProvider}`);
  }
}

async function callOpenAI(
  apiKey: string,
  model: string,
  prompt: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`خطأ من OpenAI: ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callAnthropic(
  apiKey: string,
  model: string,
  prompt: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`خطأ من Anthropic: ${error}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

async function callGoogle(
  apiKey: string,
  model: string,
  prompt: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`خطأ من Google: ${error}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}
