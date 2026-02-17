import { SupabaseClient } from '@supabase/supabase-js';
import type { TimeEntry, TimeReport, TimeReportSnapshot } from './types';

// ============================================================================
// TIMER OPERATIONS
// ============================================================================

export async function startTimer(
  supabase: SupabaseClient,
  cardId: string,
  userId: string,
  options?: { boardId?: string; clientId?: string; description?: string; isBillable?: boolean }
): Promise<TimeEntry | null> {
  // Stop any running timer for this user first
  await stopRunningTimer(supabase, userId);

  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      card_id: cardId,
      user_id: userId,
      board_id: options?.boardId ?? null,
      client_id: options?.clientId ?? null,
      description: options?.description ?? null,
      started_at: new Date().toISOString(),
      is_billable: options?.isBillable ?? true,
      is_running: true,
    })
    .select()
    .single();

  if (error) return null;
  return data as TimeEntry;
}

export async function stopTimer(
  supabase: SupabaseClient,
  entryId: string
): Promise<TimeEntry | null> {
  const { data: entry } = await supabase
    .from('time_entries')
    .select('*')
    .eq('id', entryId)
    .single();

  if (!entry || !entry.is_running) return null;

  const endedAt = new Date();
  const startedAt = new Date(entry.started_at);
  const durationMinutes = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);

  const { data, error } = await supabase
    .from('time_entries')
    .update({
      ended_at: endedAt.toISOString(),
      duration_minutes: durationMinutes,
      is_running: false,
    })
    .eq('id', entryId)
    .select()
    .single();

  if (error) return null;
  return data as TimeEntry;
}

export async function stopRunningTimer(
  supabase: SupabaseClient,
  userId: string
): Promise<TimeEntry | null> {
  const { data: running } = await supabase
    .from('time_entries')
    .select('id')
    .eq('user_id', userId)
    .eq('is_running', true)
    .limit(1)
    .single();

  if (!running) return null;
  return stopTimer(supabase, running.id);
}

export async function getRunningTimer(
  supabase: SupabaseClient,
  userId: string
): Promise<TimeEntry | null> {
  const { data } = await supabase
    .from('time_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('is_running', true)
    .limit(1)
    .single();

  return data as TimeEntry | null;
}

// ============================================================================
// MANUAL ENTRY
// ============================================================================

export async function createManualEntry(
  supabase: SupabaseClient,
  entry: {
    cardId: string;
    userId: string;
    boardId?: string;
    clientId?: string;
    description?: string;
    startedAt: string;
    endedAt: string;
    isBillable?: boolean;
  }
): Promise<TimeEntry | null> {
  const startedAt = new Date(entry.startedAt);
  const endedAt = new Date(entry.endedAt);
  const durationMinutes = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);

  if (durationMinutes <= 0) return null;

  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      card_id: entry.cardId,
      user_id: entry.userId,
      board_id: entry.boardId ?? null,
      client_id: entry.clientId ?? null,
      description: entry.description ?? null,
      started_at: entry.startedAt,
      ended_at: entry.endedAt,
      duration_minutes: durationMinutes,
      is_billable: entry.isBillable ?? true,
      is_running: false,
    })
    .select()
    .single();

  if (error) return null;
  return data as TimeEntry;
}

export async function updateTimeEntry(
  supabase: SupabaseClient,
  entryId: string,
  updates: Partial<Pick<TimeEntry, 'description' | 'is_billable' | 'started_at' | 'ended_at'>>
): Promise<TimeEntry | null> {
  const dbUpdates: Record<string, unknown> = { ...updates };

  // Recalculate duration if dates changed
  if (updates.started_at || updates.ended_at) {
    const { data: existing } = await supabase
      .from('time_entries')
      .select('started_at, ended_at, is_running')
      .eq('id', entryId)
      .single();

    if (existing && !existing.is_running) {
      const start = new Date(updates.started_at ?? existing.started_at);
      const end = new Date(updates.ended_at ?? existing.ended_at);
      dbUpdates.duration_minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    }
  }

  const { data, error } = await supabase
    .from('time_entries')
    .update(dbUpdates)
    .eq('id', entryId)
    .select()
    .single();

  if (error) return null;
  return data as TimeEntry;
}

export async function deleteTimeEntry(
  supabase: SupabaseClient,
  entryId: string
): Promise<void> {
  await supabase.from('time_entries').delete().eq('id', entryId);
}

// ============================================================================
// QUERIES
// ============================================================================

export async function getCardTimeEntries(
  supabase: SupabaseClient,
  cardId: string
): Promise<TimeEntry[]> {
  const { data } = await supabase
    .from('time_entries')
    .select('*')
    .eq('card_id', cardId)
    .order('started_at', { ascending: false });

  return (data as TimeEntry[]) ?? [];
}

