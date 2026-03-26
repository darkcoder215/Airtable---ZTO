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
  AlertCircle,
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
  { value: "writing", label: "كتابة", icon: PenTool, color: "text-[var(--color-info)]", bg: "bg-[var(--color-info-muted)]" },
  { value: "filtering", label: "فلترة", icon: Filter, color: "text-purple-400", bg: "bg-purple-400/10" },
  { value: "editing", label: "تحرير", icon: Scissors, color: "text-[var(--color-accent)]", bg: "bg-[var(--color-accent-muted)]" },
  { value: "summarizing", label: "تلخيص", icon: BookOpen, color: "text-[var(--color-success)]", bg: "bg-[var(--color-success-muted)]" },
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

  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null);
  const [executeInput, setExecuteInput] = useState("");
  const [executing, setExecuting] = useState(false);
  const [previewResult, setPreviewResult] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [executionError, setExecutionError] = useState("");

  const [formData, setFormData] = useState({
    name: "", description: "", modelProvider: "openai" as "openai" | "anthropic" | "google" | "custom",
    modelName: "gpt-4o", apiKey: "", systemPrompt: "", examplePosts: [] as ExamplePost[],
    temperature: 0.7, maxTokens: 2000, agentType: "writing" as "writing" | "filtering" | "editing" | "summarizing",
    isActive: true, createdBy: "",
  });

  const [showExampleForm, setShowExampleForm] = useState(false);
  const [exampleTitle, setExampleTitle] = useState("");
  const [exampleContent, setExampleContent] = useState("");

  useEffect(() => { loadAgents(); }, []);

  const loadAgents = () => {
    setLoading(true);
    fetch("/api/agents").then((r) => r.json()).then((data) => { if (data.agents) setAgents(data.agents); })
      .catch(() => addToast("فشل تحميل الوكلاء", "error")).finally(() => setLoading(false));
  };

  const handleSave = async () => {
    if (!formData.name) { addToast("أدخل اسم الوكيل", "warning"); return; }
    if (!formData.apiKey) { addToast("أدخل مفتاح API", "warning"); return; }
    if (!formData.systemPrompt) { addToast("أدخل تعليمات النظام", "warning"); return; }

    setSaving(true);
    try {
      const action = editingAgent ? "update" : "create";
      const body = editingAgent
        ? { action, id: editingAgent.id, ...formData }
        : { action, ...formData, createdBy: user?.id };

      const res = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (res.ok) { addToast(editingAgent ? "تم تحديث الوكيل" : "تم إنشاء الوكيل", "success"); loadAgents(); closeModal(); }
      else addToast(data.error || "فشلت العملية", "error");
    } catch { addToast("حدث خطأ", "error"); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) });
      if (res.ok) { addToast("تم حذف الوكيل", "success"); loadAgents(); }
    } catch { addToast("فشل الحذف", "error"); }
  };

  const handleToggleActive = async (agent: AgentConfig) => {
    try {
      const res = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: agent.id, isActive: !agent.isActive }) });
      if (res.ok) { addToast(agent.isActive ? "تم تعطيل الوكيل" : "تم تفعيل الوكيل", "success"); loadAgents(); }
    } catch { addToast("حدث خطأ", "error"); }
  };

  const handleExecute = async (preview = false) => {
    if (!selectedAgent || !executeInput.trim()) { addToast("اختر وكيل وأدخل النص", "warning"); return; }
    setExecuting(true);
    setExecutionError("");
    try {
      const res = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: preview ? "preview" : "execute", agentId: selectedAgent.id, input: executeInput }) });
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
    } catch { addToast("حدث خطأ أثناء التنفيذ", "error"); setExecutionError("خطأ في الاتصال"); } finally { setExecuting(false); }
  };

  const openEdit = (agent: AgentConfig) => {
    setEditingAgent(agent);
    setFormData({ ...agent, examplePosts: [...agent.examplePosts] });
    setShowCreateModal(true);
  };

  const closeModal = () => {
    setShowCreateModal(false); setEditingAgent(null); setShowExampleForm(false);
    setFormData({ name: "", description: "", modelProvider: "openai", modelName: "gpt-4o", apiKey: "",
      systemPrompt: "", examplePosts: [], temperature: 0.7, maxTokens: 2000, agentType: "writing", isActive: true, createdBy: "" });
  };

  const addExample = () => {
    if (!exampleTitle || !exampleContent) { addToast("العنوان والمحتوى مطلوبان", "warning"); return; }
    setFormData((prev) => ({ ...prev, examplePosts: [...prev.examplePosts, { id: `ex-${Date.now()}`, title: exampleTitle, content: exampleContent, source: "manual" }] }));
    setExampleTitle(""); setExampleContent(""); setShowExampleForm(false);
  };

  const providerModels = MODEL_PROVIDERS.find((p) => p.value === formData.modelProvider)?.models || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <p className="text-[var(--color-zto-gray-500)] text-sm">إنشاء وإدارة وكلاء الذكاء الاصطناعي</p>
        <div className="flex items-center gap-3">
          {/* Tab toggle */}
          <div className="flex bg-[var(--color-zto-charcoal)] border border-[var(--color-zto-gray-800)] rounded-lg p-0.5">
            <button onClick={() => setActiveTab("list")}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === "list" ? "bg-[var(--color-zto-white)] text-[var(--color-zto-black)]" : "text-[var(--color-zto-gray-500)]"}`}>
              <Settings className="w-3.5 h-3.5 inline ml-1" />الإعدادات
            </button>
            <button onClick={() => setActiveTab("execute")}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === "execute" ? "bg-[var(--color-zto-white)] text-[var(--color-zto-black)]" : "text-[var(--color-zto-gray-500)]"}`}>
              <Zap className="w-3.5 h-3.5 inline ml-1" />التنفيذ
            </button>
          </div>
          {user?.role === "admin" && (
            <button onClick={() => setShowCreateModal(true)} className="btn-accent">
              <Plus className="w-4 h-4" />وكيل جديد
            </button>
          )}
        </div>
      </div>

      {/* List tab */}
      {activeTab === "list" && (
        loading ? (
          <div className="card p-16 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-zto-gray-500)]" /></div>
        ) : agents.length === 0 ? (
          <div className="card p-16 text-center">
            <Bot className="w-10 h-10 text-[var(--color-zto-gray-700)] mx-auto mb-3" />
            <p className="text-[var(--color-zto-gray-500)] text-sm font-bold mb-4">لا يوجد وكلاء بعد</p>
            {user?.role === "admin" && <button onClick={() => setShowCreateModal(true)} className="btn-accent"><Plus className="w-4 h-4" />إنشاء وكيل جديد</button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {agents.map((agent) => {
              const agentType = AGENT_TYPES.find((t) => t.value === agent.agentType);
              const Icon = agentType?.icon || Bot;
              return (
                <div key={agent.id} className="card p-5 hover:border-[var(--color-zto-gray-700)] transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${agentType?.bg || "bg-[var(--color-zto-gray-800)]"}`}>
                        <Icon className={`w-5 h-5 ${agentType?.color || "text-[var(--color-zto-gray-400)]"}`} />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-[var(--color-zto-white)]">{agent.name}</h3>
                        <p className="text-[0.65rem] text-[var(--color-zto-gray-500)] font-bold uppercase tracking-wider">{agentType?.label}</p>
                      </div>
                    </div>
                    <button onClick={() => handleToggleActive(agent)} title={agent.isActive ? "مفعل" : "معطل"}
                      className={agent.isActive ? "text-[var(--color-success)]" : "text-[var(--color-zto-gray-600)]"}>
                      {agent.isActive ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                    </button>
                  </div>
                  <p className="text-xs text-[var(--color-zto-gray-400)] mb-3 line-clamp-2">{agent.description || "بدون وصف"}</p>
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <span className="badge-primary">{agent.modelProvider}</span>
                    <span className="badge-primary">{agent.modelName}</span>
                    <span className="badge-primary">{agent.examplePosts.length} مثال</span>
                  </div>
                  <div className="flex items-center gap-1 pt-3 border-t border-[var(--color-zto-gray-800)]">
                    <button onClick={() => { setSelectedAgent(agent); setActiveTab("execute"); }}
                      className="btn-ghost text-xs flex-1 text-[var(--color-accent)]">
                      <Play className="w-3.5 h-3.5" />تشغيل
                    </button>
                    {user?.role === "admin" && (
                      <>
                        <button onClick={() => openEdit(agent)} className="btn-ghost text-xs"><Edit3 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(agent.id)} className="btn-ghost text-xs text-[var(--color-danger)]"><Trash2 className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Execute tab */}
      {activeTab === "execute" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-5 space-y-4">
            <h3 className="font-black text-base text-[var(--color-zto-white)] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[var(--color-accent)]" />تنفيذ الوكيل
            </h3>
            <div>
              <label className="label">الوكيل</label>
              <div className="relative">
                <select className="input appearance-none" value={selectedAgent?.id || ""}
                  onChange={(e) => setSelectedAgent(agents.find((a) => a.id === e.target.value) || null)}>
                  <option value="">— اختر وكيل —</option>
                  {agents.filter((a) => a.isActive).map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({AGENT_TYPES.find((t) => t.value === a.agentType)?.label})</option>
                  ))}
                </select>
                <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-zto-gray-600)] pointer-events-none" />
              </div>
            </div>

            {selectedAgent && (
              <div className="bg-[var(--color-zto-dark)] border border-[var(--color-zto-gray-800)] rounded-lg p-4 space-y-2">
                <p className="font-bold text-sm text-[var(--color-zto-white)]">{selectedAgent.name}</p>
                <p className="text-xs text-[var(--color-zto-gray-500)]">{selectedAgent.description}</p>
                <div className="flex gap-2 flex-wrap">
                  <span className="badge-primary">{selectedAgent.modelProvider} / {selectedAgent.modelName}</span>
                  <span className="badge-primary">حرارة: {selectedAgent.temperature}</span>
                  <span className="badge-primary">{selectedAgent.examplePosts.length} مثال</span>
                </div>
              </div>
            )}

            <div>
              <label className="label">النص المدخل</label>
              <textarea className="input min-h-[180px]" placeholder="أدخل النص أو الطلب هنا..."
                value={executeInput} onChange={(e) => setExecuteInput(e.target.value)} />
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => handleExecute(true)} disabled={executing || !selectedAgent || !executeInput.trim()} className="btn-secondary flex-1">
                {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}معاينة
              </button>
              <button onClick={() => handleExecute(false)} disabled={executing || !selectedAgent || !executeInput.trim()} className="btn-accent flex-1">
                {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}تنفيذ
              </button>
            </div>
          </div>

          {/* Result */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base text-[var(--color-zto-white)] flex items-center gap-2">
                <FileText className="w-5 h-5 text-[var(--color-success)]" />النتيجة
              </h3>
              {previewResult && (
                <button onClick={() => { navigator.clipboard.writeText(previewResult); addToast("تم النسخ", "success"); }}
                  className="btn-ghost text-xs"><Copy className="w-3.5 h-3.5" />نسخ</button>
              )}
            </div>

            {executionError && (
              <div className="flex items-center gap-2 bg-[var(--color-danger-muted)] border border-[color-mix(in_srgb,var(--color-danger)_30%,transparent)] rounded-lg px-4 py-3">
                <AlertCircle className="w-4 h-4 text-[var(--color-danger)] shrink-0" />
                <span className="text-sm text-[var(--color-danger)] font-medium">{executionError}</span>
              </div>
            )}

            {showPreview && previewResult ? (
              <div className="bg-[var(--color-zto-dark)] border border-[var(--color-zto-gray-800)] rounded-lg p-5 min-h-[280px] max-h-[500px] overflow-y-auto">
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-zto-gray-200)]">{previewResult}</div>
              </div>
            ) : (
              <div className="bg-[var(--color-zto-dark)] border border-[var(--color-zto-gray-800)] rounded-lg p-12 text-center min-h-[280px] flex items-center justify-center">
                <div>
                  <Sparkles className="w-8 h-8 text-[var(--color-zto-gray-700)] mx-auto mb-3" />
                  <p className="text-[var(--color-zto-gray-600)] text-sm font-bold">ستظهر النتيجة هنا</p>
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
            <div className="p-5 border-b border-[var(--color-zto-gray-800)] flex items-center justify-between">
              <h3 className="text-base font-black text-[var(--color-zto-white)] flex items-center gap-2">
                <Bot className="w-4 h-4 text-[var(--color-accent)]" />
                {editingAgent ? "تعديل الوكيل" : "وكيل جديد"}
              </h3>
              <button onClick={closeModal} className="text-[var(--color-zto-gray-500)] hover:text-[var(--color-zto-white)]"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-5 max-h-[65vh] overflow-y-auto">
              {/* Basic */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">اسم الوكيل *</label>
                  <input type="text" className="input" placeholder="كاتب المقالات" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">النوع</label>
                  <div className="relative">
                    <select className="input appearance-none" value={formData.agentType}
                      onChange={(e) => setFormData((p) => ({ ...p, agentType: e.target.value as typeof formData.agentType }))}>
                      {AGENT_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                    </select>
                    <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-zto-gray-600)] pointer-events-none" />
                  </div>
                </div>
              </div>
              <div>
                <label className="label">الوصف</label>
                <input type="text" className="input" placeholder="وصف مختصر" value={formData.description} onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))} />
              </div>

              {/* Model */}
              <div className="card-elevated p-4 space-y-4">
                <h4 className="font-bold text-sm text-[var(--color-zto-white)] flex items-center gap-2">
                  <Settings className="w-4 h-4 text-[var(--color-accent)]" />إعدادات النموذج
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">المزود</label>
                    <div className="relative">
                      <select className="input appearance-none" value={formData.modelProvider}
                        onChange={(e) => {
                          const prov = e.target.value as typeof formData.modelProvider;
                          const models = MODEL_PROVIDERS.find((p) => p.value === prov)?.models || [];
                          setFormData((p) => ({ ...p, modelProvider: prov, modelName: models[0] || "" }));
                        }}>
                        {MODEL_PROVIDERS.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
                      </select>
                      <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-zto-gray-600)] pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="label">النموذج</label>
                    <div className="relative">
                      <select className="input appearance-none" value={formData.modelName}
                        onChange={(e) => setFormData((p) => ({ ...p, modelName: e.target.value }))}>
                        {providerModels.map((m) => (<option key={m} value={m}>{m}</option>))}
                      </select>
                      <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-zto-gray-600)] pointer-events-none" />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="label">مفتاح API *</label>
                  <input type="password" className="input" placeholder="sk-..." value={formData.apiKey} onChange={(e) => setFormData((p) => ({ ...p, apiKey: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">الحرارة: {formData.temperature}</label>
                    <input type="range" min="0" max="2" step="0.1" className="w-full" value={formData.temperature}
                      onChange={(e) => setFormData((p) => ({ ...p, temperature: parseFloat(e.target.value) }))} />
                    <div className="flex justify-between text-[0.6rem] text-[var(--color-zto-gray-600)]"><span>دقيق</span><span>إبداعي</span></div>
                  </div>
                  <div>
                    <label className="label">الحد الأقصى للرموز</label>
                    <input type="number" className="input" value={formData.maxTokens}
                      onChange={(e) => setFormData((p) => ({ ...p, maxTokens: parseInt(e.target.value) || 2000 }))} />
                  </div>
                </div>
              </div>

              {/* Prompt */}
              <div>
                <label className="label">تعليمات النظام (System Prompt) *</label>
                <textarea className="input min-h-[120px]" placeholder="أنت كاتب محتوى محترف تكتب باللغة العربية..."
                  value={formData.systemPrompt} onChange={(e) => setFormData((p) => ({ ...p, systemPrompt: e.target.value }))} />
              </div>

              {/* Examples */}
              <div className="card-elevated p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-[var(--color-zto-white)] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[var(--color-success)]" />أمثلة مرجعية ({formData.examplePosts.length})
                  </h4>
                  <button onClick={() => setShowExampleForm(true)} className="btn-ghost text-xs text-[var(--color-accent)]"><Plus className="w-3.5 h-3.5" />إضافة</button>
                </div>
                <p className="text-[0.65rem] text-[var(--color-zto-gray-600)]">أمثلة يتعلم منها الوكيل ويحاكيها في الإخراج</p>

                {showExampleForm && (
                  <div className="bg-[var(--color-zto-charcoal)] border border-[var(--color-zto-gray-700)] rounded-lg p-4 space-y-3">
                    <input type="text" className="input" placeholder="عنوان المثال" value={exampleTitle} onChange={(e) => setExampleTitle(e.target.value)} />
                    <textarea className="input min-h-[80px]" placeholder="محتوى المثال" value={exampleContent} onChange={(e) => setExampleContent(e.target.value)} />
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => { setShowExampleForm(false); setExampleTitle(""); setExampleContent(""); }} className="btn-ghost text-xs">إلغاء</button>
                      <button onClick={addExample} className="btn-accent text-xs"><Plus className="w-3 h-3" />إضافة</button>
                    </div>
                  </div>
                )}

                {formData.examplePosts.map((ex) => (
                  <div key={ex.id} className="bg-[var(--color-zto-charcoal)] border border-[var(--color-zto-gray-800)] rounded-lg p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[var(--color-zto-white)]">{ex.title}</p>
                      <p className="text-xs text-[var(--color-zto-gray-400)] line-clamp-2 mt-1">{ex.content}</p>
                    </div>
                    <button onClick={() => setFormData((p) => ({ ...p, examplePosts: p.examplePosts.filter((e) => e.id !== ex.id) }))}
                      className="text-[var(--color-danger)] hover:text-[var(--color-danger)] shrink-0"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-5 border-t border-[var(--color-zto-gray-800)] flex items-center gap-3 justify-end">
              <button onClick={closeModal} className="btn-secondary">إلغاء</button>
              <button onClick={handleSave} disabled={saving} className="btn-accent">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingAgent ? "حفظ التغييرات" : "إنشاء"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
