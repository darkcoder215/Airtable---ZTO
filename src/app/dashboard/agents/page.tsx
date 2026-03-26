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
  ChevronDown,
  Zap,
  PenTool,
  Filter,
  Scissors,
  BookOpen,
  ToggleLeft,
  ToggleRight,
  Send,
  Copy,
} from "lucide-react";

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

const AGENT_TYPES = [
  { value: "writing", label: "كتابة المحتوى", icon: PenTool, color: "text-blue-600 bg-blue-50" },
  { value: "filtering", label: "فلترة وتصنيف", icon: Filter, color: "text-purple-600 bg-purple-50" },
  { value: "editing", label: "تحرير وتدقيق", icon: Scissors, color: "text-amber-600 bg-amber-50" },
  { value: "summarizing", label: "تلخيص", icon: BookOpen, color: "text-green-600 bg-green-50" },
];

const MODEL_PROVIDERS = [
  { value: "openai", label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"] },
  { value: "anthropic", label: "Anthropic", models: ["claude-opus-4-20250514", "claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"] },
  { value: "google", label: "Google", models: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"] },
];

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

  // Form state
  const [formData, setFormData] = useState({
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
  });

  // Example post form
  const [showExampleForm, setShowExampleForm] = useState(false);
  const [exampleTitle, setExampleTitle] = useState("");
  const [exampleContent, setExampleContent] = useState("");

  useEffect(() => {
    loadAgents();
  }, []);

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
    if (!formData.name || !formData.apiKey || !formData.systemPrompt) {
      addToast("يرجى ملء جميع الحقول المطلوبة", "error");
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
    if (!confirm("هل أنت متأكد من حذف هذا الوكيل؟")) return;
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
        body: JSON.stringify({
          action: "update",
          id: agent.id,
          isActive: !agent.isActive,
        }),
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
    if (!selectedAgent || !executeInput) {
      addToast("اختر وكيل وأدخل النص", "error");
      return;
    }
    setExecuting(true);
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
        addToast(data.error || "فشل التنفيذ", "error");
      }
    } catch {
      addToast("حدث خطأ أثناء التنفيذ", "error");
    } finally {
      setExecuting(false);
    }
  };

  const openEdit = (agent: AgentConfig) => {
    setEditingAgent(agent);
    setFormData({
      name: agent.name,
      description: agent.description,
      modelProvider: agent.modelProvider,
      modelName: agent.modelName,
      apiKey: agent.apiKey,
      systemPrompt: agent.systemPrompt,
      examplePosts: [...agent.examplePosts],
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      agentType: agent.agentType,
      isActive: agent.isActive,
      createdBy: agent.createdBy,
    });
    setShowCreateModal(true);
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setEditingAgent(null);
    setFormData({
      name: "",
      description: "",
      modelProvider: "openai",
      modelName: "gpt-4o",
      apiKey: "",
      systemPrompt: "",
      examplePosts: [],
      temperature: 0.7,
      maxTokens: 2000,
      agentType: "writing",
      isActive: true,
      createdBy: "",
    });
    setShowExampleForm(false);
  };

  const addExample = () => {
    if (!exampleTitle || !exampleContent) {
      addToast("العنوان والمحتوى مطلوبان", "error");
      return;
    }
    const newExample: ExamplePost = {
      id: `ex-${Date.now()}`,
      title: exampleTitle,
      content: exampleContent,
      source: "manual",
    };
    setFormData((prev) => ({
      ...prev,
      examplePosts: [...prev.examplePosts, newExample],
    }));
    setExampleTitle("");
    setExampleContent("");
    setShowExampleForm(false);
  };

  const removeExample = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      examplePosts: prev.examplePosts.filter((e) => e.id !== id),
    }));
  };

  const providerModels = MODEL_PROVIDERS.find((p) => p.value === formData.modelProvider)?.models || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Bot className="w-7 h-7 text-primary-600" />
            وكلاء الكتابة
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            إنشاء وإدارة وكلاء الذكاء الاصطناعي للكتابة والفلترة والتحرير
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-surface-tertiary rounded-xl p-1">
            <button
              onClick={() => setActiveTab("list")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "list" ? "bg-surface shadow-sm text-primary-700" : "text-text-secondary"
              }`}
            >
              <Settings className="w-4 h-4 inline ml-1" />
              الإعدادات
            </button>
            <button
              onClick={() => setActiveTab("execute")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "execute" ? "bg-surface shadow-sm text-primary-700" : "text-text-secondary"
              }`}
            >
              <Zap className="w-4 h-4 inline ml-1" />
              التنفيذ
            </button>
          </div>
          {user?.role === "admin" && (
            <button onClick={() => setShowCreateModal(true)} className="btn-primary">
              <Plus className="w-4 h-4" />
              وكيل جديد
            </button>
          )}
        </div>
      </div>

      {/* Agents list tab */}
      {activeTab === "list" && (
        <>
          {loading ? (
            <div className="card p-12 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : agents.length === 0 ? (
            <div className="card p-12 text-center">
              <Bot className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
              <p className="text-text-secondary mb-4">لا يوجد وكلاء بعد</p>
              {user?.role === "admin" && (
                <button onClick={() => setShowCreateModal(true)} className="btn-primary">
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
                  <div key={agent.id} className="card p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${agentType?.color || "bg-surface-tertiary text-text-secondary"}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm">{agent.name}</h3>
                          <p className="text-xs text-text-tertiary">{agentType?.label}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleToggleActive(agent)}
                        className={`transition-colors ${agent.isActive ? "text-accent-500" : "text-text-tertiary"}`}
                        title={agent.isActive ? "مفعل" : "معطل"}
                      >
                        {agent.isActive ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                      </button>
                    </div>
                    <p className="text-sm text-text-secondary mb-3 line-clamp-2">{agent.description}</p>
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <span className="badge-primary">{agent.modelProvider}</span>
                      <span className="badge bg-surface-tertiary text-text-secondary">{agent.modelName}</span>
                      <span className="badge bg-surface-tertiary text-text-secondary">
                        {agent.examplePosts.length} مثال
                      </span>
                    </div>
                    <div className="flex items-center gap-1 pt-3 border-t border-border">
                      <button
                        onClick={() => {
                          setSelectedAgent(agent);
                          setActiveTab("execute");
                        }}
                        className="btn-ghost text-xs flex-1 text-primary-600"
                      >
                        <Play className="w-3.5 h-3.5" />
                        تشغيل
                      </button>
                      {user?.role === "admin" && (
                        <>
                          <button onClick={() => openEdit(agent)} className="btn-ghost text-xs text-text-secondary">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(agent.id)} className="btn-ghost text-xs text-red-600">
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

      {/* Execute tab */}
      {activeTab === "execute" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input section */}
          <div className="card p-5 space-y-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary-600" />
              تنفيذ الوكيل
            </h3>

            <div>
              <label className="label">اختر الوكيل</label>
              <div className="relative">
                <select
                  className="input appearance-none"
                  value={selectedAgent?.id || ""}
                  onChange={(e) => {
                    const a = agents.find((a) => a.id === e.target.value);
                    setSelectedAgent(a || null);
                  }}
                >
                  <option value="">— اختر وكيل —</option>
                  {agents.filter((a) => a.isActive).map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({AGENT_TYPES.find((t) => t.value === a.agentType)?.label})</option>
                  ))}
                </select>
                <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
              </div>
            </div>

            {selectedAgent && (
              <div className="bg-surface-tertiary rounded-xl p-4 text-sm space-y-2">
                <p className="font-medium">{selectedAgent.name}</p>
                <p className="text-text-secondary text-xs">{selectedAgent.description}</p>
                <div className="flex gap-2 flex-wrap">
                  <span className="badge-primary">{selectedAgent.modelProvider} / {selectedAgent.modelName}</span>
                  <span className="badge bg-surface text-text-secondary">
                    حرارة: {selectedAgent.temperature}
                  </span>
                  <span className="badge bg-surface text-text-secondary">
                    {selectedAgent.examplePosts.length} مثال
                  </span>
                </div>
              </div>
            )}

            <div>
              <label className="label">النص المدخل</label>
              <textarea
                className="input min-h-[200px] resize-y"
                placeholder="أدخل النص أو الطلب هنا..."
                value={executeInput}
                onChange={(e) => setExecuteInput(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExecute(true)}
                disabled={executing || !selectedAgent || !executeInput}
                className="btn-secondary flex-1"
              >
                {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                معاينة
              </button>
              <button
                onClick={() => handleExecute(false)}
                disabled={executing || !selectedAgent || !executeInput}
                className="btn-primary flex-1"
              >
                {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                تنفيذ
              </button>
            </div>
          </div>

          {/* Preview section */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-accent-500" />
                النتيجة
              </h3>
              {previewResult && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(previewResult);
                    addToast("تم النسخ", "success");
                  }}
                  className="btn-ghost text-xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  نسخ
                </button>
              )}
            </div>

            {showPreview && previewResult ? (
              <div className="bg-surface-tertiary rounded-xl p-5 min-h-[300px] max-h-[500px] overflow-y-auto">
                <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                  {previewResult}
                </div>
              </div>
            ) : (
              <div className="bg-surface-tertiary rounded-xl p-12 text-center min-h-[300px] flex items-center justify-center">
                <div>
                  <Sparkles className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
                  <p className="text-text-tertiary text-sm">ستظهر النتيجة هنا بعد التنفيذ</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary-600" />
                {editingAgent ? "تعديل الوكيل" : "إنشاء وكيل جديد"}
              </h3>
              <button onClick={closeModal} className="text-text-tertiary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Basic info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">اسم الوكيل *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="مثل: كاتب المقالات"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">نوع الوكيل</label>
                  <div className="relative">
                    <select
                      className="input appearance-none"
                      value={formData.agentType}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          agentType: e.target.value as typeof formData.agentType,
                        }))
                      }
                    >
                      {AGENT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
                  </div>
                </div>
              </div>

              <div>
                <label className="label">الوصف</label>
                <input
                  type="text"
                  className="input"
                  placeholder="وصف مختصر للوكيل"
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>

              {/* Model config */}
              <div className="border border-border rounded-xl p-4 space-y-4">
                <h4 className="font-bold text-sm flex items-center gap-2">
                  <Settings className="w-4 h-4 text-primary-600" />
                  إعدادات النموذج
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">المزود</label>
                    <div className="relative">
                      <select
                        className="input appearance-none"
                        value={formData.modelProvider}
                        onChange={(e) => {
                          const provider = e.target.value as typeof formData.modelProvider;
                          const models = MODEL_PROVIDERS.find((p) => p.value === provider)?.models || [];
                          setFormData((prev) => ({
                            ...prev,
                            modelProvider: provider,
                            modelName: models[0] || "",
                          }));
                        }}
                      >
                        {MODEL_PROVIDERS.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="label">النموذج</label>
                    <div className="relative">
                      <select
                        className="input appearance-none"
                        value={formData.modelName}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, modelName: e.target.value }))
                        }
                      >
                        {providerModels.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="label">مفتاح API *</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="أدخل مفتاح API الخاص بالمزود"
                    value={formData.apiKey}
                    onChange={(e) => setFormData((prev) => ({ ...prev, apiKey: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">الحرارة ({formData.temperature})</label>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      className="w-full"
                      value={formData.temperature}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, temperature: parseFloat(e.target.value) }))
                      }
                    />
                    <div className="flex justify-between text-[10px] text-text-tertiary">
                      <span>دقيق</span>
                      <span>إبداعي</span>
                    </div>
                  </div>
                  <div>
                    <label className="label">الحد الأقصى للرموز</label>
                    <input
                      type="number"
                      className="input"
                      value={formData.maxTokens}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, maxTokens: parseInt(e.target.value) || 2000 }))
                      }
                    />
                  </div>
                </div>
              </div>

              {/* System prompt */}
              <div>
                <label className="label">تعليمات النظام (System Prompt) *</label>
                <textarea
                  className="input min-h-[150px] resize-y"
                  placeholder="أدخل التعليمات التي سيتبعها الوكيل في كل مرة. مثال: أنت كاتب محتوى محترف تكتب باللغة العربية الفصحى..."
                  value={formData.systemPrompt}
                  onChange={(e) => setFormData((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                />
              </div>

              {/* Example posts */}
              <div className="border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4 text-accent-500" />
                    أمثلة مرجعية ({formData.examplePosts.length})
                  </h4>
                  <button
                    onClick={() => setShowExampleForm(true)}
                    className="btn-ghost text-xs text-primary-600"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    إضافة مثال
                  </button>
                </div>
                <p className="text-xs text-text-tertiary">
                  أضف أمثلة على المنشورات التي تريد أن يتعلم منها الوكيل ويحاكيها
                </p>

                {showExampleForm && (
                  <div className="bg-surface-tertiary rounded-xl p-4 space-y-3">
                    <input
                      type="text"
                      className="input"
                      placeholder="عنوان المثال"
                      value={exampleTitle}
                      onChange={(e) => setExampleTitle(e.target.value)}
                    />
                    <textarea
                      className="input min-h-[100px] resize-y"
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
                        className="btn-ghost text-xs"
                      >
                        إلغاء
                      </button>
                      <button onClick={addExample} className="btn-primary text-xs">
                        <Plus className="w-3 h-3" />
                        إضافة
                      </button>
                    </div>
                  </div>
                )}

                {formData.examplePosts.map((ex) => (
                  <div key={ex.id} className="bg-surface-tertiary rounded-xl p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{ex.title}</p>
                      <p className="text-xs text-text-secondary line-clamp-2 mt-1">{ex.content}</p>
                    </div>
                    <button
                      onClick={() => removeExample(ex.id)}
                      className="text-red-500 hover:text-red-700 shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 border-t border-border flex items-center gap-3 justify-end">
              <button onClick={closeModal} className="btn-secondary">إلغاء</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingAgent ? "حفظ التغييرات" : "إنشاء الوكيل"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
