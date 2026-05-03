"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Users,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Inbox,
  Search,
  User,
  Mail,
  Briefcase,
  TrendingUp,
  Zap,
  ChevronRight,
  Layers,
  ListTodo,
} from "lucide-react";
import { useAppStore } from "@/store/app-store";

/* ───────── Types (mirror /api/dashboards response) ───────── */

interface TeamMember {
  id: string;
  name: string;
  role?: string;
  email?: string;
  avatarUrl?: string;
}
interface BucketCounts {
  total: number;
  done: number;
  inProgress: number;
  overdue: number;
  dueSoon: number;
}
interface UpcomingItem {
  recordId: string;
  title: string;
  table: string;
  status?: string;
  dueAt?: string;
}
interface PerMemberSummary {
  member: TeamMember;
  totals: BucketCounts;
  perTable: Array<{
    tableId: string;
    tableName: string;
    counts: BucketCounts;
    statusBreakdown: Array<{ label: string; count: number }>;
  }>;
  upcoming: UpcomingItem[];
  overdue: UpcomingItem[];
}
interface Diagnostics {
  teamTable: { id: string; name: string } | null;
  linkedTables: Array<{
    id: string;
    name: string;
    linkField: string;
    linkKind?: "recordLink" | "collaborator" | "textName";
    statusField: string | null;
    dueField: string | null;
  }>;
  warnings: string[];
  availableTables?: Array<{ id: string; name: string }>;
}

/* ───────── Helpers ───────── */

function relativeDate(iso?: string): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const diff = t - Date.now();
  const past = diff < 0;
  const days = Math.round(Math.abs(diff) / 86_400_000);
  if (days === 0) return past ? "اليوم" : "اليوم";
  if (days === 1) return past ? "البارحة" : "غداً";
  if (days < 7) return past ? `قبل ${days} أيام` : `خلال ${days} أيام`;
  if (days < 30) {
    const w = Math.round(days / 7);
    return past ? `قبل ${w} أسبوع` : `خلال ${w} أسبوع`;
  }
  return new Date(t).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.round((n / d) * 100);
}

/* ───────── Component ───────── */

