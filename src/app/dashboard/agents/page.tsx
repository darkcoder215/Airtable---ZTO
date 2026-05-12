"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import PageGuide from "@/components/PageGuide";
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
  FlaskConical,
  Clock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Wand2,
  Lightbulb,
  ListChecks,
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

interface OpenRouterModel {
  id: string;
  label: string;
  // Tier replaced provider — anonymised label so we can group without
  // surfacing vendor branding to end users.
  tier: string;
}

interface TestResult {
  model: string;
  output: string | null;
  duration: number;
  error: string | null;
}

/* ───────── Constants ───────── */

const AGENT_TYPES = [
  { value: "writing", label: "كتابة", icon: PenTool, color: "text-blue-400", bg: "bg-blue-400/10" },
  { value: "filtering", label: "فلترة", icon: Filter, color: "text-purple-400", bg: "bg-purple-400/10" },
  { value: "editing", label: "تحرير", icon: Scissors, color: "text-amber-400", bg: "bg-amber-400/10" },
  { value: "summarizing", label: "تلخيص", icon: BookOpen, color: "text-emerald-400", bg: "bg-emerald-400/10" },
];

type AgentType = "writing" | "filtering" | "editing" | "summarizing";

// Six-step wizard pacing: the create flow walks the admin through
// (1) basics, (2) model, (3) the core system prompt, (4) general
// rules picked from a curated checklist, (5) examples that become
// named templates for writing-type agents, (6) a simulated preview
// that shows the final composed prompt + a one-line confirmation.
const WIZARD_STEPS = [
  { id: 1, label: "الأساسيات",   icon: Bot },
  { id: 2, label: "النموذج",      icon: Settings },
  { id: 3, label: "التعليمات",    icon: PenTool },
  { id: 4, label: "القواعد",      icon: ListChecks },
  { id: 5, label: "الأمثلة",      icon: Lightbulb },
  { id: 6, label: "المحاكاة",     icon: Wand2 },
] as const;

// Curated general-rules library — picked by type. Admin ticks the
// ones that apply; chosen rules get folded into the composed system
// prompt at preview time. These cover the most common "the agent
// keeps doing X" complaints from past iterations.
const COMMON_RULES_BY_TYPE: Record<AgentType, string[]> = {
  writing: [
    "اكتب بالعربية الفصحى الواضحة",
    "استخدم الأرقام الغربية (0-9) وليس (٠-٩)",
    "تجنّب التكرار وأعد صياغة الأفكار المتشابهة",
    "حافظ على نبرة محايدة ومتزنة",
    "اكتب بأسلوب مباشر دون إطالة أو حشو",
    "لا تستخدم الإيموجي إلا إذا طُلب صراحةً",
    "لا تستخدم علامة em dash (—)؛ استبدلها بفاصلة أو نقطة",
    "ابدأ بعنوان قوي ثم انتقل للنقاط الرئيسية",
    "تجنّب الجمل الإنشائية التي لا تضيف معلومة",
    "اذكر المصدر إذا كانت المعلومة مأخوذة من خبر",
  ],
  filtering: [
    "أجب بـ true أو false فقط، دون شرح أو مقدّمات",
    "عند الشك، استبعد (false) — الدقة أهم من الكمّ",
    "اعتبر العناوين المُضلّلة (clickbait) سبباً للاستبعاد",
    "تجاهل المصادر التي تكرّر بثّ المحتوى دون إضافة",
    "ركّز على القيمة الإخبارية، لا على عدد القراءات",
    "استبعد الأخبار المكرّرة خلال آخر 24 ساعة",
  ],
  editing: [
    "حافظ على معنى النص الأصلي ولا تضِف أفكاراً جديدة",
    "أصلح الأخطاء الإملائية والنحوية فقط",
    "وحِّد الأسلوب داخل النص الواحد",
    "اختصر دون فقدان المعلومة أو السياق",
    "احفظ الاقتباسات والأسماء كما هي",
    "أزِل التكرار والحشو",
  ],
  summarizing: [
    "لخّص في 3 إلى 5 جمل كحدّ أقصى",
    "ركّز على الفكرة الرئيسية والنتيجة",
    "تجنّب التفاصيل الثانوية والإحصاءات الفرعية",
    "احفظ الأسماء والأرقام والتواريخ كما وردت",
    "ابدأ بالحدث، ثم السياق، ثم التداعيات",
  ],
};

// Seed prompt suggestions per type — surfaced at step 3 as a quick
// "ابدأ من قالب" so the admin doesn't stare at an empty textarea.
const SEED_PROMPTS_BY_TYPE: Record<AgentType, { label: string; prompt: string }[]> = {
  writing: [
    {
      label: "كاتب منشورات اجتماعية",
      prompt:
        "أنت كاتب محتوى محترف متخصّص في صياغة منشورات اجتماعية باللغة العربية الفصحى. مهمّتك تحويل المقال الذي يصلك إلى منشور قصير جذّاب، بعنوان واضح ونقاط محدّدة، يناسب منصّات مثل X و LinkedIn.",
    },
    {
      label: "كاتب مقالات قصيرة",
      prompt:
        "أنت كاتب مقالات قصيرة باللغة العربية. عند استلام موضوع أو خبر، اكتب مقالاً من 300-500 كلمة بعنوان رئيسي و3 فقرات: السياق، الحدث، التداعيات.",
    },
  ],
  filtering: [
    {
      label: "مُصفّي أخبار التقنية",
      prompt:
        "أنت مصنّف أخبار. تحدّد ما إذا كان الخبر يستحق النشر على قناة تتابع تطوّرات الذكاء الاصطناعي والمنتجات التقنية الكبرى. أجب بـ true إذا كان الخبر أصيلاً ومهمّاً، و false إذا كان مكرّراً أو هامشياً.",
    },
  ],
  editing: [
    {
      label: "محرّر لغوي",
      prompt:
        "أنت محرّر لغوي عربي. مهمّتك تنقيح النص: إصلاح الأخطاء الإملائية والنحوية، توحيد الأسلوب، إزالة التكرار، دون تغيير المعنى أو إضافة أفكار جديدة. أعد النص النهائي فقط دون شرح.",
    },
  ],
  summarizing: [
    {
      label: "ملخّص أخبار",
      prompt:
        "أنت ملخّص أخبار. عند استلام نصّ خبر، أعد ملخّصاً من 3-5 جمل يحفظ الفكرة الرئيسية والأسماء والأرقام. ابدأ بالحدث، ثم السياق، ثم التداعيات.",
    },
  ],
};

