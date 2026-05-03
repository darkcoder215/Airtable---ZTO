// Per-team-member dashboard aggregations.
//
// Auto-discovers the team roster from a "Team" table in the destination
// Airtable base, then walks every other table in the base looking for
// link fields that point at Team. For each (table, link-field, member)
// triple we count records, bucket by status, and surface what's overdue
// or due-soon. The result is a compact snapshot the UI can render
// without needing to know the schema in advance.
//
// Designed to be tolerant of base-shape changes: missing fields, missing
// Status / Due Date, mis-typed link fields all degrade to "no data" for
// that slice instead of erroring out the whole response.

import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { listTables, listRecords } from "@/lib/airtable";
import type { AirtableField, AirtableRecord, AirtableTable } from "@/lib/airtable";
import { DESTINATION_BASE_ID } from "@/lib/destination-mapping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEAM_TABLE_CANDIDATES = ["Team", "Team Members", "Members", "الفريق", "أعضاء الفريق"];
const NAME_FIELD_CANDIDATES = ["Name", "Full Name", "Member", "الاسم", "Display Name"];
const STATUS_FIELD_CANDIDATES = ["Status", "Stage", "State", "الحالة"];
const DUE_FIELD_CANDIDATES = ["Due Date", "Deadline", "Due", "Target Date", "تاريخ الاستحقاق", "Date"];
const TITLE_FIELD_CANDIDATES = ["Name", "Title", "Task Name", "Item", "العنوان", "اسم المهمة"];
const ROLE_FIELD_CANDIDATES = ["Role", "Title", "Position", "المسمى الوظيفي", "الدور"];
const EMAIL_FIELD_CANDIDATES = ["Email", "Work Email", "البريد الإلكتروني"];
const AVATAR_FIELD_CANDIDATES = ["Avatar", "Photo", "Picture", "Profile Photo"];
// Hierarchy detection: a free-text "Department" / "Team" / Arabic equivalent
// gives us a flat grouping; an explicit Manager / Reports To link gives the
// tree edges. Either or both can be missing — we degrade gracefully.
const DEPT_FIELD_CANDIDATES = ["Department", "Dept", "Team", "Group", "Division", "القسم", "الإدارة", "الفريق"];
const MANAGER_FIELD_CANDIDATES = ["Manager", "Reports To", "Reports to", "Supervisor", "المدير", "المسؤول"];

// Keep the Airtable bill bounded — most teams have <100 members and most
// tables <500 active records. Rolls of 500+ tables/records are paginated by
// listRecords already; we just cap the page count we'll walk.
const MAX_PAGES_PER_TABLE = 5;
const PAGE_SIZE = 100;
// Status terms (case-insensitive) we treat as "done" so they don't count
// toward overdue / open backlog.
const DONE_TERMS = new Set([
  "done", "completed", "complete", "finished", "shipped", "published",
  "live", "approved", "closed", "archived",
  "منجز", "مكتمل", "تم", "منشور", "مغلق",
]);

interface TeamMember {
  id: string;
  name: string;
  role?: string;
  email?: string;
  avatarUrl?: string;
  // Free-text department / "team" classification — same value across people
  // = same department.
  department?: string;
  // Record id of the member's manager when set via a record-link field on
  // the Team table. Drives the hierarchy tree.
  managerId?: string;
}

interface BucketCounts {
  total: number;
  done: number;
  inProgress: number;
  overdue: number;
  dueSoon: number; // due within 7 days, not done
}

interface UpcomingItem {
  recordId: string;
  title: string;
  table: string;
  status?: string;
  dueAt?: string; // ISO
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

interface TeamLink {
  table: AirtableTable;
  linkField: AirtableField; // multipleRecordLinks → Team
  statusField?: AirtableField;
  dueField?: AirtableField;
  titleField?: AirtableField;
}

function findField(table: AirtableTable, candidates: string[]): AirtableField | undefined {
  const wanted = new Set(candidates.map((c) => c.toLowerCase()));
  return table.fields.find((f) => wanted.has(f.name.toLowerCase()));
}

function pickPrimaryName(rec: AirtableRecord, primaryFieldName: string | undefined): string {
  if (primaryFieldName && typeof rec.fields[primaryFieldName] === "string") {
    return rec.fields[primaryFieldName] as string;
  }
  for (const cand of TITLE_FIELD_CANDIDATES) {
    const v = rec.fields[cand];
    if (typeof v === "string" && v.trim()) return v;
  }
  // Fallback: first string-valued field.
  for (const [, v] of Object.entries(rec.fields)) {
    if (typeof v === "string" && v.trim()) return v.slice(0, 120);
  }
  return rec.id;
}

function statusOf(rec: AirtableRecord, field?: AirtableField): string | undefined {
  if (!field) return undefined;
  const v = rec.fields[field.name];
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "name" in v && typeof (v as { name: unknown }).name === "string") {
    return (v as { name: string }).name;
  }
  return undefined;
}

