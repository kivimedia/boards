import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { PKTrackerType } from '@/lib/types';
import { SupabaseClient, createClient as createSupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Mapping from tracker_type to Supabase table name.
 */
const TRACKER_TABLES: Record<string, string> = {
  fathom_videos: 'pk_fathom_videos',
  client_updates: 'pk_client_updates',
  ticket_updates: 'pk_ticket_updates',
  daily_goals: 'pk_daily_goals',
  sanity_checks: 'pk_sanity_checks',
  sanity_tests: 'pk_sanity_tests',
  pics_monitoring: 'pk_pics_monitoring',
  flagged_tickets: 'pk_flagged_tickets',
  weekly_tickets: 'pk_weekly_tickets',
  pingdom_tests: 'pk_pingdom_tests',
  google_ads_reports: 'pk_google_ads_reports',
  monthly_summaries: 'pk_monthly_summaries',
  update_schedule: 'pk_update_schedule',
  holiday_tracking: 'pk_holiday_tracking',
  website_status: 'pk_website_status',
  google_analytics_status: 'pk_google_analytics_status',
  other_activities: 'pk_other_activities',
};

/**
 * Date column used for each tracker type (for date-range filtering).
 */
const DATE_COLUMNS: Record<string, string> = {
  fathom_videos: 'meeting_date',
  client_updates: 'meeting_date',
  ticket_updates: 'created_at',
  daily_goals: 'entry_date',
  sanity_checks: 'check_date',
  sanity_tests: 'test_date',
  pics_monitoring: 'check_date',
  flagged_tickets: 'created_at',
  weekly_tickets: 'created_at',
  pingdom_tests: 'test_date',
  google_ads_reports: 'created_at',
  monthly_summaries: 'created_at',
  update_schedule: 'created_at',
  holiday_tracking: 'created_at',
  website_status: 'created_at',
  google_analytics_status: 'created_at',
  other_activities: 'created_at',
};

const IMMUTABLE_UPDATE_FIELDS = new Set([
  'id',
  'created_at',
  'updated_at',
  'synced_at',
  'source_tab',
  'source_row',
]);

const CREATABLE_TRACKER_TYPES = new Set<PKTrackerType>([
  'client_updates',
  'fathom_videos',
  'sanity_checks',
  'pics_monitoring',
  'google_ads_reports',
  'holiday_tracking',
]);

const CREATE_REQUIRED_FIELDS: Partial<Record<PKTrackerType, string[]>> = {
  client_updates: ['account_manager_name'],
  fathom_videos: ['account_manager_name'],
  sanity_checks: ['account_manager_name'],
  pics_monitoring: ['account_manager_name'],
  google_ads_reports: ['month_label'],
  holiday_tracking: ['account_manager_name'],
};

const AUTO_MIGRATION_CLIENT_UPDATES_TABLE = 'pk_client_updates';
const AUTO_MIGRATION_CLIENT_UPDATES_COLUMN = 'meeting_date';
const CLIENT_UPDATES_COMPAT_DATE_COLUMN = 'date_sent';

let ensureClientUpdatesMeetingDateColumnPromise: Promise<boolean> | null = null;

async function runPgQueryWithServiceRole(query: string): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return false;
  }

  const res = await fetch(`${supabaseUrl}/pg/query`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  return res.ok;
}

function createServiceRoleClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function runExecSqlRpcWithClient(client: SupabaseClient, query: string): Promise<boolean> {
  const payloads: Record<string, string>[] = [
    { query },
    { sql: query },
    { sql_query: query },
  ];

  for (const payload of payloads) {
    const { error } = await client.rpc('exec_sql', payload);
    if (!error) {
      return true;
    }
  }

  return false;
}

async function runSqlWithFallbackClients(
  query: string,
  supabaseFromRequest?: SupabaseClient
): Promise<boolean> {
  if (await runPgQueryWithServiceRole(query)) {
    return true;
  }

  const serviceClient = createServiceRoleClient();
  if (serviceClient && await runExecSqlRpcWithClient(serviceClient, query)) {
    return true;
  }

  if (supabaseFromRequest && await runExecSqlRpcWithClient(supabaseFromRequest, query)) {
    return true;
  }

  return false;
}

async function hasColumnInSchemaCache(
  tableName: string,
  columnName: string,
  supabaseFromRequest?: SupabaseClient
): Promise<boolean> {
  const serviceClient = createServiceRoleClient();
  const client = serviceClient || supabaseFromRequest;
  if (!client) return false;

  const { error } = await client
    .from(tableName)
    .select(columnName)
    .limit(1);

  if (!error) return true;
  return error.code !== '42703';
}

