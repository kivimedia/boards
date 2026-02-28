import { SupabaseClient } from '@supabase/supabase-js';
import type {
  PortalBranding,
  SatisfactionSurvey,
  CustomReport,
  GanttTask,
} from './types';

// ============================================================================
// PORTAL BRANDING (WHITE-LABEL)
// ============================================================================

export async function getPortalBranding(
  supabase: SupabaseClient,
  clientId?: string
): Promise<PortalBranding | null> {
  let query = supabase.from('portal_branding').select('*');

  if (clientId) {
    query = query.eq('client_id', clientId);
  } else {
    query = query.is('client_id', null);
  }

  const { data } = await query.single();
  return data as PortalBranding | null;
}

export async function upsertPortalBranding(
  supabase: SupabaseClient,
  branding: {
    clientId?: string;
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    faviconUrl?: string;
    customDomain?: string;
    companyName?: string;
    footerText?: string;
    isActive?: boolean;
  }
): Promise<PortalBranding | null> {
  const { data, error } = await supabase
    .from('portal_branding')
    .upsert({
      client_id: branding.clientId ?? null,
      logo_url: branding.logoUrl ?? null,
      primary_color: branding.primaryColor ?? '#6366f1',
      secondary_color: branding.secondaryColor ?? '#0f172a',
      accent_color: branding.accentColor ?? '#faf7f2',
      favicon_url: branding.faviconUrl ?? null,
      custom_domain: branding.customDomain ?? null,
      company_name: branding.companyName ?? null,
      footer_text: branding.footerText ?? null,
      is_active: branding.isActive ?? false,
    })
    .select()
    .single();

  if (error) return null;
  return data as PortalBranding;
}

// ============================================================================
// SATISFACTION SURVEYS
// ============================================================================

export async function submitSurvey(
  supabase: SupabaseClient,
  survey: {
    clientId: string;
    cardId?: string;
    rating: number;
    feedback?: string;
    surveyType: string;
    submittedBy?: string;
  }
): Promise<SatisfactionSurvey | null> {
  const { data, error } = await supabase
    .from('satisfaction_surveys')
    .insert({
      client_id: survey.clientId,
      card_id: survey.cardId ?? null,
      rating: survey.rating,
      feedback: survey.feedback ?? null,
      survey_type: survey.surveyType,
      submitted_by: survey.submittedBy ?? null,
    })
    .select()
    .single();

  if (error) return null;
  return data as SatisfactionSurvey;
}

export async function getSurveys(
  supabase: SupabaseClient,
  filters?: { clientId?: string; surveyType?: string; limit?: number }
): Promise<SatisfactionSurvey[]> {
  let query = supabase
    .from('satisfaction_surveys')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters?.limit ?? 50);

  if (filters?.clientId) query = query.eq('client_id', filters.clientId);
  if (filters?.surveyType) query = query.eq('survey_type', filters.surveyType);

  const { data } = await query;
  return (data as SatisfactionSurvey[]) ?? [];
}

export async function getSurveyStats(
  supabase: SupabaseClient,
  clientId: string
): Promise<{ averageRating: number; totalResponses: number; byType: Record<string, { avg: number; count: number }> }> {
  const surveys = await getSurveys(supabase, { clientId, limit: 1000 });

  if (surveys.length === 0) {
    return { averageRating: 0, totalResponses: 0, byType: {} };
  }

  const totalRating = surveys.reduce((sum, s) => sum + s.rating, 0);
  const byType: Record<string, { avg: number; count: number; sum: number }> = {};

  for (const survey of surveys) {
    if (!byType[survey.survey_type]) {
      byType[survey.survey_type] = { avg: 0, count: 0, sum: 0 };
    }
    byType[survey.survey_type].count++;
    byType[survey.survey_type].sum += survey.rating;
  }

  for (const type of Object.keys(byType)) {
    byType[type].avg = Math.round((byType[type].sum / byType[type].count) * 100) / 100;
  }

  return {
    averageRating: Math.round((totalRating / surveys.length) * 100) / 100,
    totalResponses: surveys.length,
    byType: Object.fromEntries(
      Object.entries(byType).map(([k, v]) => [k, { avg: v.avg, count: v.count }])
    ),
  };
}

// ============================================================================
// CUSTOM REPORTS
// ============================================================================

export async function getCustomReports(
  supabase: SupabaseClient,
  filters?: { reportType?: string; createdBy?: string; shared?: boolean }
): Promise<CustomReport[]> {
  let query = supabase
    .from('custom_reports')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.reportType) query = query.eq('report_type', filters.reportType);
  if (filters?.createdBy) query = query.eq('created_by', filters.createdBy);
  if (filters?.shared !== undefined) query = query.eq('is_shared', filters.shared);

  const { data } = await query;
  return (data as CustomReport[]) ?? [];
}