function dueOf(rec: AirtableRecord, field?: AirtableField): string | undefined {
  if (!field) return undefined;
  const v = rec.fields[field.name];
  if (typeof v === "string" && v.length > 0) return v;
  return undefined;
}

function isDone(status: string | undefined): boolean {
  if (!status) return false;
  return DONE_TERMS.has(status.toLowerCase().trim());
}

function emptyBucket(): BucketCounts {
  return { total: 0, done: 0, inProgress: 0, overdue: 0, dueSoon: 0 };
}

function teamMemberFromRecord(
  rec: AirtableRecord,
  table: AirtableTable
): TeamMember {
  const primary = table.fields.find((f) => f.id === table.primaryFieldId);
  const nameField = findField(table, NAME_FIELD_CANDIDATES) ?? primary;
  const roleField = findField(table, ROLE_FIELD_CANDIDATES);
  const emailField = findField(table, EMAIL_FIELD_CANDIDATES);
  const avatarField = findField(table, AVATAR_FIELD_CANDIDATES);
  const deptField = findField(table, DEPT_FIELD_CANDIDATES);
  const managerField = findField(table, MANAGER_FIELD_CANDIDATES);
  const name =
    (nameField && typeof rec.fields[nameField.name] === "string"
      ? (rec.fields[nameField.name] as string)
      : pickPrimaryName(rec, primary?.name)) || rec.id;
  const role =
    roleField && typeof rec.fields[roleField.name] === "string"
      ? (rec.fields[roleField.name] as string)
      : undefined;
  const email =
    emailField && typeof rec.fields[emailField.name] === "string"
      ? (rec.fields[emailField.name] as string)
      : undefined;
  let avatarUrl: string | undefined;
  if (avatarField) {
    const v = rec.fields[avatarField.name];
    if (Array.isArray(v) && v.length > 0) {
      const first = v[0] as { url?: string } | undefined;
      if (first && typeof first.url === "string") avatarUrl = first.url;
    }
  }
  // Department: accept a single text or singleSelect value, or take the
  // first element of a multipleSelect array.
  let department: string | undefined;
  if (deptField) {
    const v = rec.fields[deptField.name];
    if (typeof v === "string") department = v;
    else if (Array.isArray(v) && typeof v[0] === "string") department = v[0];
    else if (v && typeof v === "object" && "name" in v && typeof (v as { name: unknown }).name === "string") {
      department = (v as { name: string }).name;
    }
  }
  // Manager: a single record link to another row in the same Team table.
  let managerId: string | undefined;
  if (managerField) {
    const v = rec.fields[managerField.name];
    if (Array.isArray(v) && typeof v[0] === "string") managerId = v[0];
    else if (typeof v === "string") managerId = v;
  }
  return { id: rec.id, name, role, email, avatarUrl, department, managerId };
}