async function ensureClientUpdatesMeetingDateColumn(
  supabaseFromRequest?: SupabaseClient
): Promise<boolean> {
  if (ensureClientUpdatesMeetingDateColumnPromise) {
    return ensureClientUpdatesMeetingDateColumnPromise;
  }

  ensureClientUpdatesMeetingDateColumnPromise = (async () => {
    try {
      const alreadyExists = await hasColumnInSchemaCache(
        AUTO_MIGRATION_CLIENT_UPDATES_TABLE,
        AUTO_MIGRATION_CLIENT_UPDATES_COLUMN,
        supabaseFromRequest
      );
      if (alreadyExists) return true;

      const statements = [
        `ALTER TABLE ${AUTO_MIGRATION_CLIENT_UPDATES_TABLE}
          ADD COLUMN IF NOT EXISTS ${AUTO_MIGRATION_CLIENT_UPDATES_COLUMN} DATE`,
        `CREATE INDEX IF NOT EXISTS idx_pk_client_updates_meeting_date
          ON ${AUTO_MIGRATION_CLIENT_UPDATES_TABLE} (${AUTO_MIGRATION_CLIENT_UPDATES_COLUMN} DESC)`,
        "NOTIFY pgrst, 'reload schema'",
      ];

      for (const sql of statements) {
        const ok = await runSqlWithFallbackClients(sql, supabaseFromRequest);
        if (!ok) return false;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
      return hasColumnInSchemaCache(
        AUTO_MIGRATION_CLIENT_UPDATES_TABLE,
        AUTO_MIGRATION_CLIENT_UPDATES_COLUMN,
        supabaseFromRequest
      );
    } catch {
      return false;
    }
  })();

  const ok = await ensureClientUpdatesMeetingDateColumnPromise;
  if (!ok) {
    ensureClientUpdatesMeetingDateColumnPromise = null;
  }
  return ok;
}

async function tryAutoMigrateMissingTrackerColumn(
  tableName: string,
  missingColumn: string,
  supabaseFromRequest?: SupabaseClient
): Promise<boolean> {
  if (
    tableName === AUTO_MIGRATION_CLIENT_UPDATES_TABLE &&
    missingColumn === AUTO_MIGRATION_CLIENT_UPDATES_COLUMN
  ) {
    return ensureClientUpdatesMeetingDateColumn(supabaseFromRequest);
  }

  return false;
}

function extractMissingColumnFromSchemaCacheError(message: string): string | null {
  const schemaCacheMatch = message.match(/Could not find the '([^']+)' column/i);
  if (schemaCacheMatch?.[1]) {
    return schemaCacheMatch[1];
  }

  const postgresMatch = message.match(/column\s+("?[\w.]+"?)\s+does not exist/i);
  if (postgresMatch?.[1]) {
    const raw = postgresMatch[1].replace(/"/g, '');
    const parts = raw.split('.');
    return parts[parts.length - 1] || raw;
  }

  return null;
}

function applyClientUpdatesMeetingDateCompatibility(
  tableName: string,
  payload: Record<string, unknown>
): boolean {
  if (tableName !== AUTO_MIGRATION_CLIENT_UPDATES_TABLE) return false;
  if (!Object.prototype.hasOwnProperty.call(payload, AUTO_MIGRATION_CLIENT_UPDATES_COLUMN)) return false;
  if (Object.prototype.hasOwnProperty.call(payload, CLIENT_UPDATES_COMPAT_DATE_COLUMN)) return false;

  payload[CLIENT_UPDATES_COMPAT_DATE_COLUMN] = payload[AUTO_MIGRATION_CLIENT_UPDATES_COLUMN];
  return true;
}

function normalizeClientUpdatesRow(row: Record<string, unknown>): Record<string, unknown> {
  if (
    !Object.prototype.hasOwnProperty.call(row, AUTO_MIGRATION_CLIENT_UPDATES_COLUMN) &&
    Object.prototype.hasOwnProperty.call(row, CLIENT_UPDATES_COMPAT_DATE_COLUMN)
  ) {
    return {
      ...row,
      [AUTO_MIGRATION_CLIENT_UPDATES_COLUMN]: row[CLIENT_UPDATES_COMPAT_DATE_COLUMN],
    };
  }

  if (
    (row[AUTO_MIGRATION_CLIENT_UPDATES_COLUMN] === null ||
      row[AUTO_MIGRATION_CLIENT_UPDATES_COLUMN] === undefined ||
      row[AUTO_MIGRATION_CLIENT_UPDATES_COLUMN] === '') &&
    row[CLIENT_UPDATES_COMPAT_DATE_COLUMN]
  ) {
    return {
      ...row,
      [AUTO_MIGRATION_CLIENT_UPDATES_COLUMN]: row[CLIENT_UPDATES_COMPAT_DATE_COLUMN],
    };
  }

  return row;
}

const UPDATE_ROW_RETRY_ATTEMPTS = 20;
const UPDATE_ROW_RETRY_DELAY_MS = 300;

function isNoRowsReturnedError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === 'PGRST116') return true;

  const message = (error.message || '').toLowerCase();
  return (
    message.includes('no rows') ||
    message.includes('0 rows') ||
    message.includes('json object requested')
  );
}