export async function getCustomReport(
  supabase: SupabaseClient,
  reportId: string
): Promise<CustomReport | null> {
  const { data } = await supabase
    .from('custom_reports')
    .select('*')
    .eq('id', reportId)
    .single();

  return data as CustomReport | null;
}

export async function createCustomReport(
  supabase: SupabaseClient,
  report: {
    name: string;
    description?: string;
    reportType: string;
    config: Record<string, unknown>;
    createdBy: string;
    isShared?: boolean;
    schedule?: string;
  }
): Promise<CustomReport | null> {
  const { data, error } = await supabase
    .from('custom_reports')
    .insert({
      name: report.name,
      description: report.description ?? null,
      report_type: report.reportType,
      config: report.config,
      created_by: report.createdBy,
      is_shared: report.isShared ?? false,
      schedule: report.schedule ?? null,
    })
    .select()
    .single();

  if (error) return null;
  return data as CustomReport;
}

export async function updateCustomReport(
  supabase: SupabaseClient,
  reportId: string,
  updates: Partial<Pick<CustomReport, 'name' | 'description' | 'config' | 'is_shared' | 'schedule'>>
): Promise<CustomReport | null> {
  const { data, error } = await supabase
    .from('custom_reports')
    .update(updates)
    .eq('id', reportId)
    .select()
    .single();

  if (error) return null;
  return data as CustomReport;
}

export async function deleteCustomReport(
  supabase: SupabaseClient,
  reportId: string
): Promise<void> {
  await supabase.from('custom_reports').delete().eq('id', reportId);
}

// ============================================================================
// GANTT VIEW
// ============================================================================

export async function getGanttTasks(
  supabase: SupabaseClient,
  boardId: string
): Promise<GanttTask[]> {
  const { data: placements } = await supabase
    .from('card_placements')
    .select('card_id, list_id, position')
    .eq('board_id', boardId);

  if (!placements || placements.length === 0) return [];

  const cardIds = placements.map((p: { card_id: string }) => p.card_id);

  const { data: cards } = await supabase
    .from('cards')
    .select('id, title, start_date, end_date, progress_percent, priority')
    .in('id', cardIds);

  if (!cards) return [];

  // Get list names
  const listIds = Array.from(new Set(placements.map((p: { list_id: string }) => p.list_id)));
  const { data: lists } = await supabase
    .from('lists')
    .select('id, name')
    .in('id', listIds);

  const listMap = new Map((lists ?? []).map((l: { id: string; name: string }) => [l.id, l.name]));
  const placementMap = new Map(
    placements.map((p: { card_id: string; list_id: string }) => [p.card_id, p.list_id])
  );

  // Get dependencies
  const { data: deps } = await supabase
    .from('card_dependencies')
    .select('source_card_id, target_card_id')
    .in('source_card_id', cardIds);

  const depMap = new Map<string, string[]>();
  for (const dep of deps ?? []) {
    const existing = depMap.get(dep.source_card_id) ?? [];
    existing.push(dep.target_card_id);
    depMap.set(dep.source_card_id, existing);
  }

  // Get assignees
  const { data: assignees } = await supabase
    .from('card_assignees')
    .select('card_id, user_id')
    .in('card_id', cardIds);

  const assigneeMap = new Map<string, string[]>();
  for (const a of assignees ?? []) {
    const existing = assigneeMap.get(a.card_id) ?? [];
    existing.push(a.user_id);
    assigneeMap.set(a.card_id, existing);
  }

  return cards.map((card: { id: string; title: string; start_date: string | null; end_date: string | null; progress_percent: number; priority: string | null }) => ({
    id: card.id,
    title: card.title,
    start_date: card.start_date,
    end_date: card.end_date,
    progress_percent: card.progress_percent ?? 0,
    card_id: card.id,
    board_id: boardId,
    list_name: listMap.get(placementMap.get(card.id) ?? '') ?? 'Unknown',
    dependencies: depMap.get(card.id) ?? [],
    assignees: assigneeMap.get(card.id) ?? [],
    priority: card.priority,
  }));
}

// ============================================================================
// BURNDOWN / VELOCITY METRICS
// ============================================================================

