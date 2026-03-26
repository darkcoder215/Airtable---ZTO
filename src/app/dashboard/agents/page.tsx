"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import {
  Bot,
  Plus,
  Edit3,
  Trash2,
  Save,
  X,
  Loader2,
  Play,
  Eye,
  Sparkles,
  Settings,
  FileText,
  Zap,
  PenTool,
  Filter,
  Scissors,
  BookOpen,
  ToggleLeft,
  ToggleRight,
  Send,
  Copy,
  AlertCircle,
} from "lucide-react";

/* ───────── Types ───────── */

interface ExamplePost {
  id: string;
  title: string;
  content: string;
  source: "manual" | "airtable";
}

interface AgentConfig {
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

/* ───────── Constants ───────── */

const AGENT_TYPES = [
  { value: "writing", label: "كتابة", icon: PenTool, color: "text-blue-400", bg: "bg-blue-400/10" },
  { value: "filtering", label: "فلترة", icon: Filter, color: "text-purple-400", bg: "bg-purple-400/10" },
  { value: "editing", label: "تحرير", icon: Scissors, color: "text-amber-400", bg: "bg-amber-400/10" },
  { value: "summarizing", label: "تلخيص", icon: BookOpen, color: "text-emerald-400", bg: "bg-emerald-400/10" },
];

const MODEL_PROVIDERS = [
  { value: "openai", label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"] },
  { value: "anthropic", label: "Anthropic", models: ["claude-opus-4-20250514", "claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"] },
  { value: "google", label: "Google", models: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"] },
];

const defaultFormData = {
  name: "",
  description: "",
  modelProvider: "openai" as "openai" | "anthropic" | "google" | "custom",
  modelName: "gpt-4o",
  apiKey: "",
  systemPrompt: "",
  examplePosts: [] as ExamplePost[],
  temperature: 0.7,
  maxTokens: 2000,
  agentType: "writing" as "writing" | "filtering" | "editing" | "summarizing",
  isActive: true,
  createdBy: "",
};

/* ───────── Component ───────── */

export default function AgentsPage() {
  const { user, addToast } = useAppStore();

  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"list" | "execute">("list");

  // Execute state
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null);
  const [executeInput, setExecuteInput] = useState("");
  const [executing, setExecuting] = useState(false);
  const [previewResult, setPreviewResult] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [executionError, setExecutionError] = useState("");

  // Form state
  const [formData, setFormData] = useState({ ...defaultFormData });
  const [showExampleForm, setShowExampleForm] = useState(false);
  const [exampleTitle, setExampleTitle] = useState("");
  const [exampleContent, setExampleContent] = useState("");

  useEffect(() => {
    loadAgents();
  }, []);

  /* ───────── API helpers ───────── */

  const loadAgents = () => {
    setLoading(true);
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => {
        if (data.agents) setAgents(data.agents);
      })
      .catch(() => addToast("فشل تحميل الوكلاء", "error"))
      .finally(() => setLoading(false));
  };

  const handleSave = async () => {
    if (!formData.name) {
      addToast("أدخل اسم الوكيل", "warning");
      return;
    }
    if (!formData.apiKey) {
      addToast("أدخل مفتاح API", "warning");
      return;
    }
    if (!formData.systemPrompt) {
      addToast("أدخل تعليمات النظام", "warning");
      return;
    }
    setSaving(true);
    try {
      const action = editingAgent ? "update" : "create";
      const body = editingAgent
        ? { action, id: editingAgent.id, ...formData }
        : { action, ...formData, createdBy: user?.id };

      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        addToast(editingAgent ? "تم تحديث الوكيل" : "تم إنشاء الوكيل", "success");
        loadAgents();
        closeModal();
      } else {
        addToast(data.error || "فشلت العملية", "error");
      }
    } catch {
      addToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (res.ok) {
        addToast("تم حذف الوكيل", "success");
        loadAgents();
      }
    } catch {
      addToast("فشل الحذف", "error");
    }
  };

