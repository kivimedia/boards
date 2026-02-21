/**
 * Performance Keeping Sync Engine
 *
 * Pulls data from Kivi Media's Google Sheets ecosystem and upserts
 * into the pk_* tables in Supabase. Adapted from the crawler script
 * at scripts/crawl-performance-sheets.js.
 *
 * Phase 1 (Bridge): Read-only from Google Sheets, display in KM Boards.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import {
  PKTrackerType,
  PKSyncConfig,
  PKSyncRun,
} from './types';
import fs from 'fs';
import path from 'path';

// ─── CONFIGURATION ──────────────────────────────────────────────
const MAX_ROWS_PER_TAB = 2000;
const MAX_TABS_PER_SHEET = 30;
const RATE_LIMIT_DELAY_MS = 500; // between tabs to avoid 429s
const MAX_RUNTIME_MS = 5 * 60 * 1000; // 5 min per sync run

// ─── AUTH ────────────────────────────────────────────────────────
export function getGoogleAuth(): JWT {
  // Try environment variable first (for production)
  const credsJson = process.env.GOOGLE_CREDENTIALS_JSON;
  if (credsJson) {
    const creds = JSON.parse(credsJson);
    return new JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  }

  // Fall back to file (for local dev)
  const credPath = path.join(process.cwd(), 'google-credentials.json');
  if (!fs.existsSync(credPath)) {
    throw new Error('Missing google-credentials.json and GOOGLE_CREDENTIALS_JSON env var');
  }
  const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  return new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

// ─── RAW SHEETS API ──────────────────────────────────────────────
interface SheetTabData {
  tabTitle: string;
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
}

async function fetchTabData(
  spreadsheetId: string,
  tabTitle: string,
  auth: JWT,
  maxRows = MAX_ROWS_PER_TAB
): Promise<SheetTabData> {
  const token = await auth.getAccessToken();
  const range = encodeURIComponent(`'${tabTitle}'!A1:AZ${maxRows}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?ranges=${range}&includeGridData=true&fields=sheets.data.rowData.values(formattedValue)`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token.token}` },
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Sheets API ${resp.status}: ${errText.substring(0, 200)}`);
  }

  const data = await resp.json();
  const rowData = data.sheets?.[0]?.data?.[0]?.rowData || [];

  const headers: string[] = [];
  const rows: Record<string, string>[] = [];

  for (let r = 0; r < rowData.length; r++) {
    const values = rowData[r].values || [];

    if (r === 0) {
      for (let c = 0; c < values.length; c++) {
        headers[c] = values[c].formattedValue || `col_${c}`;
      }
      continue;
    }

    const rowObj: Record<string, string> = {};
    let hasContent = false;
    for (let c = 0; c < values.length; c++) {
      const val = values[c].formattedValue || '';
      if (val) hasContent = true;
      rowObj[headers[c] || `col_${c}`] = val;
    }

    if (hasContent) {
      rows.push(rowObj);
    }
  }

  return { tabTitle, headers, rows, rowCount: rows.length };
}

// ─── PARSERS: convert raw sheet rows to typed DB records ─────────

export function parseBoolean(val: string | undefined): boolean | null {
  if (!val) return null;
  const lower = val.toLowerCase().trim();
  if (['yes', 'true', 'done', '1', 'completed'].includes(lower)) return true;
  if (['no', 'false', '0', 'not done', 'pending'].includes(lower)) return false;
  return null;
}

export function parseDate(val: string | undefined): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (!trimmed) return null;

  // Try MM/DD/YYYY format first (before Date constructor to avoid timezone issues)
  const slashParts = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashParts) {
    return `${slashParts[3]}-${slashParts[1].padStart(2, '0')}-${slashParts[2].padStart(2, '0')}`;
  }

  // Try YYYY-MM-DD (already correct format, extract directly to avoid timezone shift)
  const isoParts = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoParts) {
    return `${isoParts[1]}-${isoParts[2]}-${isoParts[3]}`;
  }

  // Fallback: try Date constructor using local date parts to avoid UTC shift
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  return null;
}

export function parseNumber(val: string | undefined): number | null {
  if (!val) return null;
  const cleaned = val.replace(/[%,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ─── SYNC FUNCTIONS PER TRACKER TYPE ────────────────────────────

type SyncResult = {
  rows_synced: number;
  errors: Array<{ tab: string; error: string }>;
};

// Known AM tab names (used across multiple sheets)
const AM_TAB_NAMES = ['ANGEL', 'KATH', 'DEVI', 'HILDA', 'RIZA', 'SARAH', 'ELA', 'IVY', 'MARIZ'];

function isAMTab(tabTitle: string): boolean {
  return AM_TAB_NAMES.some(
    name => tabTitle.toUpperCase().includes(name)
  );
}

function extractAMName(tabTitle: string): string {
  // Capitalize first letter: "ANGEL" -> "Angel"
  const upper = tabTitle.toUpperCase().trim();
  for (const name of AM_TAB_NAMES) {
    if (upper.includes(name)) {
      return name.charAt(0) + name.slice(1).toLowerCase();
    }
  }
  return tabTitle;
}

async function syncFathomVideos(
  supabase: SupabaseClient,
  spreadsheetId: string,
  auth: JWT
): Promise<SyncResult> {
  const doc = new GoogleSpreadsheet(spreadsheetId, auth);
  await doc.loadInfo();

  let totalRows = 0;
  const errors: SyncResult['errors'] = [];

  // Clear existing data for full refresh
  await supabase.from('pk_fathom_videos').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  for (const sheet of doc.sheetsByIndex) {
    if (['Summary'].includes(sheet.title)) continue;
    if (doc.sheetsByIndex.indexOf(sheet) >= MAX_TABS_PER_SHEET) break;

    try {
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS));
      const tabData = await fetchTabData(spreadsheetId, sheet.title, auth);
      const amName = extractAMName(sheet.title);

      // IVY tab has the full schema; other tabs have minimal data
      const records = tabData.rows.map((row, idx) => ({
        account_manager_name: amName,
        client_name: row['CLIENT'] || null,
        meeting_date: parseDate(row['MEETING DATE']),
        date_watched: parseDate(row['DATE WATCHED']),
        fathom_video_link: row['FATHOM VIDEO LINK'] || null,
        watched: parseBoolean(row['WATCHED FATHOM VIDEO?']),
        action_items_sent: parseBoolean(row['SENT ACTION ITEMS TO ZIV?']),
        attachments: row['ATTACHMENTS'] || null,
        notes: row['NOTES'] || null,
        source_tab: sheet.title,
        source_row: idx + 2,
      })).filter(r => r.client_name || r.meeting_date || r.date_watched);

      if (records.length > 0) {
        const { error } = await supabase.from('pk_fathom_videos').insert(records);
        if (error) errors.push({ tab: sheet.title, error: error.message });
        else totalRows += records.length;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ tab: sheet.title, error: msg });
    }
  }

  return { rows_synced: totalRows, errors };
}

async function syncClientUpdates(
  supabase: SupabaseClient,
  spreadsheetId: string,
  auth: JWT
): Promise<SyncResult> {
  const doc = new GoogleSpreadsheet(spreadsheetId, auth);
  await doc.loadInfo();

  let totalRows = 0;
  const errors: SyncResult['errors'] = [];

  await supabase.from('pk_client_updates').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  for (const sheet of doc.sheetsByIndex) {
    if (['Summary'].includes(sheet.title)) continue;
    if (doc.sheetsByIndex.indexOf(sheet) >= MAX_TABS_PER_SHEET) break;

    try {
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS));
      const tabData = await fetchTabData(spreadsheetId, sheet.title, auth);
      const amName = extractAMName(sheet.title);

      const records = tabData.rows.map((row, idx) => ({
        account_manager_name: amName,
        client_name: row['CLIENT'] || null,
        date_sent: parseDate(row['DATE SENT'] || row['DATE']),
        on_time: parseBoolean(row['UPDATE SENT ON TIME?'] || row['UPDATE SENT ON TIME'] || row['UPDATE SENT ON TIME(?)']),
        method: row['METHOD(Email,Whatsapp,etc.)'] || row['METHOD'] || null,
        notes: row['NOTES'] || null,
        source_tab: sheet.title,
        source_row: idx + 2,
      })).filter(r => r.client_name || r.date_sent);

      if (records.length > 0) {
        const { error } = await supabase.from('pk_client_updates').insert(records);
        if (error) errors.push({ tab: sheet.title, error: error.message });
        else totalRows += records.length;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ tab: sheet.title, error: msg });
    }
  }

  return { rows_synced: totalRows, errors };
}

async function syncSanityChecks(
  supabase: SupabaseClient,
  spreadsheetId: string,
  auth: JWT
): Promise<SyncResult> {
  const doc = new GoogleSpreadsheet(spreadsheetId, auth);
  await doc.loadInfo();

  let totalRows = 0;
  const errors: SyncResult['errors'] = [];

  await supabase.from('pk_sanity_checks').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  for (const sheet of doc.sheetsByIndex) {
    if (['Dashboard', 'Summary'].includes(sheet.title)) continue;
    if (doc.sheetsByIndex.indexOf(sheet) >= MAX_TABS_PER_SHEET) break;

    try {
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS));
      const tabData = await fetchTabData(spreadsheetId, sheet.title, auth);
      const amName = extractAMName(sheet.title);

      const records = tabData.rows.map((row, idx) => ({
        account_manager_name: amName,
        check_date: parseDate(row['DATE']),
        client_name: row['CLIENT'] || null,
        business_name: row['BUSINESS NAME'] || null,
        sanity_check_done: parseBoolean(row['SANITY CHECK DONE']),
        notes: row['NOTES'] || null,
        source_tab: sheet.title,
        source_row: idx + 2,
      })).filter(r => r.client_name || r.check_date);

      if (records.length > 0) {
        const { error } = await supabase.from('pk_sanity_checks').insert(records);
        if (error) errors.push({ tab: sheet.title, error: error.message });
        else totalRows += records.length;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ tab: sheet.title, error: msg });
    }
  }

  return { rows_synced: totalRows, errors };
}

async function syncDailyGoals(
  supabase: SupabaseClient,
  spreadsheetId: string,
  auth: JWT
): Promise<SyncResult> {
  const doc = new GoogleSpreadsheet(spreadsheetId, auth);
  await doc.loadInfo();

  let totalRows = 0;
  const errors: SyncResult['errors'] = [];

  await supabase.from('pk_daily_goals').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // Only sync data tabs (FEB'26, 2026 Records), skip dashboards
  const dataTabs = doc.sheetsByIndex.filter(
    s => s.title.includes('Records') || s.title.match(/^[A-Z]{3}'\d{2}$/)
  );

  for (const sheet of dataTabs) {
    try {
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS));
      const tabData = await fetchTabData(spreadsheetId, sheet.title, auth);

      const records = tabData.rows.map((row, idx) => ({
        entry_date: parseDate(row['Date']),
        designer_dev: row['Designer/Dev'] || 'Unknown',
        commitment: row['Commitments'] || null,
        link: row['Links'] || null,
        updated: parseBoolean(row['Updated']),
        completed: parseBoolean(row['Completed']),
        percent: parseNumber(row['%']),
        remarks: row['Remarks'] || null,
        source_tab: sheet.title,
        source_row: idx + 2,
      })).filter(r => r.designer_dev !== 'Unknown' || r.entry_date);

      if (records.length > 0) {
        const { error } = await supabase.from('pk_daily_goals').insert(records);
        if (error) errors.push({ tab: sheet.title, error: error.message });
        else totalRows += records.length;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ tab: sheet.title, error: msg });
    }
  }

  return { rows_synced: totalRows, errors };
}

async function syncSanityTests(
  supabase: SupabaseClient,
  spreadsheetId: string,
  sheetTitle: string,
  auth: JWT
): Promise<SyncResult> {
  const doc = new GoogleSpreadsheet(spreadsheetId, auth);
  await doc.loadInfo();

  let totalRows = 0;
  const errors: SyncResult['errors'] = [];

  // Only clear rows from this specific source sheet
  await supabase.from('pk_sanity_tests').delete().eq('source_sheet', sheetTitle);

  for (const sheet of doc.sheetsByIndex) {
    if (doc.sheetsByIndex.indexOf(sheet) >= MAX_TABS_PER_SHEET) break;

    try {
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS));
      const tabData = await fetchTabData(spreadsheetId, sheet.title, auth);
      const amName = extractAMName(sheet.title);

      const records = tabData.rows.map((row, idx) => ({
        account_manager_name: amName,
        test_date: parseDate(row['Date']),
        client_name: row['Client'] || row['Page Name'] || null,
        website: row['Website'] || row['Page Link'] || null,
        form_link: row['Form link'] || row['Form links'] || null,
        test_done: parseBoolean(row['Sanity test (DONE)'] || row['DONE']),
        email_received: parseBoolean(
          row['Email Notification received'] ||
          row['Email Notification received/reflected on backend forms'] ||
          row['Email Notification is received?']
        ),
        device: row['Mobile/Desktop'] || row['Desktop/Mobile'] || null,
        desktop_layout: row['Desktop layout'] || null,
        mobile_layout: row['Mobile layout'] || null,
        thank_you_page: parseBoolean(
          row['Thank you page is present'] ||
          row['Redirects to thank you page?'] ||
          row['Is there a separate thank you page?']
        ),
        notes: row['Notes'] || row['Remarks'] || row['Note'] || row['Comments'] || null,
        documentation: row['Documentation'] || row['Test recordings'] || null,
        source_sheet: sheetTitle,
        source_tab: sheet.title,
        source_row: idx + 2,
      })).filter(r => r.client_name || r.test_date);

      if (records.length > 0) {
        const { error } = await supabase.from('pk_sanity_tests').insert(records);
        if (error) errors.push({ tab: sheet.title, error: error.message });
        else totalRows += records.length;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ tab: sheet.title, error: msg });
    }
  }

  return { rows_synced: totalRows, errors };
}

async function syncTicketUpdates(
  supabase: SupabaseClient,
  spreadsheetId: string,
  auth: JWT
): Promise<SyncResult> {
  const doc = new GoogleSpreadsheet(spreadsheetId, auth);
  await doc.loadInfo();

  let totalRows = 0;
  const errors: SyncResult['errors'] = [];

  await supabase.from('pk_ticket_updates').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  for (const sheet of doc.sheetsByIndex) {
    if (doc.sheetsByIndex.indexOf(sheet) >= MAX_TABS_PER_SHEET) break;

    try {
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS));
      const tabData = await fetchTabData(spreadsheetId, sheet.title, auth);

      if (sheet.title === 'Report') {
        // Report tab has different structure
        const records = tabData.rows.map((row, idx) => ({
          month_label: 'Report',
          report_timeframe: row['TIMEFRAME'] || null,
          report_attachment: row['ATTACHMENTS'] || null,
          source_tab: sheet.title,
          source_row: idx + 2,
        })).filter(r => r.report_timeframe);

        if (records.length > 0) {
          const { error } = await supabase.from('pk_ticket_updates').insert(records);
          if (error) errors.push({ tab: sheet.title, error: error.message });
          else totalRows += records.length;
        }
      } else {
        // Monthly tabs: structured client lists
        const records = tabData.rows.map((row, idx) => ({
          month_label: sheet.title,
          client_type: Object.keys(row).find(k => k.includes('SPARK')) || null,
          client_name: Object.values(row).find(v => v && !v.includes('SPARK') && !v.includes('UPDATED')) || null,
          updated: null,
          source_tab: sheet.title,
          source_row: idx + 2,
        })).filter(r => r.client_name);

        if (records.length > 0) {
          const { error } = await supabase.from('pk_ticket_updates').insert(records);
          if (error) errors.push({ tab: sheet.title, error: error.message });
          else totalRows += records.length;
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ tab: sheet.title, error: msg });
    }
  }

  return { rows_synced: totalRows, errors };
}

async function syncFlaggedTickets(
  supabase: SupabaseClient,
  spreadsheetId: string,
  auth: JWT
): Promise<SyncResult> {
  const doc = new GoogleSpreadsheet(spreadsheetId, auth);
  await doc.loadInfo();

  let totalRows = 0;
  const errors: SyncResult['errors'] = [];

  await supabase.from('pk_flagged_tickets').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const teamTabs = doc.sheetsByIndex.filter(
    s => ['Designers', 'Developers', 'Video Editor'].includes(s.title)
  );

  for (const sheet of teamTabs) {
    try {
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS));
      const tabData = await fetchTabData(spreadsheetId, sheet.title, auth);

      const records = tabData.rows.map((row, idx) => ({
        team_type: sheet.title,
        date_range: row['Date Range'] || null,
        person_name: row['Name'] || 'Unknown',
        project_ticket_id: row['Project / Ticket ID'] || null,
        red_flag_type: row['Type of Red Flag'] || null,
        ticket_count: parseNumber(row['No. of Tickets']) ? Math.round(parseNumber(row['No. of Tickets'])!) : null,
        reasonable: parseBoolean(row['Reasonable?']),
        description: row['Description / Notes'] || null,
        source_tab: sheet.title,
        source_row: idx + 2,
      })).filter(r => r.person_name !== 'Unknown' || r.date_range);

      if (records.length > 0) {
        const { error } = await supabase.from('pk_flagged_tickets').insert(records);
        if (error) errors.push({ tab: sheet.title, error: error.message });
        else totalRows += records.length;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ tab: sheet.title, error: msg });
    }
  }

  return { rows_synced: totalRows, errors };
}

async function syncPingdom(
  supabase: SupabaseClient,
  spreadsheetId: string,
  auth: JWT
): Promise<SyncResult> {
  const doc = new GoogleSpreadsheet(spreadsheetId, auth);
  await doc.loadInfo();

  let totalRows = 0;
  const errors: SyncResult['errors'] = [];

  await supabase.from('pk_pingdom_tests').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // Only sync year tabs with structured data (2025, 2026)
  const dataTabs = doc.sheetsByIndex.filter(
    s => /^\d{4}$/.test(s.title)
  );

  for (const sheet of dataTabs) {
    try {
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS));
      const tabData = await fetchTabData(spreadsheetId, sheet.title, auth);

      const records = tabData.rows.map((row, idx) => ({
        test_date: parseDate(row['Test Date']),
        account_manager_name: row['Account Manager'] || null,
        client_name: row['Client'] || null,
        client_website: row['Client Website'] || null,
        report_attachment: row['Attachments / Report'] || null,
        notes: row['Notes'] || null,
        quarter_label: sheet.title,
        source_tab: sheet.title,
        source_row: idx + 2,
      })).filter(r => r.client_name || r.test_date);

      if (records.length > 0) {
        const { error } = await supabase.from('pk_pingdom_tests').insert(records);
        if (error) errors.push({ tab: sheet.title, error: error.message });
        else totalRows += records.length;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ tab: sheet.title, error: msg });
    }
  }

  return { rows_synced: totalRows, errors };
}

async function syncPicsMonitoring(
  supabase: SupabaseClient,
  spreadsheetId: string,
  auth: JWT
): Promise<SyncResult> {
  const doc = new GoogleSpreadsheet(spreadsheetId, auth);
  await doc.loadInfo();

  let totalRows = 0;
  const errors: SyncResult['errors'] = [];

  await supabase.from('pk_pics_monitoring').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const amTabs = doc.sheetsByIndex.filter(s => isAMTab(s.title));

  for (const sheet of amTabs) {
    try {
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS));
      const tabData = await fetchTabData(spreadsheetId, sheet.title, auth);
      const amName = extractAMName(sheet.title);

      const records = tabData.rows.map((row, idx) => ({
        account_manager_name: amName,
        week_label: row['Week'] || null,
        check_date: parseDate(row['Date']),
        client_name: row['Client'] || null,
        duration: row['Duration'] || null,
        notes: row['Notes / Attachments'] || row['Notes'] || null,
        source_tab: sheet.title,
        source_row: idx + 2,
      })).filter(r => r.client_name || r.check_date);

      if (records.length > 0) {
        const { error } = await supabase.from('pk_pics_monitoring').insert(records);
        if (error) errors.push({ tab: sheet.title, error: error.message });
        else totalRows += records.length;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ tab: sheet.title, error: msg });
    }
  }

  return { rows_synced: totalRows, errors };
}

async function syncUpdateSchedule(
  supabase: SupabaseClient,
  spreadsheetId: string,
  auth: JWT
): Promise<SyncResult> {
  const doc = new GoogleSpreadsheet(spreadsheetId, auth);
  await doc.loadInfo();

  const errors: SyncResult['errors'] = [];

  await supabase.from('pk_update_schedule').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  try {
    const tabData = await fetchTabData(spreadsheetId, doc.sheetsByIndex[0].title, auth);

    const records = tabData.rows.map((row, idx) => ({
      account_manager_name: row['Account Manager'] || null,
      client_name: row['Client'] || null,
      preferred_time: row['Preferred Time'] || null,
      notes: row['Notes'] || null,
      source_row: idx + 2,
    })).filter(r => r.client_name);

    if (records.length > 0) {
      const { error } = await supabase.from('pk_update_schedule').insert(records);
      if (error) errors.push({ tab: 'Update Schedule', error: error.message });
      return { rows_synced: records.length, errors };
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push({ tab: 'Update Schedule', error: msg });
  }

  return { rows_synced: 0, errors };
}

async function syncWebsiteStatus(
  supabase: SupabaseClient,
  spreadsheetId: string,
  auth: JWT
): Promise<SyncResult> {
  const doc = new GoogleSpreadsheet(spreadsheetId, auth);
  await doc.loadInfo();

  const errors: SyncResult['errors'] = [];

  await supabase.from('pk_website_status').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  try {
    const tabData = await fetchTabData(spreadsheetId, doc.sheetsByIndex[0].title, auth);

    const records = tabData.rows.map((row, idx) => ({
      account_manager_name: row['Account Manger'] || row['Account Manager'] || null,
      client_name: row['Client'] || null,
      business_name: row['Business Name'] || null,
      website_link: row['Website Link'] || null,
      status: row['Status'] || null,
      notes: row['Notes'] || null,
      source_row: idx + 2,
    })).filter(r => r.client_name);

    if (records.length > 0) {
      const { error } = await supabase.from('pk_website_status').insert(records);
      if (error) errors.push({ tab: 'Sheet1', error: error.message });
      return { rows_synced: records.length, errors };
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push({ tab: 'Sheet1', error: msg });
  }

  return { rows_synced: 0, errors };
}

// Generic sync for loosely structured sheets (monthly summaries, other activities, etc.)
async function syncGenericSheet(
  supabase: SupabaseClient,
  spreadsheetId: string,
  tableName: string,
  auth: JWT,
  mapRow: (row: Record<string, string>, tabTitle: string, idx: number) => Record<string, unknown> | null
): Promise<SyncResult> {
  const doc = new GoogleSpreadsheet(spreadsheetId, auth);
  await doc.loadInfo();

  let totalRows = 0;
  const errors: SyncResult['errors'] = [];

  await supabase.from(tableName).delete().neq('id', '00000000-0000-0000-0000-000000000000');

  for (const sheet of doc.sheetsByIndex) {
    if (doc.sheetsByIndex.indexOf(sheet) >= MAX_TABS_PER_SHEET) break;

    try {
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS));
      const tabData = await fetchTabData(spreadsheetId, sheet.title, auth);

      const records = tabData.rows
        .map((row, idx) => mapRow(row, sheet.title, idx + 2))
        .filter((r): r is Record<string, unknown> => r !== null);

      if (records.length > 0) {
        const { error } = await supabase.from(tableName).insert(records);
        if (error) errors.push({ tab: sheet.title, error: error.message });
        else totalRows += records.length;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ tab: sheet.title, error: msg });
    }
  }

  return { rows_synced: totalRows, errors };
}

// ─── MAIN SYNC ORCHESTRATOR ─────────────────────────────────────

const SYNC_HANDLERS: Record<
  PKTrackerType,
  (supabase: SupabaseClient, config: PKSyncConfig, auth: JWT) => Promise<SyncResult>
> = {
  masterlist: async () => ({ rows_synced: 0, errors: [] }), // Hub only, nothing to sync
  fathom_videos: async (sb, cfg, auth) => syncFathomVideos(sb, cfg.spreadsheet_id, auth),
  client_updates: async (sb, cfg, auth) => syncClientUpdates(sb, cfg.spreadsheet_id, auth),
  ticket_updates: async (sb, cfg, auth) => syncTicketUpdates(sb, cfg.spreadsheet_id, auth),
  daily_goals: async (sb, cfg, auth) => syncDailyGoals(sb, cfg.spreadsheet_id, auth),
  sanity_checks: async (sb, cfg, auth) => syncSanityChecks(sb, cfg.spreadsheet_id, auth),
  sanity_tests: async (sb, cfg, auth) => syncSanityTests(sb, cfg.spreadsheet_id, cfg.sheet_title, auth),
  pics_monitoring: async (sb, cfg, auth) => syncPicsMonitoring(sb, cfg.spreadsheet_id, auth),
  flagged_tickets: async (sb, cfg, auth) => syncFlaggedTickets(sb, cfg.spreadsheet_id, auth),
  weekly_tickets: async (sb, cfg, auth) =>
    syncGenericSheet(sb, cfg.spreadsheet_id, 'pk_weekly_tickets', auth, (row, tab, idx) => {
      const content = Object.values(row).filter(v => v).join(' | ');
      if (!content) return null;
      return { team_type: tab, raw_content: content, source_tab: tab, source_row: idx };
    }),
  pingdom_tests: async (sb, cfg, auth) => syncPingdom(sb, cfg.spreadsheet_id, auth),
  google_ads_reports: async (sb, cfg, auth) =>
    syncGenericSheet(sb, cfg.spreadsheet_id, 'pk_google_ads_reports', auth, (row, tab, idx) => {
      const content = Object.values(row).filter(v => v).join(' | ');
      if (!content) return null;
      return { month_label: tab, raw_content: content, source_tab: tab, source_row: idx };
    }),
  monthly_summaries: async (sb, cfg, auth) =>
    syncGenericSheet(sb, cfg.spreadsheet_id, 'pk_monthly_summaries', auth, (row, tab, idx) => {
      if (!row['Month'] && !row['Attachment']) return null;
      return { month_label: row['Month'] || tab, attachment: row['Attachment'] || null, source_tab: tab, source_row: idx };
    }),
  update_schedule: async (sb, cfg, auth) => syncUpdateSchedule(sb, cfg.spreadsheet_id, auth),
  holiday_tracking: async (sb, cfg, auth) =>
    syncGenericSheet(sb, cfg.spreadsheet_id, 'pk_holiday_tracking', auth, (row, tab, idx) => {
      const content = Object.values(row).filter(v => v).join(' | ');
      if (!content) return null;
      return { account_manager_name: extractAMName(tab), website_link: row['Website Link:'] || null, raw_content: content, source_tab: tab, source_row: idx };
    }),
  website_status: async (sb, cfg, auth) => syncWebsiteStatus(sb, cfg.spreadsheet_id, auth),
  google_analytics_status: async (sb, cfg, auth) =>
    syncGenericSheet(sb, cfg.spreadsheet_id, 'pk_google_analytics_status', auth, (row, tab, idx) => {
      const content = Object.values(row).filter(v => v).join(' | ');
      if (!content) return null;
      return { phase: row['Phase 1'] ? 'Phase 1' : 'Phase 2', status: Object.values(row)[0] || null, raw_content: content, source_row: idx };
    }),
  other_activities: async (sb, cfg, auth) =>
    syncGenericSheet(sb, cfg.spreadsheet_id, 'pk_other_activities', auth, (row, tab, idx) => {
      const content = Object.values(row).filter(v => v).join(' | ');
      if (!content) return null;
      return { activity_type: tab, content, source_tab: tab, source_row: idx };
    }),
};

/**
 * Sync a single tracker type from its Google Sheet into the database.
 */
