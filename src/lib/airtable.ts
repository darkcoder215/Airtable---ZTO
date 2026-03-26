import { logger } from "./logger";

const PAT = process.env.AIRTABLE_PAT;

if (!PAT) {
  logger.error("AIRTABLE_PAT environment variable is not set", "Airtable");
}

export interface AirtableBase {
  id: string;
  name: string;
  permissionLevel: string;
}

export interface AirtableTable {
  id: string;
  name: string;
  description?: string;
  fields: AirtableField[];
  primaryFieldId: string;
}

export interface AirtableField {
  id: string;
  name: string;
  type: string;
  description?: string;
  options?: Record<string, unknown>;
}

export interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
}

// Map Airtable HTTP error codes to Arabic messages
function getArabicError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body);
    const errorType = parsed?.error?.type;
    const errorMsg = parsed?.error?.message;

    switch (status) {
      case 401:
        return "رمز الوصول غير صالح أو منتهي الصلاحية. تأكد من صحة Personal Access Token.";
      case 403:
        return "لا تملك صلاحية الوصول إلى هذا المورد. تحقق من أذونات الرمز في Airtable.";
      case 404:
        return "المورد المطلوب غير موجود. تأكد من صحة معرف القاعدة أو الجدول أو السجل.";
      case 422:
        if (errorType === "INVALID_FILTER_BY_FORMULA") {
          return `صيغة الفلترة غير صالحة: ${errorMsg || "تحقق من الصيغة وحاول مرة أخرى."}`;
        }
        if (errorType === "INVALID_VALUE_FOR_COLUMN") {
          return `قيمة غير صالحة: ${errorMsg || "تحقق من نوع البيانات المدخلة."}`;
        }
        if (errorType === "UNKNOWN_FIELD_NAME") {
          return `اسم الحقل غير معروف: ${errorMsg || "تأكد من أسماء الحقول."}`;
        }
        return `خطأ في البيانات: ${errorMsg || "تحقق من القيم المدخلة."}`;
      case 429:
        return "تم تجاوز حد الطلبات المسموح. يرجى الانتظار بضع ثوانٍ ثم المحاولة مرة أخرى.";
      case 500:
      case 502:
      case 503:
        return "خطأ في خادم Airtable. حاول مرة أخرى لاحقاً.";
      default:
        return `خطأ من Airtable (${status}): ${errorMsg || body.substring(0, 200)}`;
    }
  } catch {
    return `خطأ من Airtable (${status}): ${body.substring(0, 200)}`;
  }
}

// Retry logic for rate limits and transient errors
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Retry on rate limit (429) or server errors (5xx)
      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
        const retryAfter = response.headers.get("Retry-After");
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(1000 * Math.pow(2, attempt), 10000);
        logger.warn(`Rate limited or server error (${response.status}), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`, "Airtable");
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (error) {
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        logger.warn(`Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`, "Airtable", error);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error("تم استنفاد جميع محاولات إعادة الاتصال");
}

// Validate PAT exists before making requests
function ensurePAT(): void {
  if (!PAT) {
    throw new Error("رمز الوصول (PAT) غير مُعدّ. أضف AIRTABLE_PAT إلى ملف .env.local");
  }
}

// Validate IDs to prevent injection
function validateId(id: string, type: string): void {
  if (!id || typeof id !== "string") {
    throw new Error(`معرف ${type} مطلوب`);
  }
  // Airtable IDs follow specific patterns
  const patterns: Record<string, RegExp> = {
    base: /^app[a-zA-Z0-9]{14}$/,
    table: /^tbl[a-zA-Z0-9]{14}$/,
    record: /^rec[a-zA-Z0-9]{14}$/,
  };
  if (patterns[type] && !patterns[type].test(id)) {
    // Also allow table names (used in v0 API)
    if (type === "table" && /^[a-zA-Z0-9\s\u0600-\u06FF_-]+$/.test(id)) {
      return; // Table names are valid too
    }
    logger.warn(`Suspicious ${type} ID format: ${id}`, "Airtable");
  }
}