export async function getBurndownData(
  supabase: SupabaseClient,
  boardId: string,
  startDate: string,
  endDate: string
): Promise<{ date: string; remaining: number; ideal: number }[]> {
  // Count cards on the board (head:true avoids 1,000-row limit)
  const { count: totalCards } = await supabase
    .from('card_placements')
    .select('card_id', { count: 'exact', head: true })
    .eq('board_id', boardId);

  if (!totalCards) return [];

  // Get activity logs for card completions in the date range
  const { data: activities } = await supabase
    .from('activity_log')
    .select('created_at')
    .eq('board_id', boardId)
    .eq('event_type', 'card_completed')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: true })
    .limit(50000);
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  const dailyIdealBurn = totalCards / totalDays;

  // Count completions by day
  const completionsByDay: Record<string, number> = {};
  for (const activity of activities ?? []) {
    const day = activity.created_at.split('T')[0];
    completionsByDay[day] = (completionsByDay[day] ?? 0) + 1;
  }

  const data: { date: string; remaining: number; ideal: number }[] = [];
  let remaining = totalCards;

  for (let d = 0; d <= totalDays; d++) {
    const date = new Date(start);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().split('T')[0];

    remaining -= (completionsByDay[dateStr] ?? 0);
    data.push({
      date: dateStr,
      remaining: Math.max(0, remaining),
      ideal: Math.max(0, Math.round((totalCards - dailyIdealBurn * d) * 100) / 100),
    });
  }

  return data;
}

// ============================================================================
// VELOCITY METRICS
// ============================================================================

export interface VelocityDataPoint {
  period_start: string;
  period_end: string;
  cards_completed: number;
  cards_added: number;
  avg_cycle_time_hours: number | null;
}

/**
 * Get velocity data for a board over a date range, grouped by sprint intervals.
 * sprintDays: 7 (weekly), 14 (biweekly), 30 (monthly)
 */
export async function getVelocityData(
  supabase: SupabaseClient,
  boardId: string,
  startDate: string,
  endDate: string,
  sprintDays: number = 7
): Promise<VelocityDataPoint[]> {
  // Get activity logs for completions
  const { data: completions } = await supabase
    .from('activity_log')
    .select('created_at, card_id')
    .eq('board_id', boardId)
    .eq('event_type', 'card_completed')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: true });

  // Get activity logs for card additions
  const { data: additions } = await supabase
    .from('activity_log')
    .select('created_at, card_id')
    .eq('board_id', boardId)
    .eq('event_type', 'card_created')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: true });

  // Get cycle times from card_column_history if available
  const { data: cycleHistory } = await supabase
    .from('card_column_history')
    .select('card_id, entered_at, exited_at')
    .gte('entered_at', startDate)
    .lte('entered_at', endDate)
    .not('exited_at', 'is', null);

  // Build sprint periods
  const start = new Date(startDate);
  const end = new Date(endDate);
  const periods: VelocityDataPoint[] = [];

  let periodStart = new Date(start);
  while (periodStart < end) {
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + sprintDays);
    if (periodEnd > end) periodEnd.setTime(end.getTime());

    const pStartStr = periodStart.toISOString().split('T')[0];
    const pEndStr = periodEnd.toISOString().split('T')[0];

    // Count completions in this period
    const periodCompletions = (completions ?? []).filter((c: { created_at: string }) => {
      const d = c.created_at.split('T')[0];
      return d >= pStartStr && d < pEndStr;
    });

    // Count additions in this period
    const periodAdditions = (additions ?? []).filter((a: { created_at: string }) => {
      const d = a.created_at.split('T')[0];
      return d >= pStartStr && d < pEndStr;
    });

    // Calculate average cycle time for completed cards in this period
    let avgCycleTime: number | null = null;
    if (cycleHistory && cycleHistory.length > 0) {
      const completedCardIds = new Set(periodCompletions.map((c: { card_id: string }) => c.card_id));
      const relevantHistory = cycleHistory.filter((h: { card_id: string }) => completedCardIds.has(h.card_id));
      if (relevantHistory.length > 0) {
        const totalHours = relevantHistory.reduce((sum: number, h: { entered_at: string; exited_at: string }) => {
          const entered = new Date(h.entered_at).getTime();
          const exited = new Date(h.exited_at).getTime();
          return sum + (exited - entered) / (1000 * 60 * 60);
        }, 0);
        avgCycleTime = Math.round((totalHours / relevantHistory.length) * 10) / 10;
      }
    }

    periods.push({
      period_start: pStartStr,
      period_end: pEndStr,
      cards_completed: periodCompletions.length,
      cards_added: periodAdditions.length,
      avg_cycle_time_hours: avgCycleTime,
    });

    periodStart = new Date(periodEnd);
  }

  return periods;
}