async function updateRowWithMissingColumnFallback(
  supabase: SupabaseClient,
  tableName: string,
  id: string,
  patch: Record<string, unknown>
) {
  let nextPatch = { ...patch };
  let ignoredColumns: string[] = [];

  for (let attempt = 0; attempt < UPDATE_ROW_RETRY_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from(tableName)
      .update(nextPatch)
      .eq('id', id.trim())
      .select('*')
      .single();

    if (!error) return { data, ignoredColumns, error: null };

    if (isNoRowsReturnedError(error)) {
      if (attempt < UPDATE_ROW_RETRY_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, UPDATE_ROW_RETRY_DELAY_MS));
        continue;
      }

      return {
        data: null,
        ignoredColumns,
        error: {
          message: 'Row not found. It may be refreshing during sync. Please retry.',
        },
      };
    }

    const missingColumn = extractMissingColumnFromSchemaCacheError(error.message || '');
    if (!missingColumn || !Object.prototype.hasOwnProperty.call(nextPatch, missingColumn)) {
      return { data: null, ignoredColumns, error };
    }

    const autoMigrated = await tryAutoMigrateMissingTrackerColumn(tableName, missingColumn, supabase);
    if (autoMigrated) {
      continue;
    }

    const usedCompatibilityFallback =
      missingColumn === AUTO_MIGRATION_CLIENT_UPDATES_COLUMN &&
      applyClientUpdatesMeetingDateCompatibility(tableName, nextPatch);

    delete nextPatch[missingColumn];
    if (!usedCompatibilityFallback) {
      ignoredColumns = [...ignoredColumns, missingColumn];
    }

    if (Object.keys(nextPatch).length === 0) {
      const { data: existingRow, error: readError } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', id.trim())
        .single();

      if (readError) {
        return { data: null, ignoredColumns, error: readError };
      }

      return {
        data:
          tableName === AUTO_MIGRATION_CLIENT_UPDATES_TABLE && existingRow
            ? normalizeClientUpdatesRow(existingRow as Record<string, unknown>)
            : existingRow,
        ignoredColumns,
        error: null,
      };
    }
  }

  return { data: null, ignoredColumns, error: { message: 'Failed to update row after fallback retries' } };
}

async function insertRowWithMissingColumnFallback(
  supabase: SupabaseClient,
  tableName: string,
  row: Record<string, unknown>
) {
  let nextRow = { ...row };
  let ignoredColumns: string[] = [];

  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabase
      .from(tableName)
      .insert(nextRow)
      .select('*')
      .single();

    if (!error) return { data, ignoredColumns, error: null };

    const missingColumn = extractMissingColumnFromSchemaCacheError(error.message || '');
    if (!missingColumn || !Object.prototype.hasOwnProperty.call(nextRow, missingColumn)) {
      return { data: null, ignoredColumns, error };
    }

    const autoMigrated = await tryAutoMigrateMissingTrackerColumn(tableName, missingColumn, supabase);
    if (autoMigrated) {
      continue;
    }

    const usedCompatibilityFallback =
      missingColumn === AUTO_MIGRATION_CLIENT_UPDATES_COLUMN &&
      applyClientUpdatesMeetingDateCompatibility(tableName, nextRow);

    delete nextRow[missingColumn];
    if (!usedCompatibilityFallback) {
      ignoredColumns = [...ignoredColumns, missingColumn];
    }
  }

  return { data: null, ignoredColumns, error: { message: 'Failed to create row after fallback retries' } };
}

interface SelectTrackerRowsOptions {
  tableName: string;
  amFilter: string | null;
  monthParam: string | null;
  fromDate: string | null;
  toDate: string | null;
  dateCol?: string;
  limit: number;
  offset: number;
  sortCol: string;
  sortAscending: boolean;
}

