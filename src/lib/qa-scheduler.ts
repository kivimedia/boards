import { SupabaseClient } from '@supabase/supabase-js';

export interface QASchedule {
  id: string;
  card_id: string;
  url: string;
  frequency: 'daily' | 'weekly' | 'biweekly';
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  notify_user_id: string;
  created_at: string;
  updated_at: string;
}

export async function getSchedule(
  supabase: SupabaseClient,
  cardId: string,
  url: string
): Promise<QASchedule | null> {
  const { data } = await supabase
    .from('qa_schedules')
    .select('*')
    .eq('card_id', cardId)
    .eq('url', url)
    .single();

  return data as QASchedule | null;
}

export async function upsertSchedule(
  supabase: SupabaseClient,
  schedule: {
    cardId: string;
    url: string;
    frequency: 'daily' | 'weekly' | 'biweekly';
    enabled: boolean;
    notifyUserId: string;
  }
): Promise<QASchedule | null> {
  const nextRun = schedule.enabled ? calculateNextRun(schedule.frequency) : null;

  const { data } = await supabase
    .from('qa_schedules')
    .upsert(
      {
        card_id: schedule.cardId,
        url: schedule.url,
        frequency: schedule.frequency,
        enabled: schedule.enabled,
        next_run_at: nextRun,
        notify_user_id: schedule.notifyUserId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'card_id,url' }
    )
    .select()
    .single();

  return data as QASchedule | null;
}

export async function getDueSchedules(
  supabase: SupabaseClient
): Promise<QASchedule[]> {
  const { data } = await supabase
    .from('qa_schedules')
    .select('*')
    .eq('enabled', true)
    .lte('next_run_at', new Date().toISOString());

  return (data as QASchedule[]) ?? [];
}

export async function markScheduleRun(
  supabase: SupabaseClient,
  scheduleId: string,
  frequency: string
): Promise<void> {
  await supabase
    .from('qa_schedules')
    .update({
      last_run_at: new Date().toISOString(),
      next_run_at: calculateNextRun(frequency as 'daily' | 'weekly' | 'biweekly'),
      updated_at: new Date().toISOString(),
    })
    .eq('id', scheduleId);
}

export function calculateNextRun(frequency: 'daily' | 'weekly' | 'biweekly'): string {
  const now = new Date();
  switch (frequency) {
    case 'daily':
      now.setDate(now.getDate() + 1);
      break;
    case 'weekly':
      now.setDate(now.getDate() + 7);
      break;
    case 'biweekly':
      now.setDate(now.getDate() + 14);
      break;
  }
  now.setHours(6, 0, 0, 0); // Run at 6 AM
  return now.toISOString();
}