export async function getUserTimeEntries(
  supabase: SupabaseClient,
  userId: string,
  filters?: { startDate?: string; endDate?: string; boardId?: string; clientId?: string }
): Promise<TimeEntry[]> {
  let query = supabase
    .from('time_entries')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false });

  if (filters?.startDate) query = query.gte('started_at', filters.startDate);
  if (filters?.endDate) query = query.lte('started_at', filters.endDate);
  if (filters?.boardId) query = query.eq('board_id', filters.boardId);
  if (filters?.clientId) query = query.eq('client_id', filters.clientId);

  const { data } = await query;
  return (data as TimeEntry[]) ?? [];
}

// ============================================================================
// REPORTS
// ============================================================================

export async function getTimeReport(
  supabase: SupabaseClient,
  filters: {
    startDate: string;
    endDate: string;
    userId?: string;
    boardId?: string;
    clientId?: string;
  }
): Promise<TimeReport> {
  let query = supabase
    .from('time_entries')
    .select('*')
    .eq('is_running', false)
    .gte('started_at', filters.startDate)
    .lte('started_at', filters.endDate);

  if (filters.userId) query = query.eq('user_id', filters.userId);
  if (filters.boardId) query = query.eq('board_id', filters.boardId);
  if (filters.clientId) query = query.eq('client_id', filters.clientId);

  const { data } = await query;
  const entries = (data as TimeEntry[]) ?? [];

  let totalMinutes = 0;
  let billableMinutes = 0;
  let nonBillableMinutes = 0;
  const byUser: Record<string, number> = {};
  const byBoard: Record<string, number> = {};
  const byClient: Record<string, number> = {};

  for (const entry of entries) {
    const mins = entry.duration_minutes ?? 0;
    totalMinutes += mins;
    if (entry.is_billable) {
      billableMinutes += mins;
    } else {
      nonBillableMinutes += mins;
    }
    byUser[entry.user_id] = (byUser[entry.user_id] ?? 0) + mins;
    if (entry.board_id) byBoard[entry.board_id] = (byBoard[entry.board_id] ?? 0) + mins;
    if (entry.client_id) byClient[entry.client_id] = (byClient[entry.client_id] ?? 0) + mins;
  }

  return { totalMinutes, billableMinutes, nonBillableMinutes, entries, byUser, byBoard, byClient };
}

export async function getCardTotalTime(
  supabase: SupabaseClient,
  cardId: string
): Promise<{ totalMinutes: number; billableMinutes: number }> {
  const entries = await getCardTimeEntries(supabase, cardId);
  let totalMinutes = 0;
  let billableMinutes = 0;

  for (const entry of entries) {
    const mins = entry.duration_minutes ?? 0;
    totalMinutes += mins;
    if (entry.is_billable) billableMinutes += mins;
  }

  return { totalMinutes, billableMinutes };
}

export async function getEstimateVsActual(
  supabase: SupabaseClient,
  cardId: string
): Promise<{ estimatedHours: number | null; actualHours: number }> {
  const { data: card } = await supabase
    .from('cards')
    .select('estimated_hours')
    .eq('id', cardId)
    .single();

  const { totalMinutes } = await getCardTotalTime(supabase, cardId);

  return {
    estimatedHours: card?.estimated_hours ?? null,
    actualHours: Math.round((totalMinutes / 60) * 100) / 100,
  };
}

// ============================================================================
// EXPORT
// ============================================================================

export function formatTimeEntriesForCSV(entries: TimeEntry[]): string {
  const header = 'Date,Description,Duration (hrs),Billable,Card ID,Board ID,Client ID';
  const rows = entries.map((e) => {
    const date = e.started_at.split('T')[0];
    const hours = ((e.duration_minutes ?? 0) / 60).toFixed(2);
    const desc = (e.description ?? '').replace(/,/g, ';');
    return `${date},${desc},${hours},${e.is_billable},${e.card_id},${e.board_id ?? ''},${e.client_id ?? ''}`;
  });
  return [header, ...rows].join('\n');
}

export async function getTimeReportSnapshots(
  supabase: SupabaseClient,
  filters: { reportType?: string; startDate?: string; endDate?: string; userId?: string }
): Promise<TimeReportSnapshot[]> {
  let query = supabase
    .from('time_report_snapshots')
    .select('*')
    .order('report_date', { ascending: false });

  if (filters.reportType) query = query.eq('report_type', filters.reportType);
  if (filters.startDate) query = query.gte('report_date', filters.startDate);
  if (filters.endDate) query = query.lte('report_date', filters.endDate);
  if (filters.userId) query = query.eq('user_id', filters.userId);

  const { data } = await query;
  return (data as TimeReportSnapshot[]) ?? [];
}