export async function syncTracker(
  supabase: SupabaseClient,
  config: PKSyncConfig,
  auth: JWT
): Promise<SyncResult> {
  const handler = SYNC_HANDLERS[config.tracker_type];
  if (!handler) {
    return { rows_synced: 0, errors: [{ tab: '', error: `No handler for tracker type: ${config.tracker_type}` }] };
  }
  return handler(supabase, config, auth);
}

/**
 * Run a full sync of all active trackers.
 * Returns the sync run record.
 */
export async function syncAll(
  supabase: SupabaseClient,
  triggeredBy: 'cron' | 'manual' = 'cron',
  trackerFilter?: PKTrackerType[]
): Promise<PKSyncRun> {
  const startTime = Date.now();

  // Create sync run record
  const { data: runData, error: runError } = await supabase
    .from('pk_sync_runs')
    .insert({
      tracker_type: 'masterlist', // represents "all"
      status: 'running',
      triggered_by: triggeredBy,
    })
    .select()
    .single();

  if (runError || !runData) {
    throw new Error(`Failed to create sync run: ${runError?.message}`);
  }

  const runId = runData.id;
  const auth = getGoogleAuth();

  // Get all active sync configs
  let query = supabase.from('pk_sync_configs').select('*').eq('is_active', true);
  if (trackerFilter && trackerFilter.length > 0) {
    query = query.in('tracker_type', trackerFilter);
  }

  const { data: configs, error: configError } = await query;
  if (configError || !configs) {
    await supabase.from('pk_sync_runs').update({
      status: 'error',
      errors: [{ tab: '', error: `Failed to load configs: ${configError?.message}` }],
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    }).eq('id', runId);
    throw new Error(`Failed to load sync configs: ${configError?.message}`);
  }

  let totalSheets = 0;
  let totalRows = 0;
  const allErrors: Array<{ sheet: string; tab: string; error: string }> = [];

  for (const config of configs) {
    // Skip masterlist (hub only)
    if (config.tracker_type === 'masterlist') continue;

    // Check runtime
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      allErrors.push({ sheet: config.sheet_title, tab: '', error: 'Runtime limit exceeded' });
      break;
    }

    try {
      console.log(`[PK Sync] Syncing ${config.tracker_type}: ${config.sheet_title}`);
      const result = await syncTracker(supabase, config as PKSyncConfig, auth);

      totalSheets++;
      totalRows += result.rows_synced;

      // Record errors with sheet context
      for (const err of result.errors) {
        allErrors.push({ sheet: config.sheet_title, ...err });
      }

      // Update config with sync status
      await supabase.from('pk_sync_configs').update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: result.errors.length > 0 ? 'partial' : 'success',
        last_sync_error: result.errors.length > 0 ? result.errors[0].error : null,
        row_count: result.rows_synced,
      }).eq('id', config.id);

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      allErrors.push({ sheet: config.sheet_title, tab: '', error: msg });

      await supabase.from('pk_sync_configs').update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: 'error',
        last_sync_error: msg,
      }).eq('id', config.id);
    }
  }

  const finalStatus = allErrors.length === 0 ? 'success' : totalSheets > 0 ? 'partial' : 'error';

  // Update sync run
  await supabase.from('pk_sync_runs').update({
    status: finalStatus,
    sheets_synced: totalSheets,
    rows_synced: totalRows,
    errors: allErrors,
    duration_ms: Date.now() - startTime,
    completed_at: new Date().toISOString(),
  }).eq('id', runId);

  console.log(`[PK Sync] Complete: ${totalSheets} sheets, ${totalRows} rows, ${allErrors.length} errors, ${Date.now() - startTime}ms`);

  // Fetch and return the final run record
  const { data: finalRun } = await supabase.from('pk_sync_runs').select('*').eq('id', runId).single();
  return finalRun as PKSyncRun;
}