// Access control configuration - stored in memory for now
// Will be migrated to Supabase later

export interface AccessRule {
  id: string;
  userId: string;
  userName: string;
  baseId: string;
  baseName: string;
  tableId: string;
  tableName: string;
  permissions: {
    canView: boolean;
    canEdit: boolean;
    canCreate: boolean;
    canDelete: boolean;
  };
  fieldRestrictions: string[]; // field IDs that are hidden from this user
  filterFormula?: string; // Airtable filter formula to restrict records
  createdAt: string;
  updatedAt: string;
}

// In-memory store
let accessRules: AccessRule[] = [
  // Default: give all editors access to everything with edit permissions
  {
    id: "rule-1",
    userId: "2",
    userName: "أحمد الكاتب",
    baseId: "*",
    baseName: "جميع القواعد",
    tableId: "*",
    tableName: "جميع الجداول",
    permissions: { canView: true, canEdit: true, canCreate: true, canDelete: false },
    fieldRestrictions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "rule-2",
    userId: "3",
    userName: "سارة المحررة",
    baseId: "*",
    baseName: "جميع القواعد",
    tableId: "*",
    tableName: "جميع الجداول",
    permissions: { canView: true, canEdit: true, canCreate: true, canDelete: false },
    fieldRestrictions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "rule-3",
    userId: "4",
    userName: "خالد المراجع",
    baseId: "*",
    baseName: "جميع القواعد",
    tableId: "*",
    tableName: "جميع الجداول",
    permissions: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    fieldRestrictions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export function getAccessRules(): AccessRule[] {
  return [...accessRules];
}

export function getAccessRulesForUser(userId: string): AccessRule[] {
  return accessRules.filter((r) => r.userId === userId);
}

export function checkPermission(
  userId: string,
  role: string,
  baseId: string,
  tableId: string,
  action: "canView" | "canEdit" | "canCreate" | "canDelete"
): boolean {
  // Admins have full access
  if (role === "admin") return true;

  const rules = accessRules.filter(
    (r) =>
      r.userId === userId &&
      (r.baseId === "*" || r.baseId === baseId) &&
      (r.tableId === "*" || r.tableId === tableId)
  );

  if (rules.length === 0) return false;
  return rules.some((r) => r.permissions[action]);
}

export function getFieldRestrictions(
  userId: string,
  role: string,
  baseId: string,
  tableId: string
): string[] {
  if (role === "admin") return [];

  const rules = accessRules.filter(
    (r) =>
      r.userId === userId &&
      (r.baseId === "*" || r.baseId === baseId) &&
      (r.tableId === "*" || r.tableId === tableId)
  );

  // Merge field restrictions from all matching rules
  const restricted = new Set<string>();
  rules.forEach((r) => r.fieldRestrictions.forEach((f) => restricted.add(f)));
  return [...restricted];
}

export function addAccessRule(rule: Omit<AccessRule, "id" | "createdAt" | "updatedAt">): AccessRule {
  const newRule: AccessRule = {
    ...rule,
    id: `rule-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  accessRules.push(newRule);
  return newRule;
}

export function updateAccessRule(id: string, update: Partial<AccessRule>): AccessRule | null {
  const index = accessRules.findIndex((r) => r.id === id);
  if (index === -1) return null;
  accessRules[index] = {
    ...accessRules[index],
    ...update,
    updatedAt: new Date().toISOString(),
  };
  return accessRules[index];
}

export function deleteAccessRule(id: string): boolean {
  const index = accessRules.findIndex((r) => r.id === id);
  if (index === -1) return false;
  accessRules.splice(index, 1);
  return true;
}
