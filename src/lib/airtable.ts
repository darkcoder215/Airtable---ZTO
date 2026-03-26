import Airtable from "airtable";
import { logger } from "./logger";

const PAT = process.env.AIRTABLE_PAT;

if (!PAT) {
  logger.error("AIRTABLE_PAT environment variable is not set", "Airtable");
}

Airtable.configure({ apiKey: PAT });

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

// Fetch all bases the token has access to
export async function listBases(): Promise<AirtableBase[]> {
  logger.info("Fetching list of bases", "Airtable");
  try {
    const response = await fetch("https://api.airtable.com/v0/meta/bases", {
      headers: { Authorization: `Bearer ${PAT}` },
    });
    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`Failed to fetch bases: ${response.status}`, "Airtable", errorBody);
      throw new Error(`Failed to fetch bases: ${response.status} - ${errorBody}`);
    }
    const data = await response.json();
    logger.info(`Successfully fetched ${data.bases.length} bases`, "Airtable");
    return data.bases;
  } catch (error) {
    logger.error("Error fetching bases", "Airtable", error);
    throw error;
  }
}

// Fetch tables in a base (using metadata API)
export async function listTables(baseId: string): Promise<AirtableTable[]> {
  logger.info(`Fetching tables for base ${baseId}`, "Airtable");
  try {
    const response = await fetch(
      `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
      { headers: { Authorization: `Bearer ${PAT}` } }
    );
    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`Failed to fetch tables: ${response.status}`, "Airtable", errorBody);
      throw new Error(`Failed to fetch tables: ${response.status} - ${errorBody}`);
    }
    const data = await response.json();
    logger.info(`Successfully fetched ${data.tables.length} tables for base ${baseId}`, "Airtable");
    return data.tables;
  } catch (error) {
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
  logger.info(`Fetching records from ${baseId}/${tableId}`, "Airtable", options);
  try {
    const params = new URLSearchParams();
    if (options?.pageSize) params.set("pageSize", String(options.pageSize));
    if (options?.offset) params.set("offset", options.offset);
    if (options?.filterByFormula) params.set("filterByFormula", options.filterByFormula);
    if (options?.fields) {
      options.fields.forEach((f) => params.append("fields[]", f));
    }
    if (options?.sort) {
      options.sort.forEach((s, i) => {
        params.set(`sort[${i}][field]`, s.field);
        params.set(`sort[${i}][direction]`, s.direction);
      });
    }

    const url = `https://api.airtable.com/v0/${baseId}/${tableId}?${params.toString()}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${PAT}` },
    });
    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`Failed to fetch records: ${response.status}`, "Airtable", errorBody);
      throw new Error(`Failed to fetch records: ${response.status} - ${errorBody}`);
    }
    const data = await response.json();
    logger.info(`Fetched ${data.records.length} records from ${tableId}`, "Airtable");
    return { records: data.records, offset: data.offset };
  } catch (error) {
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
  logger.info(`Updating record ${recordId} in ${baseId}/${tableId}`, "Airtable", fields);
  try {
    const response = await fetch(
      `https://api.airtable.com/v0/${baseId}/${tableId}/${recordId}`,
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
      throw new Error(`Failed to update record: ${response.status} - ${errorBody}`);
    }
    const data = await response.json();
    logger.info(`Successfully updated record ${recordId}`, "Airtable");
    return data;
  } catch (error) {
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
  logger.info(`Creating record in ${baseId}/${tableId}`, "Airtable", fields);
  try {
    const response = await fetch(
      `https://api.airtable.com/v0/${baseId}/${tableId}`,
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
      throw new Error(`Failed to create record: ${response.status} - ${errorBody}`);
    }
    const data = await response.json();
    logger.info(`Successfully created record in ${tableId}`, "Airtable");
    return data.records[0];
  } catch (error) {
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
  logger.info(`Deleting record ${recordId} from ${baseId}/${tableId}`, "Airtable");
  try {
    const response = await fetch(
      `https://api.airtable.com/v0/${baseId}/${tableId}/${recordId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${PAT}` },
      }
    );
    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`Failed to delete record: ${response.status}`, "Airtable", errorBody);
      throw new Error(`Failed to delete record: ${response.status} - ${errorBody}`);
    }
    logger.info(`Successfully deleted record ${recordId}`, "Airtable");
  } catch (error) {
    logger.error(`Error deleting record ${recordId}`, "Airtable", error);
    throw error;
  }
}