// Fetch all bases
export async function listBases(): Promise<AirtableBase[]> {
  ensurePAT();
  logger.info("Fetching list of bases", "Airtable");
  const startTime = Date.now();
  try {
    const response = await fetchWithRetry("https://api.airtable.com/v0/meta/bases", {
      headers: { Authorization: `Bearer ${PAT}` },
    });
    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`Failed to fetch bases: ${response.status}`, "Airtable", errorBody);
      throw new Error(getArabicError(response.status, errorBody));
    }
    const data = await response.json();
    const bases = data.bases || [];
    const duration = Date.now() - startTime;
    logger.info(`Fetched ${bases.length} bases in ${duration}ms`, "Airtable");
    return bases;
  } catch (error) {
    if (error instanceof TypeError && (error as TypeError).message.includes("fetch")) {
      const msg = "فشل الاتصال بـ Airtable. تحقق من اتصال الإنترنت.";
      logger.error(msg, "Airtable", error);
      throw new Error(msg);
    }
    logger.error("Error fetching bases", "Airtable", error);
    throw error;
  }
}

// Fetch tables in a base
export async function listTables(baseId: string): Promise<AirtableTable[]> {
  ensurePAT();
  validateId(baseId, "base");
  logger.info(`Fetching tables for base ${baseId}`, "Airtable");
  const startTime = Date.now();
  try {
    const response = await fetchWithRetry(
      `https://api.airtable.com/v0/meta/bases/${encodeURIComponent(baseId)}/tables`,
      { headers: { Authorization: `Bearer ${PAT}` } }
    );
    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`Failed to fetch tables: ${response.status}`, "Airtable", errorBody);
      throw new Error(getArabicError(response.status, errorBody));
    }
    const data = await response.json();
    const tables = data.tables || [];
    const duration = Date.now() - startTime;
    logger.info(`Fetched ${tables.length} tables for base ${baseId} in ${duration}ms`, "Airtable");
    return tables;
  } catch (error) {
    if (error instanceof TypeError && (error as TypeError).message.includes("fetch")) {
      throw new Error("فشل الاتصال بـ Airtable. تحقق من اتصال الإنترنت.");
    }
    logger.error(`Error fetching tables for base ${baseId}`, "Airtable", error);
    throw error;
  }
}

// Fetch records from a table
export async function listRecords(
  baseId: string,
  tableId: string,
  options?: {
    pageSize?: number;
    offset?: string;
    filterByFormula?: string;
    sort?: { field: string; direction: "asc" | "desc" }[];
    fields?: string[];
  }
): Promise<{ records: AirtableRecord[]; offset?: string }> {
  ensurePAT();
  validateId(baseId, "base");
  logger.info(`Fetching records from ${baseId}/${tableId}`, "Airtable", options);
  const startTime = Date.now();
  try {
    const params = new URLSearchParams();
    const pageSize = Math.min(Math.max(options?.pageSize || 50, 1), 100);
    params.set("pageSize", String(pageSize));
    if (options?.offset) params.set("offset", options.offset);
    if (options?.filterByFormula?.trim()) {
      params.set("filterByFormula", options.filterByFormula.trim());
    }
    if (options?.fields) {
      options.fields.forEach((f) => params.append("fields[]", f));
    }
    if (options?.sort) {
      options.sort.forEach((s, i) => {
        params.set(`sort[${i}][field]`, s.field);
        params.set(`sort[${i}][direction]`, s.direction);
      });
    }

    const url = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}?${params.toString()}`;
    const response = await fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${PAT}` },
    });
    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`Failed to fetch records: ${response.status}`, "Airtable", errorBody);
      throw new Error(getArabicError(response.status, errorBody));
    }
    const data = await response.json();
    const records = data.records || [];
    const duration = Date.now() - startTime;
    logger.info(`Fetched ${records.length} records from ${tableId} in ${duration}ms`, "Airtable");
    return { records, offset: data.offset };
  } catch (error) {
    if (error instanceof TypeError && (error as TypeError).message.includes("fetch")) {
      throw new Error("فشل الاتصال بـ Airtable. تحقق من اتصال الإنترنت.");
    }
    logger.error(`Error fetching records from ${baseId}/${tableId}`, "Airtable", error);
    throw error;
  }
}