async function loadAllRecords(
  baseId: string,
  tableId: string,
  fields?: string[]
): Promise<AirtableRecord[]> {
  const out: AirtableRecord[] = [];
  let offset: string | undefined;
  for (let i = 0; i < MAX_PAGES_PER_TABLE; i++) {
    const page = await listRecords(baseId, tableId, {
      pageSize: PAGE_SIZE,
      offset,
      fields,
    });
    out.push(...page.records);
    if (!page.offset) return out;
    offset = page.offset;
  }
  return out;
}

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "غير مصادق" }, { status: 401 });

  try {
    const tables = await listTables(DESTINATION_BASE_ID);
    if (!tables.length) {
      return NextResponse.json({
        members: [],
        summaries: [],
        diagnostics: { teamTable: null, linkedTables: [], warnings: ["base فارغ"] },
      });
    }

    const teamTable =
      tables.find((t) => TEAM_TABLE_CANDIDATES.some((c) => c.toLowerCase() === t.name.toLowerCase())) ??
      // Fallback: any table whose primary field looks like a person name.
      tables.find((t) => /team|member|staff|أعضاء|الفريق/i.test(t.name));

    if (!teamTable) {
      return NextResponse.json(
        {
          members: [],
          summaries: [],
          diagnostics: {
            teamTable: null,
            linkedTables: [],
            warnings: [
              `لم يُعثر على جدول Team. الأسماء المتوقعة: ${TEAM_TABLE_CANDIDATES.join("، ")}`,
            ],
            availableTables: tables.map((t) => ({ id: t.id, name: t.name })),
          },
        },
        { status: 200 }
      );
    }

    const teamRecords = await loadAllRecords(DESTINATION_BASE_ID, teamTable.id);
    const members = teamRecords.map((r) => teamMemberFromRecord(r, teamTable));
    const memberById = new Map(members.map((m) => [m.id, m]));
    // Index members by lowercased email so we can resolve
    // singleCollaborator / multipleCollaborators fields too.
    const memberIdByEmail = new Map<string, string>();
    for (const m of members) {
      if (m.email) memberIdByEmail.set(m.email.trim().toLowerCase(), m.id);
    }
    // Index by case-insensitive name as a last-resort fallback for tables
    // that store the assignee as a plain text field instead of a link.
    const memberIdByName = new Map<string, string>();
    for (const m of members) {
      memberIdByName.set(m.name.trim().toLowerCase(), m.id);
    }

    // Discover every field in the base that can identify a team member.
    // We accept three shapes:
    //   • multipleRecordLinks / singleRecordLink → linkedTableId === teamTable.id
    //   • singleCollaborator / multipleCollaborators → resolved by email
    //   • text-ish field with a name like "Owner" / "Assignee" / "المسؤول"
    //     when its value matches a Team member name verbatim.
    type LinkKind = "recordLink" | "collaborator" | "textName";
    interface TeamLinkX extends TeamLink { kind: LinkKind }
    const teamLinks: TeamLinkX[] = [];
    const ASSIGNEE_NAME_HINTS = [
      /assignee/i, /owner/i, /assigned/i, /responsible/i, /lead\b/i,
      /\bteam\b/i, /\bmember/i, /المسؤول/i, /المُسند/i, /مكلّف/i, /مكلف/i,
      /مسند/i, /قائد/i, /صاحب/i,
    ];
    for (const t of tables) {
      if (t.id === teamTable.id) continue;
      const statusField = findField(t, STATUS_FIELD_CANDIDATES);
      const dueField = findField(t, DUE_FIELD_CANDIDATES);
      const titleField = findField(t, TITLE_FIELD_CANDIDATES);
      for (const f of t.fields) {
        // Direct record link to Team (multiple or single).
        if (f.type === "multipleRecordLinks" || f.type === "singleRecordLink") {
          const opts = (f.options ?? {}) as { linkedTableId?: string };
          if (opts.linkedTableId === teamTable.id) {
            teamLinks.push({ table: t, linkField: f, statusField, dueField, titleField, kind: "recordLink" });
          }
          continue;
        }
        // Collaborator field — Airtable stores { id, email, name }. We
        // resolve to a Team member by email.
        if (f.type === "singleCollaborator" || f.type === "multipleCollaborators") {
          if (memberIdByEmail.size === 0) continue;
          teamLinks.push({ table: t, linkField: f, statusField, dueField, titleField, kind: "collaborator" });
          continue;
        }
        // Text-name fallback: only opt in when the field's NAME hints
        // assignee semantics, to avoid matching arbitrary text fields.
        if ((f.type === "singleLineText" || f.type === "multilineText") &&
            ASSIGNEE_NAME_HINTS.some((re) => re.test(f.name))) {
          teamLinks.push({ table: t, linkField: f, statusField, dueField, titleField, kind: "textName" });
        }
      }
    }

    // Per-member aggregates. We initialise empty so members with zero work
    // still show up on the dashboard.
    const summaries: PerMemberSummary[] = members.map((m) => ({
      member: m,
      totals: emptyBucket(),
      perTable: [],
      upcoming: [],
      overdue: [],
    }));
    const summaryById = new Map(summaries.map((s) => [s.member.id, s]));

    const now = Date.now();
    const SOON_MS = 7 * 24 * 60 * 60 * 1000;
    const warnings: string[] = [];

    for (const link of teamLinks) {
      let records: AirtableRecord[] = [];
      try {
        records = await loadAllRecords(DESTINATION_BASE_ID, link.table.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`فشل قراءة جدول "${link.table.name}": ${msg}`);
        continue;
      }

      // Aggregator per (member → counts + statusBuckets) for this table.
      const perMemberCounts = new Map<string, BucketCounts>();
      const perMemberStatus = new Map<string, Map<string, number>>();
      const primary = link.table.fields.find((f) => f.id === link.table.primaryFieldId);

      // Pull a list of member ids out of one record's link-field value.
      // Each link kind stores its assignees differently; this normalises
      // them to a Set<string> of Team record ids.
      const extractMemberIds = (raw: unknown, kind: typeof link.kind): Set<string> => {
        const out = new Set<string>();
        if (raw == null) return out;
        if (kind === "recordLink") {
          // multipleRecordLinks → string[]; singleRecordLink stores a
          // single string OR a 1-length array, depending on field options.
          const arr = Array.isArray(raw) ? raw : [raw];
          for (const v of arr) {
            if (typeof v === "string" && memberById.has(v)) out.add(v);
          }
        } else if (kind === "collaborator") {
          // singleCollaborator → { id, email, name }; multipleCollaborators → that[].
          const arr = Array.isArray(raw) ? raw : [raw];
          for (const v of arr) {
            if (!v || typeof v !== "object") continue;
            const o = v as { email?: unknown; name?: unknown };
            if (typeof o.email === "string") {
              const m = memberIdByEmail.get(o.email.trim().toLowerCase());
              if (m) out.add(m);
              continue;
            }
            if (typeof o.name === "string") {
              const m = memberIdByName.get(o.name.trim().toLowerCase());
              if (m) out.add(m);
            }
          }
        } else if (kind === "textName") {
          if (typeof raw !== "string") return out;
          // Allow comma-separated names in a single text field.
          for (const part of raw.split(/[,،;؛]/)) {
            const m = memberIdByName.get(part.trim().toLowerCase());
            if (m) out.add(m);
          }
        }
        return out;
      };

      for (const rec of records) {
        const v = rec.fields[link.linkField.name];
        const linkedMembers = extractMemberIds(v, link.kind);
        if (linkedMembers.size === 0) continue;
        const status = statusOf(rec, link.statusField);
        const due = dueOf(rec, link.dueField);
        const dueMs = due ? Date.parse(due) : NaN;
        const done = isDone(status);
        const overdue = !done && Number.isFinite(dueMs) && dueMs < now;
        const dueSoon = !done && Number.isFinite(dueMs) && dueMs >= now && dueMs - now <= SOON_MS;

        for (const memberId of linkedMembers) {
          const counts = perMemberCounts.get(memberId) ?? emptyBucket();
          counts.total++;
          if (done) counts.done++;
          else counts.inProgress++;
          if (overdue) counts.overdue++;
          if (dueSoon) counts.dueSoon++;
          perMemberCounts.set(memberId, counts);

          if (status) {
            const m = perMemberStatus.get(memberId) ?? new Map<string, number>();
            m.set(status, (m.get(status) ?? 0) + 1);
            perMemberStatus.set(memberId, m);
          }

          // Roll up upcoming / overdue items at the per-member level.
          const summary = summaryById.get(memberId);
          if (summary) {
            const item: UpcomingItem = {
              recordId: rec.id,
              title: pickPrimaryName(rec, primary?.name),
              table: link.table.name,
              status,
              dueAt: due,
            };
            if (overdue && summary.overdue.length < 30) summary.overdue.push(item);
            else if (dueSoon && summary.upcoming.length < 30) summary.upcoming.push(item);
          }
        }
      }

      for (const [memberId, counts] of perMemberCounts) {
        const summary = summaryById.get(memberId);
        if (!summary) continue;
        summary.totals.total += counts.total;
        summary.totals.done += counts.done;
        summary.totals.inProgress += counts.inProgress;
        summary.totals.overdue += counts.overdue;
        summary.totals.dueSoon += counts.dueSoon;
        const statusMap = perMemberStatus.get(memberId);
        const breakdown = statusMap
          ? Array.from(statusMap.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([label, count]) => ({ label, count }))
          : [];
        summary.perTable.push({
          tableId: link.table.id,
          tableName: link.table.name,
          counts,
          statusBreakdown: breakdown,
        });
      }
    }

    // Sort upcoming items chronologically per member.
    for (const s of summaries) {
      s.upcoming.sort((a, b) =>
        (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999")
      );
      s.overdue.sort((a, b) =>
        (a.dueAt ?? "0000").localeCompare(b.dueAt ?? "0000")
      );
      // Sort tables by total work, descending.
      s.perTable.sort((a, b) => b.counts.total - a.counts.total);
    }

    logger.info(
      `Dashboards loaded: ${members.length} members across ${teamLinks.length} linked table(s)`,
      "Dashboards",
      {
        memberCount: members.length,
        linkedTableCount: teamLinks.length,
        warnings: warnings.length,
      },
      user.id
    );

    return NextResponse.json({
      members,
      summaries,
      diagnostics: {
        teamTable: { id: teamTable.id, name: teamTable.name },
        linkedTables: teamLinks.map((l) => ({
          id: l.table.id,
          name: l.table.name,
          linkField: l.linkField.name,
          linkKind: l.kind,
          statusField: l.statusField?.name ?? null,
          dueField: l.dueField?.name ?? null,
        })),
        warnings,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error(`Dashboards endpoint failed: ${msg}`, "Dashboards", err, user.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