export default function DashboardsAndViewsPage() {
  const { addToast } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [summaries, setSummaries] = useState<PerMemberSummary[]>([]);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboards", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التحميل");
      setMembers(data.members ?? []);
      setSummaries(data.summaries ?? []);
      setDiag(data.diagnostics ?? null);
      if (data.summaries?.length > 0 && !activeId) {
        setActiveId(data.summaries[0].member.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ غير معروف");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredSummaries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return summaries;
    return summaries.filter(
      (s) =>
        s.member.name.toLowerCase().includes(q) ||
        s.member.role?.toLowerCase().includes(q) ||
        s.member.email?.toLowerCase().includes(q)
    );
  }, [summaries, search]);

  const overall = useMemo(() => {
    const t: BucketCounts = { total: 0, done: 0, inProgress: 0, overdue: 0, dueSoon: 0 };
    for (const s of summaries) {
      t.total += s.totals.total;
      t.done += s.totals.done;
      t.inProgress += s.totals.inProgress;
      t.overdue += s.totals.overdue;
      t.dueSoon += s.totals.dueSoon;
    }
    return t;
  }, [summaries]);

  const active = summaries.find((s) => s.member.id === activeId) ?? filteredSummaries[0];

  return (
    <div className="space-y-6 zto-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-400" />
            لوحات الفريق والعرض
          </h2>
          <p className="text-neutral-500 text-sm mt-1">
            نظرة عامة على عمل كل عضو من فريقك — مهام مفتوحة، تأخّرات، قادم خلال أسبوع.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="zto-btn zto-btn-outline zto-btn-sm"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            تحديث
          </button>
        </div>
      </div>

      {error && (
        <div className="zto-card p-4 flex items-start gap-2 border-red-500/30 bg-red-500/5">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Diagnostics card when team table not detected */}
      {!loading && diag && !diag.teamTable && (
        <div className="zto-card p-5 border-amber-500/30 bg-amber-500/5 space-y-2">
          <p className="text-sm font-bold text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            لم يُعثر على جدول &quot;Team&quot; في قاعدة Airtable
          </p>
          <p className="text-xs text-neutral-300">
            للظهور هنا، أنشئ جدولاً باسم
            <code className="text-amber-400 mx-1 font-mono">Team</code>
            (أو
            <code className="text-amber-400 mx-1 font-mono">Members</code>)
            ثم أنشئ حقل ربط
            <code className="text-amber-400 mx-1 font-mono">multipleRecordLinks</code>
            من جداول المهام إلى Team.
          </p>
          {diag.availableTables && diag.availableTables.length > 0 && (
            <details className="text-[0.65rem] text-neutral-500 mt-2">
              <summary className="cursor-pointer">الجداول المتاحة في القاعدة</summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {diag.availableTables.map((t) => (
                  <code key={t.id} className="bg-[#1a1a1a] border border-neutral-800 rounded px-1.5 py-0.5 font-mono">
                    {t.name}
                  </code>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && summaries.length === 0 && (
        <div className="zto-card p-16 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
        </div>
      )}

      {/* Top stats — overall */}
      {summaries.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatTile
            icon={<Users className="w-4 h-4" />}
            label="أعضاء"
            value={members.length.toString()}
            tone="indigo"
          />
          <StatTile
            icon={<ListTodo className="w-4 h-4" />}
            label="مهام مُسندة"
            value={overall.total.toString()}
            tone="amber"
          />
          <StatTile
            icon={<TrendingUp className="w-4 h-4" />}
            label="جارية"
            value={overall.inProgress.toString()}
            sub={`${pct(overall.done, overall.total)}% منجز`}
            tone="blue"
          />
          <StatTile
            icon={<Zap className="w-4 h-4" />}
            label="قريبة الاستحقاق"
            value={overall.dueSoon.toString()}
            sub="خلال 7 أيام"
            tone="purple"
          />
          <StatTile
            icon={<AlertTriangle className="w-4 h-4" />}
            label="متأخّرة"
            value={overall.overdue.toString()}
            tone="red"
          />
        </div>
      )}

      {/* Layout: roster sidebar + active dashboard */}
      {summaries.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          {/* Roster */}
          <div className="zto-card p-3 space-y-3 lg:max-h-[calc(100vh-320px)] lg:overflow-y-auto">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث في الأعضاء..."
                className="zto-input pr-10 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              {filteredSummaries.length === 0 && (
                <p className="text-xs text-neutral-500 text-center py-6">لا نتائج</p>
              )}
              {filteredSummaries.map((s) => {
                const isActive = (active?.member.id ?? "") === s.member.id;
                const overdue = s.totals.overdue;
                return (
                  <button
                    key={s.member.id}
                    onClick={() => setActiveId(s.member.id)}
                    className={`zto-roster-row w-full text-right ${
                      isActive ? "zto-roster-row-active" : ""
                    }`}
                  >
                    <Avatar member={s.member} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold text-white truncate">{s.member.name}</p>
                        {overdue > 0 && (
                          <span className="zto-badge zto-badge-err text-[0.55rem] !py-0">
                            {overdue}
                          </span>
                        )}
                      </div>
                      {s.member.role && (
                        <p className="text-[0.6rem] text-neutral-500 truncate">{s.member.role}</p>
                      )}
                    </div>
                    <div className="text-[0.6rem] text-neutral-500 tabular-nums shrink-0">
                      {s.totals.total}
                    </div>
                    {isActive && <ChevronRight className="w-3 h-3 text-amber-400" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active member dashboard */}
          {active && <MemberDashboard summary={active} key={active.member.id} />}
        </div>
      )}

      {/* Empty roster */}
      {!loading && summaries.length === 0 && diag?.teamTable && (
        <div className="zto-card p-16 text-center">
          <Inbox className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
          <p className="text-neutral-500 text-sm font-bold">لا أعضاء في جدول Team بعد</p>
          <button
            onClick={() => addToast("أضف أعضاءً في جدول Team في Airtable ثم اضغط تحديث", "info")}
            className="zto-btn zto-btn-ghost zto-btn-sm mt-2"
          >
            تعرّف على الخطوات
          </button>
        </div>
      )}

      {/* Diagnostics footer */}
      {diag?.linkedTables && diag.linkedTables.length > 0 && (
        <details className="zto-card p-3 text-[0.65rem] text-neutral-500">
          <summary className="cursor-pointer text-neutral-400 font-bold">
            مصادر البيانات: {diag.linkedTables.length} جدول مرتبط بـ &quot;{diag.teamTable?.name}&quot;
          </summary>
          <div className="mt-2 space-y-1">
            {diag.linkedTables.map((l) => (
              <div key={`${l.id}-${l.linkField}`} className="flex items-center gap-2 flex-wrap">
                <code className="text-amber-400 font-mono">{l.name}</code>
                <span className="text-neutral-600">·</span>
                <span>عبر حقل</span>
                <code className="text-purple-400 font-mono">{l.linkField}</code>
                {l.linkKind && (
                  <span className="text-[0.55rem] text-neutral-500 font-mono">
                    [{l.linkKind === "recordLink" ? "ربط" : l.linkKind === "collaborator" ? "متعاون" : "اسم"}]
                  </span>
                )}
                {l.statusField && (
                  <>
                    <span className="text-neutral-600">·</span>
                    <span>حالة</span>
                    <code className="text-blue-400 font-mono">{l.statusField}</code>
                  </>
                )}
                {l.dueField && (
                  <>
                    <span className="text-neutral-600">·</span>
                    <span>استحقاق</span>
                    <code className="text-emerald-400 font-mono">{l.dueField}</code>
                  </>
                )}
              </div>
            ))}
            {diag.warnings.length > 0 && (
              <div className="mt-2 pt-2 border-t border-neutral-800 space-y-0.5">
                {diag.warnings.map((w, i) => (
                  <p key={i} className="text-amber-400">⚠ {w}</p>
                ))}
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

/* ───────── Subcomponents ───────── */

function Avatar({ member }: { member: TeamMember }) {
  if (member.avatarUrl) {
    return (
      <div className="w-8 h-8 rounded-full overflow-hidden bg-neutral-800 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={member.avatarUrl} alt={member.name} className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400/40 to-purple-500/40 border border-neutral-700 flex items-center justify-center shrink-0">
      <span className="text-[10px] font-black text-white">{initials(member.name)}</span>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: "indigo" | "amber" | "blue" | "purple" | "red";
}) {
  const toneClass = {
    indigo: "from-indigo-500/15 to-indigo-500/5 text-indigo-300 border-indigo-500/20",
    amber: "from-amber-500/15 to-amber-500/5 text-amber-300 border-amber-500/20",
    blue: "from-blue-500/15 to-blue-500/5 text-blue-300 border-blue-500/20",
    purple: "from-purple-500/15 to-purple-500/5 text-purple-300 border-purple-500/20",
    red: "from-red-500/15 to-red-500/5 text-red-300 border-red-500/20",
  }[tone];
  return (
    <div className={`zto-stat-tile bg-gradient-to-br ${toneClass}`}>
      <div className="flex items-center justify-between">
        <span className="opacity-80">{icon}</span>
        <span className="text-[0.55rem] uppercase tracking-wider opacity-70 font-bold">
          {label}
        </span>
      </div>
      <div className="mt-1.5">
        <p className="text-2xl font-black tabular-nums text-white leading-none">{value}</p>
        {sub && <p className="text-[0.6rem] opacity-70 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function MemberDashboard({ summary }: { summary: PerMemberSummary }) {
  const m = summary.member;
  const completionPct = pct(summary.totals.done, summary.totals.total);
  return (
    <div className="space-y-4 zto-slide-up">
      {/* Profile header */}
      <div className="zto-card p-5 zto-glow-edge">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400/40 to-purple-500/40 border border-neutral-700 flex items-center justify-center overflow-hidden shrink-0">
            {m.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.avatarUrl} alt={m.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-base font-black text-white">{initials(m.name)}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-black text-white">{m.name}</h3>
            <div className="flex items-center gap-3 flex-wrap text-[0.7rem] text-neutral-400 mt-1">
              {m.role && (
                <span className="flex items-center gap-1">
                  <Briefcase className="w-3 h-3" />
                  {m.role}
                </span>
              )}
              {m.email && (
                <span className="flex items-center gap-1" dir="ltr">
                  <Mail className="w-3 h-3" />
                  {m.email}
                </span>
              )}
              {!m.role && !m.email && (
                <span className="text-neutral-600 flex items-center gap-1">
                  <User className="w-3 h-3" />
                  بلا تفاصيل إضافية
                </span>
              )}
            </div>
          </div>
          {/* Completion progress ring */}
          <div className="flex items-center gap-3">
            <ProgressRing pct={completionPct} />
            <div className="text-[0.65rem] text-neutral-400">
              <p className="font-bold text-white text-sm">{completionPct}%</p>
              <p>مُنجَز من إجمالي العمل</p>
            </div>
          </div>
        </div>
      </div>

      {/* Per-table breakdown */}
      <div>
        <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" />
          توزيع العمل على الجداول
        </h4>
        {summary.perTable.length === 0 ? (
          <div className="zto-card p-10 text-center">
            <Inbox className="w-8 h-8 text-neutral-700 mx-auto mb-2" />
            <p className="text-xs text-neutral-500">لا أعمال مُسندة بعد</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {summary.perTable.map((t) => (
              <div key={t.tableId} className="zto-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-bold text-sm text-white truncate">{t.tableName}</p>
                  <span className="zto-badge border border-neutral-700 text-neutral-300 text-[0.6rem]">
                    {t.counts.total}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <MiniStat label="جارية" value={t.counts.inProgress} tone="blue" />
                  <MiniStat label="منجزة" value={t.counts.done} tone="emerald" />
                  <MiniStat label="متأخرة" value={t.counts.overdue} tone="red" />
                </div>
                <ProgressBar
                  parts={[
                    { value: t.counts.done, color: "bg-emerald-500" },
                    { value: t.counts.inProgress - t.counts.overdue, color: "bg-blue-500" },
                    { value: t.counts.overdue, color: "bg-red-500" },
                  ]}
                />
                {t.statusBreakdown.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {t.statusBreakdown.slice(0, 6).map((sb) => (
                      <span
                        key={sb.label}
                        className="text-[0.6rem] bg-[#1a1a1a] border border-neutral-800 rounded-full px-2 py-0.5 text-neutral-300"
                      >
                        {sb.label}
                        <span className="text-neutral-500 mr-1">{sb.count}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Overdue + upcoming */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ListCard
          title="مهام متأخرة"
          icon={<AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
          items={summary.overdue}
          empty="لا تأخّر — أحسنت!"
          tone="red"
        />
        <ListCard
          title="قادمة خلال أسبوع"
          icon={<Clock className="w-3.5 h-3.5 text-purple-400" />}
          items={summary.upcoming}
          empty="لا قادم في الأسبوع المقبل"
          tone="purple"
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: "blue" | "emerald" | "red" }) {
  const toneClass = {
    blue: "text-blue-300 bg-blue-500/10 border-blue-500/20",
    emerald: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
    red: "text-red-300 bg-red-500/10 border-red-500/20",
  }[tone];
  return (
    <div className={`rounded-lg border ${toneClass} py-1.5 px-2`}>
      <p className="text-base font-black tabular-nums leading-none">{value}</p>
      <p className="text-[0.55rem] uppercase tracking-wide mt-0.5 opacity-80">{label}</p>
    </div>
  );
}

function ProgressBar({ parts }: { parts: Array<{ value: number; color: string }> }) {
  const total = Math.max(1, parts.reduce((s, p) => s + Math.max(0, p.value), 0));
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-neutral-800">
      {parts.map((p, i) => {
        const w = (Math.max(0, p.value) / total) * 100;
        if (w === 0) return null;
        return <div key={i} className={p.color} style={{ width: `${w}%` }} />;
      })}
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return (
    <svg viewBox="0 0 56 56" className="w-12 h-12 -rotate-90">
      <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        stroke="rgb(251, 191, 36)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

function ListCard({
  title,
  icon,
  items,
  empty,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  items: UpcomingItem[];
  empty: string;
  tone: "red" | "purple";
}) {
  return (
    <div className="zto-card p-4">
      <h4 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
        {icon}
        {title}
        <span className={`mr-auto zto-badge text-[0.6rem] ${
          tone === "red"
            ? "border border-red-500/30 text-red-400"
            : "border border-purple-500/30 text-purple-400"
        }`}>
          {items.length}
        </span>
      </h4>
      {items.length === 0 ? (
        <div className="text-center py-6">
          <CheckCircle2 className="w-6 h-6 text-neutral-700 mx-auto mb-1.5" />
          <p className="text-xs text-neutral-500">{empty}</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {items.map((it) => (
            <div
              key={it.recordId}
              className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-neutral-800/40 transition-colors"
            >
              <span
                className={`w-1 self-stretch rounded-full ${
                  tone === "red" ? "bg-red-500/60" : "bg-purple-500/60"
                }`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-medium line-clamp-1">{it.title}</p>
                <div className="flex items-center gap-1.5 text-[0.6rem] text-neutral-500 mt-0.5">
                  <span>{it.table}</span>
                  {it.status && (
                    <>
                      <span>·</span>
                      <span>{it.status}</span>
                    </>
                  )}
                  {it.dueAt && (
                    <>
                      <span>·</span>
                      <span className={tone === "red" ? "text-red-400" : "text-purple-400"}>
                        {relativeDate(it.dueAt)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