const defaultFormData = {
  name: "",
  description: "",
  modelName: "openai/gpt-4o",
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
  const [activeTab, setActiveTab] = useState<"list" | "execute" | "test">("list");

  /* OpenRouter status */
  const [orConfigured, setOrConfigured] = useState(true);
  const [orModels, setOrModels] = useState<OpenRouterModel[]>([]);

  /* Execute state */
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null);
  const [executeInput, setExecuteInput] = useState("");
  const [executing, setExecuting] = useState(false);
  const [previewResult, setPreviewResult] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [executionError, setExecutionError] = useState("");
  const [modelOverride, setModelOverride] = useState("");

  /* Test state */
  const [testAgent, setTestAgent] = useState<AgentConfig | null>(null);
  const [testInput, setTestInput] = useState("");
  const [testModels, setTestModels] = useState<Set<string>>(new Set());
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);

  /* Form state */
  const [formData, setFormData] = useState({ ...defaultFormData });
  const [showExampleForm, setShowExampleForm] = useState(false);
  const [exampleTitle, setExampleTitle] = useState("");
  const [exampleContent, setExampleContent] = useState("");

  /* Wizard state — step routing + rule selection + per-template
     metadata so writing-type examples carry a name. Stored separately
     from `formData` so old agents (created before the wizard) load
     unchanged and the assembler is reproducible on edit. */
  const [wizardStep, setWizardStep] = useState(1);
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set());
  const [customRule, setCustomRule] = useState("");
  // The user's "raw" intent — what they typed in step 3. The composed
  // prompt (intent + rules + templates) lives in formData.systemPrompt
  // and gets rebuilt on every preview render.
  const [rawIntent, setRawIntent] = useState("");
  const [composedPreview, setComposedPreview] = useState("");
  // Simulation step output: shows the agent's "first impression" of a
  // sample input using the composed prompt. We don't hit the model
  // (the agent isn't saved yet), we just echo back what the agent
  // would see — that's enough to catch obvious omissions.
  const [simInput, setSimInput] = useState("");

  useEffect(() => {
    loadAgents();
    loadStatus();
  }, []);

  /* ───────── API helpers ───────── */

  const loadStatus = () => {
    fetch("/api/agents?action=status")
      .then((r) => r.json())
      .then((data) => {
        setOrConfigured(data.configured);
        if (data.models) setOrModels(data.models);
      })
      .catch(() => {});
  };

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
    if (!formData.name) { addToast("أدخل اسم الوكيل", "warning"); return; }
    if (!formData.systemPrompt) { addToast("أدخل تعليمات النظام", "warning"); return; }
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
      if (res.ok) { addToast("تم حذف الوكيل", "success"); loadAgents(); }
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
      const body: Record<string, unknown> = {
        action: preview ? "preview" : "execute",
        agentId: selectedAgent.id,
        input: executeInput,
      };
      if (modelOverride && modelOverride !== selectedAgent.modelName) {
        body.modelOverride = modelOverride;
      }
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        const output = preview ? data.preview : data.execution?.output;
        setPreviewResult(output || "");
        setShowPreview(true);
        if (!preview) addToast("تم التنفيذ بنجاح", "success");
      } else {
        setExecutionError(data.error || "فشل التنفيذ");
        addToast(data.error || "فشل التنفيذ", "error");
      }
    } catch {
      addToast("حدث خطأ أثناء التنفيذ", "error");
      setExecutionError("خطأ في الاتصال");
    } finally {
      setExecuting(false);
    }
  };

  const handleTest = async () => {
    if (!testAgent || !testInput.trim() || testModels.size === 0) {
      addToast("اختر وكيل ونماذج وأدخل النص", "warning");
      return;
    }
    setTesting(true);
    setTestResults([]);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          agentId: testAgent.id,
          input: testInput,
          models: Array.from(testModels),
        }),
      });
      const data = await res.json();
      if (res.ok && data.testResults) {
        setTestResults(data.testResults);
        addToast("اكتمل الاختبار", "success");
      } else {
        addToast(data.error || "فشل الاختبار", "error");
      }
    } catch {
      addToast("حدث خطأ أثناء الاختبار", "error");
    } finally {
      setTesting(false);
    }
  };

  /* ───────── Modal helpers ───────── */

  // Assemble the final system prompt from the wizard pieces. The
  // intent text leads (it carries the user's voice), followed by a
  // clearly delimited rules block, then the named templates. The
  // delimiters are markdown-style headings so the model sees clean
  // structure regardless of which provider routes the request.
  const composeSystemPrompt = (
    intent: string,
    rules: string[],
    templates: ExamplePost[]
  ): string => {
    const parts: string[] = [];
    const intentText = intent.trim();
    if (intentText) parts.push(intentText);
    if (rules.length > 0) {
      const numbered = rules.map((r, i) => `${i + 1}. ${r}`).join("\n");
      parts.push(`القواعد العامة (التزم بها دائماً):\n${numbered}`);
    }
    if (templates.length > 0) {
      const blocks = templates
        .map((t, i) => `قالب ${i + 1} — ${t.title}:\n${t.content}`)
        .join("\n\n");
      parts.push(`أمثلة وقوالب مرجعية (حاكي أسلوبها وبنيتها):\n\n${blocks}`);
    }
    return parts.join("\n\n");
  };

  const openCreate = () => {
    setEditingAgent(null);
    setFormData({ ...defaultFormData });
    setWizardStep(1);
    setSelectedRules(new Set());
    setCustomRule("");
    setRawIntent("");
    setComposedPreview("");
    setSimInput("");
    setShowCreateModal(true);
  };

  const openEdit = (agent: AgentConfig) => {
    setEditingAgent(agent);
    setFormData({ ...agent, examplePosts: [...agent.examplePosts] });
    // When editing, jump straight to the preview step so the admin
    // doesn't have to walk through the wizard for a small tweak.
    setWizardStep(6);
    setSelectedRules(new Set());
    setCustomRule("");
    setRawIntent(agent.systemPrompt);
    setComposedPreview(agent.systemPrompt);
    setShowCreateModal(true);
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setEditingAgent(null);
    setShowExampleForm(false);
    setFormData({ ...defaultFormData });
    setWizardStep(1);
    setSelectedRules(new Set());
    setCustomRule("");
    setRawIntent("");
    setComposedPreview("");
    setSimInput("");
  };

  const toggleRule = (rule: string) => {
    setSelectedRules((prev) => {
      const next = new Set(prev);
      if (next.has(rule)) next.delete(rule);
      else next.add(rule);
      return next;
    });
  };

  const addCustomRule = () => {
    const t = customRule.trim();
    if (!t) return;
    setSelectedRules((prev) => {
      const next = new Set(prev);
      next.add(t);
      return next;
    });
    setCustomRule("");
  };

  // Rebuild the composed prompt + apply it to formData when entering
  // the preview step. Called both when the admin clicks "التالي" from
  // step 5 and when they re-edit something from earlier steps.
  const buildPreview = () => {
    const composed = composeSystemPrompt(
      rawIntent,
      Array.from(selectedRules),
      formData.examplePosts
    );
    setComposedPreview(composed);
    setFormData((p) => ({ ...p, systemPrompt: composed }));
  };

  // Quick "this is what the agent will see" simulation. We don't call
  // the model — the agent isn't saved yet, and a fake preview here is
  // honestly more useful than burning a token to confirm the obvious.
  const buildSimulation = (): string => {
    const input = simInput.trim();
    const head =
      input.length > 0
        ? `الإدخال: ${input}`
        : "(الإدخال الفعلي يأتي هنا عند تشغيل الوكيل)";
    return [
      "محاكاة لما سيراه الوكيل:",
      "—",
      composedPreview || rawIntent,
      "—",
      head,
    ].join("\n");
  };

  // Step gating — skip the examples step entirely for filtering agents
  // since they return true/false and don't benefit from templates.
  const stepsForType: number[] =
    formData.agentType === "filtering" ? [1, 2, 3, 4, 6] : [1, 2, 3, 4, 5, 6];

  const goNext = () => {
    const idx = stepsForType.indexOf(wizardStep);
    if (idx < 0 || idx >= stepsForType.length - 1) return;
    const next = stepsForType[idx + 1];
    if (next === 6) buildPreview();
    setWizardStep(next);
  };
  const goBack = () => {
    const idx = stepsForType.indexOf(wizardStep);
    if (idx <= 0) return;
    setWizardStep(stepsForType[idx - 1]);
  };

  // Each step has its own "can advance" rule so the next-button greys
  // out when the admin hasn't supplied enough to move on.
  const canAdvance = () => {
    switch (wizardStep) {
      case 1:
        return formData.name.trim().length > 0;
      case 2:
        return !!formData.modelName;
      case 3:
        return rawIntent.trim().length > 20;
      case 4:
        return true; // rules are optional
      case 5:
        return true; // examples optional but encouraged
      case 6:
        return rawIntent.trim().length > 0;
      default:
        return true;
    }
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

  const toggleTestModel = (modelId: string) => {
    setTestModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  /* group models by tier */
  const modelsByTier = orModels.reduce<Record<string, OpenRouterModel[]>>((acc, m) => {
    if (!acc[m.tier]) acc[m.tier] = [];
    acc[m.tier].push(m);
    return acc;
  }, {});

  const getModelLabel = (id: string) => orModels.find((m) => m.id === id)?.label || id;

  /* ───────── Render ───────── */

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2 tracking-tight">
            <Bot className="w-5 h-5 text-amber-400" />
            وكلاء الذكاء الاصطناعي
          </h2>
          <p className="text-neutral-400 text-[13px] font-bold mt-1">
            إنشاء واختبار وكلاء الذكاء الاصطناعي
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Tab switcher */}
          <div className="flex bg-[#1a1a1a] border border-neutral-800 rounded-lg p-0.5">
            {([
              { key: "list", label: "الإعدادات", icon: Settings },
              { key: "execute", label: "التنفيذ", icon: Zap },
              { key: "test", label: "اختبار", icon: FlaskConical },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${
                  activeTab === tab.key
                    ? "bg-white text-black"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {user?.role === "admin" && activeTab === "list" && (
            <button onClick={openCreate} className="zto-btn zto-btn-gold">
              <Plus className="w-4 h-4" />
              وكيل جديد
            </button>
          )}
        </div>
      </div>

      <PageGuide
        pageName="وكلاء الذكاء الاصطناعي"
        accent="amber"
        storageKey="agents"
        intro={
          <>
            هنا تنشئ <span className="text-amber-300 font-bold">وكلاء</span> ذكيين تستخدمهم في باقي النظام: وكيل
            <span className="font-bold mx-1">فلترة</span> يقرّر أيّ الأخبار تستحق الحفظ، ووكيل
            <span className="font-bold mx-1">كتابة</span> يحرّر منشوراً جاهزاً، إلى آخره. اختر النموذج وضع تعليمات
            النظام (System Prompt) ثم اختبر مباشرة قبل ربطه بمصدر بيانات.
          </>
        }
        tips={[
          { title: "إنشاء وكيل جديد", body: <>اضغط <span className="text-amber-300 font-bold">«إنشاء وكيل جديد»</span> ثم اختر النوع (filtering للأخبار، writing للمنشورات...). صَف المهمّة بدقّة في تعليمات النظام — كلما كانت أوضح، كانت النتائج أثبت.</> },
          { title: "اختيار النموذج", body: <>اختر نموذجاً مناسباً للمهمة من القائمة. النماذج الكبيرة أدقّ لكن أبطأ وأكلف؛ المهام البسيطة (تصنيف عنوان مثلاً) يكفيها نموذج سريع.</> },
          { title: "تبويب «اختبار»", body: <>اكتب مدخلاً افتراضياً وشاهد المخرَج قبل أن تربط الوكيل بأيّ مصدر — يوفّر عليك دورات فلترة كاملة في الإنتاج.</> },
          { title: "تبويب «التنفيذ»", body: <>شغّل الوكيل على عيّنة بيانات حقيقية للتحقّق من سلوكه قبل التشغيل الآلي. النتائج تُسجَّل في صفحة السجلّات.</> },
        ]}
      />

      {/* AI provider not configured warning */}
      {!orConfigured && (
        <div className="zto-alert zto-alert-err flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-bold text-sm">خدمة الذكاء الاصطناعي غير مفعّلة</p>
            <p className="text-xs text-neutral-400 mt-0.5">
              تواصل مع المسؤول لتفعيل الخدمة قبل إنشاء الوكلاء.
            </p>
          </div>
        </div>
      )}

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
                <button onClick={openCreate} className="zto-btn zto-btn-gold">
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
                  <div key={agent.id} className="zto-card p-5 hover:border-neutral-700 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${agentType?.bg || "bg-neutral-800"}`}>
                          <Icon className={`w-5 h-5 ${agentType?.color || "text-neutral-400"}`} />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-white">{agent.name}</h3>
                          <p className="text-[0.65rem] text-neutral-500 font-bold uppercase tracking-wider">
                            {agentType?.label}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => handleToggleActive(agent)} title={agent.isActive ? "مفعل" : "معطل"} className="transition-colors">
                        {agent.isActive ? (
                          <ToggleRight className="w-6 h-6 text-emerald-400" />
                        ) : (
                          <ToggleLeft className="w-6 h-6 text-neutral-600" />
                        )}
                      </button>
                    </div>

                    <p className="text-xs text-neutral-400 mb-3 line-clamp-2">{agent.description || "بدون وصف"}</p>

                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                      <span className="zto-badge zto-badge-info">{getModelLabel(agent.modelName)}</span>
                      <span className="zto-badge zto-badge-default">{agent.examplePosts.length} مثال</span>
                    </div>

                    <div className="flex items-center gap-1 pt-3 border-t border-neutral-800">
                      <button
                        onClick={() => { setSelectedAgent(agent); setModelOverride(agent.modelName); setActiveTab("execute"); }}
                        className="zto-btn zto-btn-ghost zto-btn-sm flex-1 text-amber-400"
                      >
                        <Play className="w-3.5 h-3.5" />
                        تشغيل
                      </button>
                      <button
                        onClick={() => { setTestAgent(agent); setActiveTab("test"); }}
                        className="zto-btn zto-btn-ghost zto-btn-sm text-purple-400"
                      >
                        <FlaskConical className="w-3.5 h-3.5" />
                      </button>
                      {user?.role === "admin" && (
                        <>
                          <button onClick={() => openEdit(agent)} className="zto-btn zto-btn-ghost zto-btn-sm">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(agent.id)} className="zto-btn zto-btn-ghost zto-btn-sm text-red-400 hover:text-red-300">
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
                  onChange={(e) => {
                    const a = agents.find((a) => a.id === e.target.value) || null;
                    setSelectedAgent(a);
                    if (a) setModelOverride(a.modelName);
                  }}
                >
                  <option value="">-- اختر وكيل --</option>
                  {agents.filter((a) => a.isActive).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({AGENT_TYPES.find((t) => t.value === a.agentType)?.label})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Model override */}
            {selectedAgent && (
              <div>
                <label className="zto-label">النموذج (يمكن تغييره)</label>
                <div className="zto-select-wrap">
                  <select
                    className="zto-input"
                    value={modelOverride}
                    onChange={(e) => setModelOverride(e.target.value)}
                  >
                    {Object.entries(modelsByTier).map(([tier, models]) => (
                      <optgroup key={tier} label={tier}>
                        {models.map((m) => (
                          <option key={m.id} value={m.id}>{m.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {selectedAgent && (
              <div className="bg-[#1a1a1a] border border-neutral-800 rounded-lg p-4 space-y-2">
                <p className="font-bold text-sm text-white">{selectedAgent.name}</p>
                <p className="text-xs text-neutral-500">{selectedAgent.description}</p>
                <div className="flex gap-2 flex-wrap">
                  <span className="zto-badge zto-badge-info">{getModelLabel(modelOverride || selectedAgent.modelName)}</span>
                  <span className="zto-badge zto-badge-default">حرارة: {selectedAgent.temperature}</span>
                  <span className="zto-badge zto-badge-default">{selectedAgent.examplePosts.length} مثال</span>
                </div>
              </div>
            )}

            <div>
              <label className="zto-label">النص المدخل</label>
              <textarea
                className="zto-input min-h-[180px]"
                placeholder="أدخل النص أو الطلب هنا..."
                value={executeInput}
                onChange={(e) => setExecuteInput(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExecute(true)}
                disabled={executing || !selectedAgent || !executeInput.trim() || !orConfigured}
                className="zto-btn zto-btn-outline flex-1"
              >
                {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                معاينة
              </button>
              <button
                onClick={() => handleExecute(false)}
                disabled={executing || !selectedAgent || !executeInput.trim() || !orConfigured}
                className="zto-btn zto-btn-gold flex-1"
              >
                {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
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
                  onClick={() => { navigator.clipboard.writeText(previewResult); addToast("تم النسخ", "success"); }}
                  className="zto-btn zto-btn-ghost zto-btn-sm"
                >
                  <Copy className="w-3.5 h-3.5" />
                  نسخ
                </button>
              )}
            </div>

            {executionError && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span className="text-sm text-red-400 font-medium">{executionError}</span>
              </div>
            )}

            {showPreview && previewResult ? (
              <div className="bg-[#1a1a1a] border border-neutral-800 rounded-lg p-5 min-h-[280px] max-h-[500px] overflow-y-auto">
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">{previewResult}</div>
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

      {/* ───── Test Tab ───── */}
      {activeTab === "test" && (
        <div className="space-y-6">
          <div className="zto-card p-5 space-y-4">
            <h3 className="font-black text-base text-white flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-purple-400" />
              بيئة الاختبار — مقارنة النماذج
            </h3>
            <p className="text-xs text-neutral-500">اختبر وكيلك على عدة نماذج في وقت واحد وقارن النتائج</p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Agent + input */}
              <div className="space-y-4">
                <div>
                  <label className="zto-label">الوكيل</label>
                  <div className="zto-select-wrap">
                    <select
                      className="zto-input"
                      value={testAgent?.id || ""}
                      onChange={(e) => setTestAgent(agents.find((a) => a.id === e.target.value) || null)}
                    >
                      <option value="">-- اختر وكيل --</option>
                      {agents.filter((a) => a.isActive).map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="zto-label">النص المدخل للاختبار</label>
                  <textarea
                    className="zto-input min-h-[140px]"
                    placeholder="أدخل النص الذي تريد اختباره..."
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                  />
                </div>
                <button
                  onClick={handleTest}
                  disabled={testing || !testAgent || !testInput.trim() || testModels.size === 0 || !orConfigured}
                  className="zto-btn zto-btn-gold w-full"
                >
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                  بدء الاختبار ({testModels.size} نموذج)
                </button>
              </div>

              {/* Model checkboxes */}
              <div>
                <label className="zto-label mb-2">اختر النماذج للمقارنة</label>
                <div className="bg-[#1a1a1a] border border-neutral-800 rounded-xl p-4 max-h-[320px] overflow-y-auto space-y-3">
                  {Object.entries(modelsByTier).map(([tier, models]) => (
                    <div key={tier}>
                      <p className="text-[10px] text-neutral-500 font-black uppercase tracking-wider mb-1.5">{tier}</p>
                      {models.map((m) => (
                        <label
                          key={m.id}
                          className={`flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer text-[12px] transition-colors ${
                            testModels.has(m.id) ? "text-white bg-white/[0.03]" : "text-neutral-400"
                          } hover:bg-white/[0.03]`}
                        >
                          <input
                            type="checkbox"
                            checked={testModels.has(m.id)}
                            onChange={() => toggleTestModel(m.id)}
                            className="w-3.5 h-3.5 rounded accent-amber-400"
                          />
                          <span>{m.label}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
                {testModels.size > 0 && (
                  <button onClick={() => setTestModels(new Set())} className="text-[11px] text-amber-400 mt-2 hover:underline">
                    إلغاء التحديد
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Test Results */}
          {testing && (
            <div className="zto-card p-10 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              <p className="text-neutral-500 text-sm font-bold">جاري اختبار {testModels.size} نموذج...</p>
            </div>
          )}

          {!testing && testResults.length > 0 && (
            <div className="space-y-4">
              <h4 className="font-bold text-sm text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                نتائج المقارنة ({testResults.length} نموذج)
              </h4>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {testResults.map((result) => (
                  <div key={result.model} className={`zto-card p-4 space-y-3 ${result.error ? "border-red-500/30" : ""}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="zto-badge zto-badge-info">{getModelLabel(result.model)}</span>
                        {result.duration > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-neutral-500">
                            <Clock className="w-3 h-3" />
                            {(result.duration / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                      {result.output && (
                        <button
                          onClick={() => { navigator.clipboard.writeText(result.output!); addToast("تم النسخ", "success"); }}
                          className="zto-btn zto-btn-ghost zto-btn-sm"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {result.error ? (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                        <p className="text-xs text-red-400">{result.error}</p>
                      </div>
                    ) : (
                      <div className="bg-[#1a1a1a] border border-neutral-800 rounded-lg p-3 max-h-[300px] overflow-y-auto">
                        <div className="whitespace-pre-wrap text-[12px] leading-relaxed text-neutral-200">
                          {result.output}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───── Create / Edit Modal — guided wizard ───── */}
      {showCreateModal && (() => {
        const stepLabel =
          WIZARD_STEPS.find((s) => s.id === wizardStep)?.label ?? "";
        const isLastStep = wizardStep === 6;
        const isFirstStep = stepsForType.indexOf(wizardStep) === 0;
        const currentIdx = stepsForType.indexOf(wizardStep);
        const totalSteps = stepsForType.length;
        const ruleLibrary = COMMON_RULES_BY_TYPE[formData.agentType];
        const seedLibrary = SEED_PROMPTS_BY_TYPE[formData.agentType];
        const examplesAreTemplates = formData.agentType === "writing";
        const examplesNoun = examplesAreTemplates ? "قوالب" : "أمثلة";

        return (
          <div className="zto-overlay" onClick={closeModal}>
            <div className="zto-modal w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
              {/* Header with stepper */}
              <div className="p-5 border-b border-neutral-800">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <Bot className="w-4 h-4 text-amber-400" />
                    {editingAgent ? "تعديل الوكيل" : "إنشاء وكيل جديد"}
                  </h3>
                  <button onClick={closeModal} className="text-neutral-500 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {/* Step dots */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {stepsForType.map((id, idx) => {
                    const step = WIZARD_STEPS.find((s) => s.id === id)!;
                    const Icon = step.icon;
                    const active = wizardStep === id;
                    const done = currentIdx > idx;
                    return (
                      <div key={id} className="flex items-center">
                        <button
                          onClick={() => setWizardStep(id)}
                          disabled={!done && !active}
                          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-bold border transition-colors ${
                            active
                              ? "border-amber-400/60 bg-amber-400/10 text-amber-300"
                              : done
                                ? "border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/5"
                                : "border-neutral-800 text-neutral-500 cursor-not-allowed"
                          }`}
                        >
                          {done ? <CheckCircle2 className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                          <span className="hidden sm:inline">{step.label}</span>
                          <span className="sm:hidden">{idx + 1}</span>
                        </button>
                        {idx < stepsForType.length - 1 && (
                          <div className="w-3 h-px bg-neutral-800 mx-1" />
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[0.7rem] text-neutral-500 mt-2">
                  الخطوة {currentIdx + 1} من {totalSteps} · {stepLabel}
                </p>
              </div>

              <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
                {/* ── Step 1: Basics ── */}
                {wizardStep === 1 && (
                  <div className="space-y-4 zto-fade-in">
                    <div className="bg-amber-400/5 border border-amber-400/20 rounded-lg p-3 flex items-start gap-2">
                      <Lightbulb className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                      <p className="text-[0.75rem] text-neutral-300 leading-relaxed">
                        ابدأ بتعريف وكيلك: ما اسمه، ما نوع المهمّة التي يؤدّيها، وما الذي ستطلبه منه عادةً.
                        النوع يحدّد بنية بقيّة الخطوات: «الكتابة» تحوّل الأمثلة إلى قوالب، و«الفلترة» تتخطّى خطوة الأمثلة.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="zto-label">اسم الوكيل *</label>
                        <input type="text" className="zto-input" placeholder="مثال: كاتب منشورات X"
                          value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} />
                        <p className="text-[0.6rem] text-neutral-500 mt-1">سيظهر في القائمة وعند الاختيار من البطاقات.</p>
                      </div>
                      <div>
                        <label className="zto-label">الوصف</label>
                        <input type="text" className="zto-input" placeholder="جملة قصيرة تذكّرك بمهمّته"
                          value={formData.description} onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <label className="zto-label">نوع المهمّة *</label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {AGENT_TYPES.map((t) => {
                          const TIcon = t.icon;
                          const active = formData.agentType === t.value;
                          return (
                            <button
                              key={t.value}
                              type="button"
                              onClick={() => setFormData((p) => ({ ...p, agentType: t.value as AgentType }))}
                              className={`rounded-lg border-2 p-3 transition-all text-right ${
                                active
                                  ? `${t.bg} ${t.color} border-current`
                                  : "border-neutral-800 hover:border-neutral-700 text-neutral-400"
                              }`}
                            >
                              <p className="text-sm font-bold flex items-center gap-1.5">
                                <TIcon className="w-4 h-4" />
                                {t.label}
                                {active && <CheckCircle2 className="w-3 h-3 mr-auto" />}
                              </p>
                              <p className="text-[0.6rem] mt-1 leading-snug">
                                {t.value === "writing" && "ينشئ نصوصاً جديدة من مدخل خام."}
                                {t.value === "filtering" && "يقرّر صلاحية الخبر (true/false)."}
                                {t.value === "editing" && "ينقّح ويصحّح نصاً قائماً."}
                                {t.value === "summarizing" && "يلخّص نصاً طويلاً في جمل قصيرة."}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Step 2: Model ── */}
                {wizardStep === 2 && (
                  <div className="space-y-4 zto-fade-in">
                    <div className="bg-amber-400/5 border border-amber-400/20 rounded-lg p-3 flex items-start gap-2">
                      <Settings className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                      <p className="text-[0.75rem] text-neutral-300 leading-relaxed">
                        اختر نموذجاً مناسباً: النماذج الكبيرة أدقّ لكن أبطأ وأكلف.
                        «الحرارة» تتحكّم بالتنوّع — انخفضها للفلترة وارفعها قليلاً للكتابة الإبداعية.
                      </p>
                    </div>
                    <div>
                      <label className="zto-label">النموذج *</label>
                      <div className="zto-select-wrap">
                        <select className="zto-input" value={formData.modelName}
                          onChange={(e) => setFormData((p) => ({ ...p, modelName: e.target.value }))}>
                          {Object.entries(modelsByTier).map(([tier, models]) => (
                            <optgroup key={tier} label={tier}>
                              {models.map((m) => (
                                <option key={m.id} value={m.id}>{m.label}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="zto-label">الحرارة: {formData.temperature}</label>
                        <input type="range" min="0" max="2" step="0.1" className="w-full accent-amber-400 mt-1"
                          value={formData.temperature}
                          onChange={(e) => setFormData((p) => ({ ...p, temperature: parseFloat(e.target.value) }))} />
                        <div className="flex justify-between text-[0.6rem] text-neutral-600 mt-0.5">
                          <span>دقيق · موضوعي</span><span>إبداعي · متنوّع</span>
                        </div>
                      </div>
                      <div>
                        <label className="zto-label">الحد الأقصى للرموز</label>
                        <input type="number" className="zto-input" value={formData.maxTokens}
                          onChange={(e) => setFormData((p) => ({ ...p, maxTokens: parseInt(e.target.value) || 2000 }))} />
                        <p className="text-[0.6rem] text-neutral-500 mt-1">حدّ أقصى لطول الإخراج.</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Step 3: Intent / system prompt ── */}
                {wizardStep === 3 && (
                  <div className="space-y-4 zto-fade-in">
                    <div className="bg-amber-400/5 border border-amber-400/20 rounded-lg p-3 flex items-start gap-2">
                      <PenTool className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                      <p className="text-[0.75rem] text-neutral-300 leading-relaxed">
                        صِف للوكيل من هو، وما المهمّة الأساسية. اكتب بصيغة الأمر («أنت محرّر...»، «مهمّتك...»).
                        لا داعي لإضافة القواعد هنا — لها خطوة مستقلّة.
                      </p>
                    </div>
                    {seedLibrary.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[0.65rem] text-neutral-500 font-bold">ابدأ من قالب:</span>
                        {seedLibrary.map((s) => (
                          <button
                            key={s.label}
                            type="button"
                            onClick={() => setRawIntent(s.prompt)}
                            className="zto-btn zto-btn-ghost zto-btn-sm text-[0.65rem]"
                          >
                            <Sparkles className="w-3 h-3" />
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div>
                      <label className="zto-label">تعليمات الوكيل *</label>
                      <textarea
                        className="zto-input min-h-[160px]"
                        placeholder="مثال: أنت كاتب محتوى محترف باللغة العربية. مهمّتك تحويل المقال إلى منشور قصير على X..."
                        value={rawIntent}
                        onChange={(e) => setRawIntent(e.target.value)}
                      />
                      <div className="flex items-center justify-between text-[0.6rem] text-neutral-500 mt-1">
                        <span>الحد الأدنى 20 حرفاً.</span>
                        <span className="font-mono tabular-nums">{rawIntent.length}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Step 4: General rules ── */}
                {wizardStep === 4 && (
                  <div className="space-y-4 zto-fade-in">
                    <div className="bg-amber-400/5 border border-amber-400/20 rounded-lg p-3 flex items-start gap-2">
                      <ListChecks className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                      <p className="text-[0.75rem] text-neutral-300 leading-relaxed">
                        فعّل القواعد التي يجب أن يلتزم بها الوكيل دائماً. هذه القواعد تُضاف إلى تعليمات النظام
                        تلقائياً كقائمة مرقّمة. يمكنك أيضاً إضافة قواعد خاصة بك.
                      </p>
                    </div>
                    <div>
                      <p className="text-[0.65rem] text-neutral-500 font-bold mb-2">
                        قواعد شائعة لـ«{AGENT_TYPES.find((t) => t.value === formData.agentType)?.label}» (اختر ما يناسبك):
                      </p>
                      <div className="space-y-1.5">
                        {ruleLibrary.map((rule) => {
                          const checked = selectedRules.has(rule);
                          return (
                            <label
                              key={rule}
                              className={`flex items-start gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors border ${
                                checked
                                  ? "border-amber-400/40 bg-amber-400/5"
                                  : "border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/30"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleRule(rule)}
                                className="mt-0.5 shrink-0"
                              />
                              <span className="text-[0.78rem] text-neutral-200 leading-snug flex-1">{rule}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="zto-label text-[0.7rem]">إضافة قاعدة خاصة</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className="zto-input"
                          placeholder="مثلاً: لا تذكر منافسين بأسمائهم"
                          value={customRule}
                          onChange={(e) => setCustomRule(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); addCustomRule(); }
                          }}
                        />
                        <button onClick={addCustomRule} className="zto-btn zto-btn-gold zto-btn-sm shrink-0">
                          <Plus className="w-3.5 h-3.5" />
                          إضافة
                        </button>
                      </div>
                    </div>
                    {selectedRules.size > 0 && (
                      <div className="text-[0.7rem] text-neutral-400">
                        تم اختيار <span className="text-amber-300 font-bold">{selectedRules.size}</span> قاعدة.
                      </div>
                    )}
                  </div>
                )}

                {/* ── Step 5: Examples / templates ── */}
                {wizardStep === 5 && (
                  <div className="space-y-4 zto-fade-in">
                    <div className="bg-amber-400/5 border border-amber-400/20 rounded-lg p-3 flex items-start gap-2">
                      <Lightbulb className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                      <p className="text-[0.75rem] text-neutral-300 leading-relaxed">
                        {examplesAreTemplates ? (
                          <>
                            أضف <span className="font-bold text-amber-300">قوالب جاهزة</span> يحاكي الوكيل أسلوبها وبنيتها.
                            كلّ قالب يحتاج عنواناً يصف نوعه (مثل: «خبر تقنية قصير») ومحتوى كامل يعكس الجودة المطلوبة.
                            يُنصح بإضافة <span className="font-bold">3 قوالب على الأقل</span> لضمان ثبات الأسلوب.
                          </>
                        ) : (
                          <>
                            أضف <span className="font-bold text-amber-300">أمثلة</span> توضّح للوكيل النتيجة المتوقّعة.
                            كلّ مثال يحتاج عنواناً قصيراً ومحتوى. الأمثلة اختيارية، لكنها ترفع الدقّة كثيراً.
                          </>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-[0.7rem] text-neutral-400 font-bold">
                        {examplesNoun} الحالية: <span className="text-amber-300">{formData.examplePosts.length}</span>
                      </p>
                      {!showExampleForm && (
                        <button onClick={() => setShowExampleForm(true)} className="zto-btn zto-btn-gold zto-btn-sm">
                          <Plus className="w-3.5 h-3.5" />
                          إضافة {examplesAreTemplates ? "قالب" : "مثال"}
                        </button>
                      )}
                    </div>

                    {showExampleForm && (
                      <div className="bg-neutral-900/60 border border-amber-400/30 rounded-lg p-4 space-y-3">
                        <input type="text" className="zto-input"
                          placeholder={examplesAreTemplates ? "اسم القالب (مثلاً: خبر تقنية قصير)" : "عنوان المثال"}
                          value={exampleTitle} onChange={(e) => setExampleTitle(e.target.value)} />
                        <textarea className="zto-input min-h-[120px]"
                          placeholder={examplesAreTemplates ? "المحتوى الكامل للقالب — انسخه من منشور حقيقي يعجبك" : "محتوى المثال"}
                          value={exampleContent} onChange={(e) => setExampleContent(e.target.value)} />
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => { setShowExampleForm(false); setExampleTitle(""); setExampleContent(""); }}
                            className="zto-btn zto-btn-ghost zto-btn-sm">إلغاء</button>
                          <button onClick={addExample} className="zto-btn zto-btn-gold zto-btn-sm">
                            <Plus className="w-3 h-3" />
                            حفظ
                          </button>
                        </div>
                      </div>
                    )}

                    {formData.examplePosts.length === 0 && !showExampleForm && (
                      <div className="text-center py-8 text-[0.75rem] text-neutral-500 border border-dashed border-neutral-800 rounded-lg">
                        لم تُضف {examplesNoun} بعد. اضغط «إضافة» في الأعلى للبدء.
                      </div>
                    )}

                    <div className="space-y-2">
                      {formData.examplePosts.map((ex, idx) => (
                        <div key={ex.id} className="bg-neutral-900/40 border border-neutral-800 rounded-lg p-3 flex items-start gap-3">
                          <span className="text-[0.65rem] text-amber-400 font-mono font-bold mt-0.5 shrink-0">
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white">{ex.title}</p>
                            <p className="text-xs text-neutral-400 line-clamp-3 mt-1 leading-relaxed">{ex.content}</p>
                          </div>
                          <button
                            onClick={() => setFormData((p) => ({ ...p, examplePosts: p.examplePosts.filter((e) => e.id !== ex.id) }))}
                            className="text-red-400 hover:text-red-300 shrink-0 transition-colors"
                            title="حذف"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {examplesAreTemplates && formData.examplePosts.length > 0 && formData.examplePosts.length < 3 && (
                      <p className="text-[0.7rem] text-amber-300 bg-amber-400/5 border border-amber-400/20 rounded p-2">
                        💡 أضف {3 - formData.examplePosts.length} قالباً آخر لنتائج أكثر ثباتاً.
                      </p>
                    )}
                  </div>
                )}

                {/* ── Step 6: Preview + confirm ── */}
                {wizardStep === 6 && (
                  <div className="space-y-4 zto-fade-in">
                    <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-lg p-3 flex items-start gap-2">
                      <Wand2 className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
                      <p className="text-[0.75rem] text-neutral-300 leading-relaxed">
                        هذه هي التعليمات النهائية التي سيراها الوكيل في كلّ استدعاء.
                        راجع المعاينة، وإن لزم عُد للخطوات السابقة. عند الجاهزية اضغط «إنشاء».
                      </p>
                    </div>

                    {/* Summary card */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div className="bg-[#0d0d0d] border border-neutral-800 rounded-lg p-2.5 text-center">
                        <p className="text-[0.6rem] text-neutral-500 font-bold uppercase">النوع</p>
                        <p className="text-[0.75rem] text-amber-300 font-bold mt-1">
                          {AGENT_TYPES.find((t) => t.value === formData.agentType)?.label}
                        </p>
                      </div>
                      <div className="bg-[#0d0d0d] border border-neutral-800 rounded-lg p-2.5 text-center">
                        <p className="text-[0.6rem] text-neutral-500 font-bold uppercase">القواعد</p>
                        <p className="text-[0.75rem] text-emerald-300 font-bold mt-1">{selectedRules.size}</p>
                      </div>
                      <div className="bg-[#0d0d0d] border border-neutral-800 rounded-lg p-2.5 text-center">
                        <p className="text-[0.6rem] text-neutral-500 font-bold uppercase">{examplesNoun}</p>
                        <p className="text-[0.75rem] text-blue-300 font-bold mt-1">{formData.examplePosts.length}</p>
                      </div>
                      <div className="bg-[#0d0d0d] border border-neutral-800 rounded-lg p-2.5 text-center">
                        <p className="text-[0.6rem] text-neutral-500 font-bold uppercase">الحرارة</p>
                        <p className="text-[0.75rem] text-purple-300 font-bold mt-1">{formData.temperature}</p>
                      </div>
                    </div>

                    {/* Composed prompt viewer */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="zto-label text-[0.7rem] mb-0">التعليمات المُركّبة</label>
                        <button
                          onClick={() => {
                            try { navigator.clipboard.writeText(composedPreview); addToast("تم النسخ", "success"); }
                            catch { /* clipboard may be blocked */ }
                          }}
                          className="text-[0.6rem] text-neutral-500 hover:text-amber-300 font-bold flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          نسخ
                        </button>
                      </div>
                      <textarea
                        readOnly
                        value={composedPreview}
                        className="zto-input min-h-[200px] font-mono text-[0.72rem] leading-relaxed"
                      />
                      <p className="text-[0.6rem] text-neutral-500 mt-1">
                        إذا أردت تعديل النص: عُد إلى الخطوة المناسبة (تعليمات، قواعد، أمثلة).
                      </p>
                    </div>

                    {/* Simulation echo */}
                    <details className="bg-[#0d0d0d] border border-neutral-800 rounded-lg p-3 group">
                      <summary className="cursor-pointer text-[0.75rem] font-bold text-neutral-300 flex items-center gap-2">
                        <Play className="w-3.5 h-3.5 text-amber-300" />
                        محاكاة سريعة (ما الذي سيراه الوكيل؟)
                      </summary>
                      <div className="mt-3 space-y-2">
                        <input
                          type="text"
                          className="zto-input text-xs"
                          placeholder="مثال على إدخال يصل للوكيل (اختياري)"
                          value={simInput}
                          onChange={(e) => setSimInput(e.target.value)}
                        />
                        <pre className="bg-black border border-neutral-800 rounded p-3 text-[0.7rem] text-neutral-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto font-mono">
                          {buildSimulation()}
                        </pre>
                        <p className="text-[0.6rem] text-neutral-500">
                          هذا عرض محلي للتعليمات والإدخال. الاختبار الفعلي على النموذج متاح بعد الإنشاء من تبويب «الاختبار».
                        </p>
                      </div>
                    </details>
                  </div>
                )}
              </div>

              {/* Footer — back / next / save */}
              <div className="p-5 border-t border-neutral-800 flex items-center gap-3 justify-between">
                <button onClick={closeModal} className="zto-btn zto-btn-ghost">إلغاء</button>
                <div className="flex items-center gap-2">
                  {!isFirstStep && (
                    <button onClick={goBack} className="zto-btn zto-btn-ghost">
                      <ChevronRight className="w-4 h-4" />
                      السابق
                    </button>
                  )}
                  {!isLastStep ? (
                    <button
                      onClick={goNext}
                      disabled={!canAdvance()}
                      className="zto-btn zto-btn-gold"
                    >
                      التالي
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  ) : (
                    <button onClick={handleSave} disabled={saving || !canAdvance()} className="zto-btn zto-btn-gold">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {editingAgent ? "حفظ التغييرات" : "إنشاء الوكيل"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