  const handleToggleActive = async (agent: AgentConfig) => {
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: agent.id, isActive: !agent.isActive }),
      });
      if (res.ok) {
        addToast(agent.isActive ? "تم تعطيل الوكيل" : "تم تفعيل الوكيل", "success");
        loadAgents();
      }
    } catch {
      addToast("حدث خطأ", "error");
    }
  };

  const handleExecute = async (preview = false) => {
    if (!selectedAgent || !executeInput.trim()) {
      addToast("اختر وكيل وأدخل النص", "warning");
      return;
    }
    setExecuting(true);
    setExecutionError("");
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: preview ? "preview" : "execute",
          agentId: selectedAgent.id,
          input: executeInput,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const output = preview ? data.preview : data.execution?.output;
        setPreviewResult(output || "");
        setShowPreview(true);
        if (!preview) addToast("تم التنفيذ بنجاح", "success");
      } else {
        setExecutionError(data.error || "فشل التنفيذ");
        addToast(data.error || "فشل التنفيذ. تأكد من مفتاح API.", "error");
      }
    } catch {
      addToast("حدث خطأ أثناء التنفيذ", "error");
      setExecutionError("خطأ في الاتصال");
    } finally {
      setExecuting(false);
    }
  };

  /* ───────── Modal helpers ───────── */

  const openEdit = (agent: AgentConfig) => {
    setEditingAgent(agent);
    setFormData({ ...agent, examplePosts: [...agent.examplePosts] });
    setShowCreateModal(true);
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setEditingAgent(null);
    setShowExampleForm(false);
    setFormData({ ...defaultFormData });
  };

  const addExample = () => {
    if (!exampleTitle || !exampleContent) {
      addToast("العنوان والمحتوى مطلوبان", "warning");
      return;
    }
    setFormData((prev) => ({
      ...prev,
      examplePosts: [
        ...prev.examplePosts,
        { id: `ex-${Date.now()}`, title: exampleTitle, content: exampleContent, source: "manual" },
      ],
    }));
    setExampleTitle("");
    setExampleContent("");
    setShowExampleForm(false);
  };

  const providerModels =
    MODEL_PROVIDERS.find((p) => p.value === formData.modelProvider)?.models || [];

  /* ───────── Render ───────── */

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-amber-400" />
            وكلاء الذكاء الاصطناعي
          </h2>
          <p className="text-neutral-500 text-sm mt-1">
            إنشاء وإدارة وكلاء الذكاء الاصطناعي
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Tab switcher */}
          <div className="flex bg-[#1a1a1a] border border-neutral-800 rounded-lg p-0.5">
            <button
              onClick={() => setActiveTab("list")}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${
                activeTab === "list"
                  ? "bg-white text-black"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              الإعدادات
            </button>
            <button
              onClick={() => setActiveTab("execute")}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${
                activeTab === "execute"
                  ? "bg-white text-black"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              التنفيذ
            </button>
          </div>

          {user?.role === "admin" && activeTab === "list" && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="zto-btn zto-btn-gold"
            >
              <Plus className="w-4 h-4" />
              وكيل جديد
            </button>
          )}
        </div>
      </div>

      {/* ───── List Tab ───── */}
      {activeTab === "list" && (
        <>
          {loading ? (
            <div className="zto-card p-16 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
            </div>
          ) : agents.length === 0 ? (
            <div className="zto-card p-16 text-center">
              <Bot className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
              <p className="text-neutral-500 text-sm font-bold mb-1">لا يوجد وكلاء بعد</p>
              <p className="text-neutral-600 text-xs mb-4">أنشئ وكيلا جديدا للبدء</p>
              {user?.role === "admin" && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="zto-btn zto-btn-gold"
                >
                  <Plus className="w-4 h-4" />
                  إنشاء وكيل جديد
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {agents.map((agent) => {
                const agentType = AGENT_TYPES.find((t) => t.value === agent.agentType);
                const Icon = agentType?.icon || Bot;
                return (
                  <div
                    key={agent.id}
                    className="zto-card p-5 hover:border-neutral-700 transition-colors"
                  >
                    {/* Card top */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            agentType?.bg || "bg-neutral-800"
                          }`}
                        >
                          <Icon
                            className={`w-5 h-5 ${agentType?.color || "text-neutral-400"}`}
                          />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-white">{agent.name}</h3>
                          <p className="text-[0.65rem] text-neutral-500 font-bold uppercase tracking-wider">
                            {agentType?.label}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleToggleActive(agent)}
                        title={agent.isActive ? "مفعل" : "معطل"}
                        className="transition-colors"
                      >
                        {agent.isActive ? (
                          <ToggleRight className="w-6 h-6 text-emerald-400" />
                        ) : (
                          <ToggleLeft className="w-6 h-6 text-neutral-600" />
                        )}
                      </button>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-neutral-400 mb-3 line-clamp-2">
                      {agent.description || "بدون وصف"}
                    </p>

                    {/* Badges */}
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                      <span className="zto-badge zto-badge-info">{agent.modelProvider}</span>
                      <span className="zto-badge zto-badge-default">{agent.modelName}</span>
                      <span className="zto-badge zto-badge-default">
                        {agent.examplePosts.length} مثال
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 pt-3 border-t border-neutral-800">
                      <button
                        onClick={() => {
                          setSelectedAgent(agent);
                          setActiveTab("execute");
                        }}
                        className="zto-btn zto-btn-ghost zto-btn-sm flex-1 text-amber-400"
                      >
                        <Play className="w-3.5 h-3.5" />
                        تشغيل
                      </button>
                      {user?.role === "admin" && (
                        <>
                          <button
                            onClick={() => openEdit(agent)}
                            className="zto-btn zto-btn-ghost zto-btn-sm"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(agent.id)}
                            className="zto-btn zto-btn-ghost zto-btn-sm text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ───── Execute Tab ───── */}
      {activeTab === "execute" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input panel */}
          <div className="zto-card p-5 space-y-4">
            <h3 className="font-black text-base text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              تنفيذ الوكيل
            </h3>

            {/* Agent selector */}
            <div>
              <label className="zto-label">الوكيل</label>
              <div className="zto-select-wrap">
                <select
                  className="zto-input"
                  value={selectedAgent?.id || ""}
                  onChange={(e) =>
                    setSelectedAgent(agents.find((a) => a.id === e.target.value) || null)
                  }
                >
                  <option value="">-- اختر وكيل --</option>
                  {agents
                    .filter((a) => a.isActive)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({AGENT_TYPES.find((t) => t.value === a.agentType)?.label})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Selected agent info */}
            {selectedAgent && (
              <div className="bg-[#1a1a1a] border border-neutral-800 rounded-lg p-4 space-y-2">
                <p className="font-bold text-sm text-white">{selectedAgent.name}</p>
                <p className="text-xs text-neutral-500">{selectedAgent.description}</p>
                <div className="flex gap-2 flex-wrap">
                  <span className="zto-badge zto-badge-info">
                    {selectedAgent.modelProvider} / {selectedAgent.modelName}
                  </span>
                  <span className="zto-badge zto-badge-default">
                    حرارة: {selectedAgent.temperature}
                  </span>
                  <span className="zto-badge zto-badge-default">
                    {selectedAgent.examplePosts.length} مثال
                  </span>
                </div>
              </div>
            )}

            {/* Input textarea */}
            <div>
              <label className="zto-label">النص المدخل</label>
              <textarea
                className="zto-input min-h-[180px]"
                placeholder="أدخل النص أو الطلب هنا..."
                value={executeInput}
                onChange={(e) => setExecuteInput(e.target.value)}
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExecute(true)}
                disabled={executing || !selectedAgent || !executeInput.trim()}
                className="zto-btn zto-btn-outline flex-1"
              >
                {executing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
                معاينة
              </button>
              <button
                onClick={() => handleExecute(false)}
                disabled={executing || !selectedAgent || !executeInput.trim()}
                className="zto-btn zto-btn-gold flex-1"
              >
                {executing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                تنفيذ
              </button>
            </div>
          </div>

          {/* Result panel */}
          <div className="zto-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                النتيجة
              </h3>
              {previewResult && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(previewResult);
                    addToast("تم النسخ", "success");
                  }}
                  className="zto-btn zto-btn-ghost zto-btn-sm"
                >
                  <Copy className="w-3.5 h-3.5" />
                  نسخ
                </button>
              )}
            </div>

            {/* Error */}
            {executionError && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span className="text-sm text-red-400 font-medium">{executionError}</span>
              </div>
            )}

            {/* Result content */}
            {showPreview && previewResult ? (
              <div className="bg-[#1a1a1a] border border-neutral-800 rounded-lg p-5 min-h-[280px] max-h-[500px] overflow-y-auto">
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
                  {previewResult}
                </div>
              </div>
            ) : (
              <div className="bg-[#1a1a1a] border border-neutral-800 rounded-lg p-12 text-center min-h-[280px] flex items-center justify-center">
                <div>
                  <Sparkles className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
                  <p className="text-neutral-600 text-sm font-bold">ستظهر النتيجة هنا</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───── Create / Edit Modal ───── */}
      {showCreateModal && (
        <div className="zto-overlay" onClick={closeModal}>
          <div
            className="zto-modal w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Bot className="w-4 h-4 text-amber-400" />
                {editingAgent ? "تعديل الوكيل" : "وكيل جديد"}
              </h3>
              <button
                onClick={closeModal}
                className="text-neutral-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-5 space-y-5 max-h-[65vh] overflow-y-auto">
              {/* Name + Type */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="zto-label">اسم الوكيل *</label>
                  <input
                    type="text"
                    className="zto-input"
                    placeholder="كاتب المقالات"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, name: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="zto-label">النوع</label>
                  <div className="zto-select-wrap">
                    <select
                      className="zto-input"
                      value={formData.agentType}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          agentType: e.target.value as typeof formData.agentType,
                        }))
                      }
                    >
                      {AGENT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="zto-label">الوصف</label>
                <input
                  type="text"
                  className="zto-input"
                  placeholder="وصف مختصر للوكيل"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, description: e.target.value }))
                  }
                />
              </div>

              {/* Model settings card */}
              <div className="bg-[#1a1a1a] border border-neutral-800 rounded-xl p-4 space-y-4">
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <Settings className="w-4 h-4 text-amber-400" />
                  إعدادات النموذج
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Provider */}
                  <div>
                    <label className="zto-label">المزود</label>
                    <div className="zto-select-wrap">
                      <select
                        className="zto-input"
                        value={formData.modelProvider}
                        onChange={(e) => {
                          const prov = e.target.value as typeof formData.modelProvider;
                          const models =
                            MODEL_PROVIDERS.find((p) => p.value === prov)?.models || [];
                          setFormData((p) => ({
                            ...p,
                            modelProvider: prov,
                            modelName: models[0] || "",
                          }));
                        }}
                      >
                        {MODEL_PROVIDERS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Model */}
                  <div>
                    <label className="zto-label">النموذج</label>
                    <div className="zto-select-wrap">
                      <select
                        className="zto-input"
                        value={formData.modelName}
                        onChange={(e) =>
                          setFormData((p) => ({ ...p, modelName: e.target.value }))
                        }
                      >
                        {providerModels.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* API Key */}
                <div>
                  <label className="zto-label">مفتاح API *</label>
                  <input
                    type="password"
                    className="zto-input"
                    placeholder="sk-..."
                    value={formData.apiKey}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, apiKey: e.target.value }))
                    }
                  />
                </div>

                {/* Temperature + Max Tokens */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="zto-label">
                      الحرارة: {formData.temperature}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      className="w-full accent-amber-400 mt-1"
                      value={formData.temperature}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          temperature: parseFloat(e.target.value),
                        }))
                      }
                    />
                    <div className="flex justify-between text-[0.6rem] text-neutral-600 mt-0.5">
                      <span>دقيق</span>
                      <span>إبداعي</span>
                    </div>
                  </div>
                  <div>
                    <label className="zto-label">الحد الأقصى للرموز</label>
                    <input
                      type="number"
                      className="zto-input"
                      value={formData.maxTokens}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          maxTokens: parseInt(e.target.value) || 2000,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              {/* System Prompt */}
              <div>
                <label className="zto-label">تعليمات النظام (System Prompt) *</label>
                <textarea
                  className="zto-input min-h-[120px]"
                  placeholder="أنت كاتب محتوى محترف تكتب باللغة العربية..."
                  value={formData.systemPrompt}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, systemPrompt: e.target.value }))
                  }
                />
              </div>

              {/* Example posts */}
              <div className="bg-[#1a1a1a] border border-neutral-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    أمثلة مرجعية ({formData.examplePosts.length})
                  </h4>
                  <button
                    onClick={() => setShowExampleForm(true)}
                    className="zto-btn zto-btn-ghost zto-btn-sm text-amber-400"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    إضافة
                  </button>
                </div>
                <p className="text-[0.65rem] text-neutral-600">
                  أمثلة يتعلم منها الوكيل ويحاكيها في الإخراج
                </p>

                {/* Add example form */}
                {showExampleForm && (
                  <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-4 space-y-3">
                    <input
                      type="text"
                      className="zto-input"
                      placeholder="عنوان المثال"
                      value={exampleTitle}
                      onChange={(e) => setExampleTitle(e.target.value)}
                    />
                    <textarea
                      className="zto-input min-h-[80px]"
                      placeholder="محتوى المثال"
                      value={exampleContent}
                      onChange={(e) => setExampleContent(e.target.value)}
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => {
                          setShowExampleForm(false);
                          setExampleTitle("");
                          setExampleContent("");
                        }}
                        className="zto-btn zto-btn-ghost zto-btn-sm"
                      >
                        إلغاء
                      </button>
                      <button
                        onClick={addExample}
                        className="zto-btn zto-btn-gold zto-btn-sm"
                      >
                        <Plus className="w-3 h-3" />
                        إضافة
                      </button>
                    </div>
                  </div>
                )}

                {/* Example list */}
                {formData.examplePosts.map((ex) => (
                  <div
                    key={ex.id}
                    className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 flex items-start gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">{ex.title}</p>
                      <p className="text-xs text-neutral-400 line-clamp-2 mt-1">
                        {ex.content}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setFormData((p) => ({
                          ...p,
                          examplePosts: p.examplePosts.filter((e) => e.id !== ex.id),
                        }))
                      }
                      className="text-red-400 hover:text-red-300 shrink-0 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal footer */}
            <div className="p-5 border-t border-neutral-800 flex items-center gap-3 justify-end">
              <button onClick={closeModal} className="zto-btn zto-btn-ghost">
                إلغاء
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="zto-btn zto-btn-gold"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {editingAgent ? "حفظ التغييرات" : "إنشاء"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