async function selectTrackerRowsWithMissingColumnFallback(
  supabase: SupabaseClient,
  options: SelectTrackerRowsOptions
) {
  const ignoredColumns: string[] = [];
  let nextSortCol = options.sortCol;
  let nextDateCol = options.dateCol;
  let useDateFilter = true;

  const runQuery = async () => {
    let query = supabase
      .from(options.tableName)
      .select('*', { count: 'exact' })
      .order(nextSortCol, { ascending: options.sortAscending })
      .range(options.offset, options.offset + options.limit - 1);

    if (options.amFilter) {
      query = query.eq('account_manager_name', options.amFilter);
    }

    if (options.monthParam) {
      query = query.eq('month_label', options.monthParam);
    }

    if (useDateFilter && nextDateCol && options.fromDate) {
      query = query.gte(nextDateCol, options.fromDate);
    }
    if (useDateFilter && nextDateCol && options.toDate) {
      query = query.lte(nextDateCol, options.toDate);
    }

    return query;
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error, count } = await runQuery();
    if (!error) {
      return { data: data || [], count: count || 0, ignoredColumns, error: null };
    }

    const missingColumn = extractMissingColumnFromSchemaCacheError(error.message || '');
    if (!missingColumn) {
      return { data: [], count: 0, ignoredColumns, error };
    }

    const autoMigrated = await tryAutoMigrateMissingTrackerColumn(options.tableName, missingColumn, supabase);
    if (autoMigrated) {
      continue;
    }

    let handled = false;
    if (missingColumn === nextSortCol) {
      if (
        options.tableName === AUTO_MIGRATION_CLIENT_UPDATES_TABLE &&
        nextSortCol === AUTO_MIGRATION_CLIENT_UPDATES_COLUMN
      ) {
        nextSortCol = CLIENT_UPDATES_COMPAT_DATE_COLUMN;
      } else if (nextSortCol !== 'created_at') {
        nextSortCol = 'created_at';
      } else {
        handled = false;
      }
      handled = true;
    }
    if (useDateFilter && nextDateCol && missingColumn === nextDateCol) {
      if (
        options.tableName === AUTO_MIGRATION_CLIENT_UPDATES_TABLE &&
        nextDateCol === AUTO_MIGRATION_CLIENT_UPDATES_COLUMN
      ) {
        nextDateCol = CLIENT_UPDATES_COMPAT_DATE_COLUMN;
      } else {
        useDateFilter = false;
      }
      handled = true;
    }

    if (!handled || ignoredColumns.includes(missingColumn)) {
      return { data: [], count: 0, ignoredColumns, error };
    }

    ignoredColumns.push(missingColumn);
  }

  return {
    data: [],
    count: 0,
    ignoredColumns,
    error: { message: 'Failed to query rows after fallback retries' },
  };
}