// Update a record
export async function updateRecord(
  baseId: string,
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>
): Promise<AirtableRecord> {
  ensurePAT();
  validateId(baseId, "base");
  validateId(recordId, "record");

  if (!fields || Object.keys(fields).length === 0) {
    throw new Error("لا توجد حقول للتحديث");
  }

  logger.info(`Updating record ${recordId} in ${baseId}/${tableId}`, "Airtable", { fieldCount: Object.keys(fields).length });
  const startTime = Date.now();
  try {
    const response = await fetchWithRetry(
      `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${PAT}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
      }
    );
    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`Failed to update record: ${response.status}`, "Airtable", errorBody);
      throw new Error(getArabicError(response.status, errorBody));
    }
    const data = await response.json();
    const duration = Date.now() - startTime;
    logger.info(`Updated record ${recordId} in ${duration}ms`, "Airtable");
    return data;
  } catch (error) {
    if (error instanceof TypeError && (error as TypeError).message.includes("fetch")) {
      throw new Error("فشل الاتصال بـ Airtable. لم يتم حفظ التغييرات.");
    }
    logger.error(`Error updating record ${recordId}`, "Airtable", error);
    throw error;
  }
}

// Create a record
export async function createRecord(
  baseId: string,
  tableId: string,
  fields: Record<string, unknown>
): Promise<AirtableRecord> {
  ensurePAT();
  validateId(baseId, "base");

  logger.info(`Creating record in ${baseId}/${tableId}`, "Airtable", { fieldCount: Object.keys(fields).length });
  const startTime = Date.now();
  try {
    const response = await fetchWithRetry(
      `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAT}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records: [{ fields }] }),
      }
    );
    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`Failed to create record: ${response.status}`, "Airtable", errorBody);
      throw new Error(getArabicError(response.status, errorBody));
    }
    const data = await response.json();
    if (!data.records || data.records.length === 0) {
      throw new Error("لم يتم إرجاع أي سجل بعد الإنشاء");
    }
    const duration = Date.now() - startTime;
    logger.info(`Created record in ${tableId} in ${duration}ms`, "Airtable");
    return data.records[0];
  } catch (error) {
    if (error instanceof TypeError && (error as TypeError).message.includes("fetch")) {
      throw new Error("فشل الاتصال بـ Airtable. لم يتم إنشاء السجل.");
    }
    logger.error(`Error creating record in ${baseId}/${tableId}`, "Airtable", error);
    throw error;
  }
}

// Delete a record
export async function deleteRecord(
  baseId: string,
  tableId: string,
  recordId: string
): Promise<void> {
  ensurePAT();
  validateId(baseId, "base");
  validateId(recordId, "record");

  logger.info(`Deleting record ${recordId} from ${baseId}/${tableId}`, "Airtable");
  const startTime = Date.now();
  try {
    const response = await fetchWithRetry(
      `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${PAT}` },
      }
    );
    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`Failed to delete record: ${response.status}`, "Airtable", errorBody);
      throw new Error(getArabicError(response.status, errorBody));
    }
    const duration = Date.now() - startTime;
    logger.info(`Deleted record ${recordId} in ${duration}ms`, "Airtable");
  } catch (error) {
    if (error instanceof TypeError && (error as TypeError).message.includes("fetch")) {
      throw new Error("فشل الاتصال بـ Airtable. لم يتم حذف السجل.");
    }
    logger.error(`Error deleting record ${recordId}`, "Airtable", error);
    throw error;
  }
}