/**
 * GET /api/performance/tracker
 * Query data from a specific PK tracker table.
 *
 * Query params:
 *   type     (required) - tracker type (e.g. fathom_videos)
 *   am       (optional) - filter by account_manager_name
 *   from     (optional) - date range start (ISO date)
 *   to       (optional) - date range end (ISO date)
 *   limit    (optional) - max rows, default 200
 *   offset   (optional) - offset for pagination
 *   sort     (optional) - column to sort by (default: date column or created_at)
 *   order    (optional) - asc or desc (default: desc)
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const trackerType = searchParams.get('type') as PKTrackerType | null;
  if (!trackerType || !TRACKER_TABLES[trackerType]) {
    return errorResponse(
      `Invalid or missing tracker type. Valid types: ${Object.keys(TRACKER_TABLES).join(', ')}`
    );
  }

  const tableName = TRACKER_TABLES[trackerType];
  const amFilter = searchParams.get('am');
  const fromDate = searchParams.get('from');
  const toDate = searchParams.get('to');
  const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 1000);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const sortCol = searchParams.get('sort') || DATE_COLUMNS[trackerType] || 'created_at';
  const sortOrder = searchParams.get('order') === 'asc' ? true : false;
  const monthParam = searchParams.get('month');
  const dateCol = DATE_COLUMNS[trackerType];

  const result = await selectTrackerRowsWithMissingColumnFallback(supabase, {
    tableName,
    amFilter,
    monthParam,
    fromDate,
    toDate,
    dateCol,
    limit,
    offset,
    sortCol,
    sortAscending: sortOrder,
  });

  if (result.error) return errorResponse(result.error.message, 500);

  const normalizedRows =
    trackerType === 'client_updates'
      ? result.data.map((row) => normalizeClientUpdatesRow(row as Record<string, unknown>))
      : result.data;

  return successResponse({
    tracker_type: trackerType,
    rows: normalizedRows,
    total: result.count,
    limit,
    offset,
    ignored_columns: result.ignoredColumns,
  });
}

interface UpdateTrackerRowBody {
  type: PKTrackerType;
  id: string;
  patch: Record<string, unknown>;
}

/**
 * PATCH /api/performance/tracker
 * Update a single tracker row in its respective pk_* table.
 *
 * Body:
 *   type: tracker type
 *   id: row id
 *   patch: partial object of editable columns
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<UpdateTrackerRowBody>(request);
  if (!parsed.ok) return parsed.response;

  const { supabase } = auth.ctx;
  const { type, id, patch } = parsed.body;

  if (!type || !TRACKER_TABLES[type]) {
    return errorResponse(
      `Invalid or missing tracker type. Valid types: ${Object.keys(TRACKER_TABLES).join(', ')}`
    );
  }
  if (!id?.trim()) {
    return errorResponse('id is required');
  }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return errorResponse('patch must be an object');
  }

  const safePatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (IMMUTABLE_UPDATE_FIELDS.has(key)) continue;
    safePatch[key] = value;
  }

  if (Object.keys(safePatch).length === 0) {
    return errorResponse('No editable fields provided');
  }

  const tableName = TRACKER_TABLES[type];
  const result = await updateRowWithMissingColumnFallback(
    supabase,
    tableName,
    id,
    safePatch
  );

  if (result.error) return errorResponse(result.error.message, 500);

  const normalizedRow =
    type === 'client_updates' && result.data
      ? normalizeClientUpdatesRow(result.data as Record<string, unknown>)
      : result.data;

  return successResponse({
    row: normalizedRow,
    ignored_columns: result.ignoredColumns,
  });
}

interface CreateTrackerRowBody {
  type: PKTrackerType;
  row: Record<string, unknown>;
}

/**
 * POST /api/performance/tracker
 * Create a tracker row for selected Performance Keeping trackers.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<CreateTrackerRowBody>(request);
  if (!parsed.ok) return parsed.response;

  const { supabase } = auth.ctx;
  const { type, row } = parsed.body;

  if (!type || !TRACKER_TABLES[type]) {
    return errorResponse(
      `Invalid or missing tracker type. Valid types: ${Object.keys(TRACKER_TABLES).join(', ')}`
    );
  }
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return errorResponse('row must be an object');
  }

  if (!CREATABLE_TRACKER_TYPES.has(type)) {
    return errorResponse(
      `Create is currently supported for: ${Array.from(CREATABLE_TRACKER_TYPES).join(', ')}`
    );
  }

  const safeRow: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (IMMUTABLE_UPDATE_FIELDS.has(key)) continue;
    safeRow[key] = value;
  }

  const requiredFields = CREATE_REQUIRED_FIELDS[type] || [];
  for (const requiredField of requiredFields) {
    if (!String(safeRow[requiredField] || '').trim()) {
      return errorResponse(`${requiredField} is required`);
    }
  }

  // Required by schema for manual inserts on these tracker tables.
  if (!String(safeRow.source_tab || '').trim()) {
    safeRow.source_tab = 'manual_ui';
  }
  if (!Object.prototype.hasOwnProperty.call(safeRow, 'source_row')) {
    safeRow.source_row = null;
  }

  const tableName = TRACKER_TABLES[type];
  const result = await insertRowWithMissingColumnFallback(
    supabase,
    tableName,
    safeRow
  );

  if (result.error) return errorResponse(result.error.message, 500);

  const normalizedRow =
    type === 'client_updates' && result.data
      ? normalizeClientUpdatesRow(result.data as Record<string, unknown>)
      : result.data;

  return successResponse({
    row: normalizedRow,
    ignored_columns: result.ignoredColumns,
  }, 201);
}

interface DeleteTrackerRowBody {
  type: PKTrackerType;
  id: string;
}

/**
 * DELETE /api/performance/tracker
 * Delete a tracker row by id.
 */
export async function DELETE(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<DeleteTrackerRowBody>(request);
  if (!parsed.ok) return parsed.response;

  const { supabase } = auth.ctx;
  const { type, id } = parsed.body;

  if (!type || !TRACKER_TABLES[type]) {
    return errorResponse(
      `Invalid or missing tracker type. Valid types: ${Object.keys(TRACKER_TABLES).join(', ')}`
    );
  }
  if (!id?.trim()) {
    return errorResponse('id is required');
  }

  const tableName = TRACKER_TABLES[type];
  const { error } = await supabase
    .from(tableName)
    .delete()
    .eq('id', id.trim());

  if (error) return errorResponse(error.message, 500);

  return successResponse({ success: true });
}
