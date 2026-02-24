import { SupabaseClient } from '@supabase/supabase-js';
import type {
  WeeklyPlan,
  WeeklyTask,
  WeeklyPlanWithTasks,
  WeeklyPlanSnapshot,
  SnapshotReason,
} from './types';

// ============================================================================
// HELPERS
// ============================================================================

/** Get Monday of the week containing `date` (ISO string yyyy-mm-dd). */
export function getMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon ...
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

/** Day labels for the week grid. */
export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Get full date string for a given day index (1–7) within a week starting on `weekStart`. */
export function dayDate(weekStart: string, dayIndex: number): string {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + (dayIndex - 1));
  return d.toISOString().split('T')[0];
}

// ============================================================================
// PLANS
// ============================================================================

export async function getPlans(
  supabase: SupabaseClient,
  clientId: string,
  limit = 20
): Promise<WeeklyPlan[]> {
  const { data, error } = await supabase
    .from('client_weekly_plans')
    .select('*')
    .eq('client_id', clientId)
    .order('week_start', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as WeeklyPlan[];
}

export async function getPlanWithTasks(
  supabase: SupabaseClient,
  planId: string
): Promise<WeeklyPlanWithTasks | null> {
  const { data: plan, error } = await supabase
    .from('client_weekly_plans')
    .select('*')
    .eq('id', planId)
    .single();

  if (error || !plan) return null;

  const { data: tasks } = await supabase
    .from('client_weekly_tasks')
    .select('*, owner:profiles!client_weekly_tasks_owner_id_fkey(id, display_name, avatar_url)')
    .eq('plan_id', planId)
    .order('sort_order', { ascending: true });

  return {
    ...(plan as WeeklyPlan),
    tasks: (tasks ?? []).map((t) => ({
      ...t,
      owner: t.owner ?? undefined,
    })) as WeeklyTask[],
  };
}

export async function getOrCreatePlan(
  supabase: SupabaseClient,
  clientId: string,
  weekStart: string,
  userId: string
): Promise<WeeklyPlan> {
  // Try to get existing plan
  const { data: existing } = await supabase
    .from('client_weekly_plans')
    .select('*')
    .eq('client_id', clientId)
    .eq('week_start', weekStart)
    .single();

  if (existing) return existing as WeeklyPlan;

  // Create new plan
  const { data: plan, error } = await supabase
    .from('client_weekly_plans')
    .insert({
      client_id: clientId,
      week_start: weekStart,
      status: 'active',
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return plan as WeeklyPlan;
}

export async function updatePlanStatus(
  supabase: SupabaseClient,
  planId: string,
  status: string
): Promise<void> {
  const { error } = await supabase
    .from('client_weekly_plans')
    .update({ status })
    .eq('id', planId);

  if (error) throw new Error(error.message);
}

// ============================================================================
// TASKS
// ============================================================================

export async function createTask(
  supabase: SupabaseClient,
  planId: string,
  task: {
    title: string;
    description?: string;
    owner_id?: string;
    day_start?: number;
    day_end?: number;
    priority?: string;
  }
): Promise<WeeklyTask> {
  // Get max sort_order
  const { data: maxRow } = await supabase
    .from('client_weekly_tasks')
    .select('sort_order')
    .eq('plan_id', planId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();

  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from('client_weekly_tasks')
    .insert({
      plan_id: planId,
      title: task.title,
      description: task.description || null,
      owner_id: task.owner_id || null,
      day_start: task.day_start ?? 1,
      day_end: task.day_end ?? 1,
      priority: task.priority ?? 'medium',
      sort_order: nextOrder,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as WeeklyTask;
}

export async function updateTask(
  supabase: SupabaseClient,
  taskId: string,
  updates: Partial<{
    title: string;
    description: string | null;
    owner_id: string | null;
    day_start: number;
    day_end: number;
    completed: boolean;
    sort_order: number;
    priority: string;
    reminder_at: string | null;
    reminder_sent: boolean;
  }>
): Promise<WeeklyTask> {
  // Auto-set completed_at
  const patch: Record<string, unknown> = { ...updates };
  if (updates.completed === true) {
    patch.completed_at = new Date().toISOString();
  } else if (updates.completed === false) {
    patch.completed_at = null;
  }

  const { data, error } = await supabase
    .from('client_weekly_tasks')
    .update(patch)
    .eq('id', taskId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as WeeklyTask;
}

export async function deleteTask(
  supabase: SupabaseClient,
  taskId: string
): Promise<void> {
  const { error } = await supabase
    .from('client_weekly_tasks')
    .delete()
    .eq('id', taskId);

  if (error) throw new Error(error.message);
}

export async function reorderTasks(
  supabase: SupabaseClient,
  planId: string,
  taskIds: string[]
): Promise<void> {
  // Update sort_order for each task
  for (let i = 0; i < taskIds.length; i++) {
    await supabase
      .from('client_weekly_tasks')
      .update({ sort_order: i })
      .eq('id', taskIds[i])
      .eq('plan_id', planId);
  }
}

// ============================================================================
// COPY FROM LAST WEEK
// ============================================================================

export async function copyFromPlan(
  supabase: SupabaseClient,
  sourcePlanId: string,
  targetPlanId: string,
  mode: 'incomplete_only' | 'all' = 'incomplete_only'
): Promise<WeeklyTask[]> {
  // Snapshot source before copy
  await createSnapshot(supabase, sourcePlanId, 'before_copy', null);

  // Get source tasks
  const { data: sourceTasks } = await supabase
    .from('client_weekly_tasks')
    .select('*')
    .eq('plan_id', sourcePlanId)
    .order('sort_order', { ascending: true });

  if (!sourceTasks || sourceTasks.length === 0) return [];

  const tasksToInsert = (mode === 'incomplete_only'
    ? sourceTasks.filter((t) => !t.completed)
    : sourceTasks
  ).map((t, i) => ({
    plan_id: targetPlanId,
    title: t.title,
    description: t.description,
    owner_id: t.owner_id,
    day_start: t.day_start,
    day_end: t.day_end,
    completed: false,
    priority: t.priority,
    sort_order: i,
  }));

  if (tasksToInsert.length === 0) return [];

  const { data, error } = await supabase
    .from('client_weekly_tasks')
    .insert(tasksToInsert)
    .select();

  if (error) throw new Error(error.message);

  // Mark source plan as archived
  await supabase
    .from('client_weekly_plans')
    .update({ status: 'archived' })
    .eq('id', sourcePlanId);

  return (data ?? []) as WeeklyTask[];
}

// ============================================================================
// SNAPSHOTS
// ============================================================================

export async function createSnapshot(
  supabase: SupabaseClient,
  planId: string,
  reason: SnapshotReason,
  userId: string | null
): Promise<WeeklyPlanSnapshot> {
  // Freeze current tasks
  const { data: tasks } = await supabase
    .from('client_weekly_tasks')
    .select('*')
    .eq('plan_id', planId)
    .order('sort_order', { ascending: true });

  const { data, error } = await supabase
    .from('weekly_plan_snapshots')
    .insert({
      plan_id: planId,
      snapshot_data: tasks ?? [],
      snapshot_reason: reason,
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as WeeklyPlanSnapshot;
}

export async function getSnapshots(
  supabase: SupabaseClient,
  planId: string
): Promise<WeeklyPlanSnapshot[]> {
  const { data, error } = await supabase
    .from('weekly_plan_snapshots')
    .select('*')
    .eq('plan_id', planId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as WeeklyPlanSnapshot[];
}

// ============================================================================
// WEEKLY EMAIL
// ============================================================================

export function buildWeeklyEmailHtml(
  clientName: string,
  weekStart: string,
  tasks: WeeklyTask[],
  siteUrl: string
): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekLabel = `${formatDate(weekStart)} – ${formatDate(weekEnd.toISOString().split('T')[0])}`;

  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;

  const taskRows = tasks
    .map((t) => {
      const status = t.completed
        ? '<span style="color: #22c55e; font-weight: 600;">Done</span>'
        : '<span style="color: #f59e0b; font-weight: 600;">In progress</span>';
      const dayRange = t.day_start === t.day_end
        ? DAY_LABELS[t.day_start - 1]
        : `${DAY_LABELS[t.day_start - 1]}–${DAY_LABELS[t.day_end - 1]}`;
      const titleStyle = t.completed ? 'text-decoration: line-through; color: #9ca3af;' : 'color: #1f2937;';

      return `
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 10px 12px; ${titleStyle} font-size: 14px;">${t.title}</td>
          <td style="padding: 10px 8px; font-size: 13px; color: #6b7280; text-align: center;">${dayRange}</td>
          <td style="padding: 10px 8px; font-size: 13px; text-align: center;">${status}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px 0;">
      <div style="background: #1a1f36; border-radius: 12px; padding: 16px 20px; margin-bottom: 20px;">
        <h1 style="color: #fff; font-size: 16px; margin: 0;">KM Boards — Weekly Plan</h1>
      </div>

      <p style="color: #333; font-size: 15px; font-weight: 600; margin-bottom: 4px;">
        ${clientName}
      </p>
      <p style="color: #6b7280; font-size: 13px; margin-bottom: 16px;">
        ${weekLabel} &middot; ${completedCount}/${totalCount} completed
      </p>

      <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #6b7280; font-weight: 600;">Task</th>
            <th style="padding: 8px; text-align: center; font-size: 12px; color: #6b7280; font-weight: 600; width: 80px;">Days</th>
            <th style="padding: 8px; text-align: center; font-size: 12px; color: #6b7280; font-weight: 600; width: 90px;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${taskRows}
        </tbody>
      </table>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${siteUrl}" style="display: inline-block; background: #4F6BFF; color: #fff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; font-size: 13px;">View in KM Boards</a>
      </div>

      <p style="color: #999; font-size: 11px; text-align: center;">
        Sent by KM Boards weekly planner
      </p>
    </div>
  `;
}

export async function sendWeeklyEmail(
  supabase: SupabaseClient,
  planId: string,
  clientName: string,
  recipients: string[],
  tasks: WeeklyTask[],
  weekStart: string
): Promise<{ success: boolean; error?: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { success: false, error: 'RESEND_API_KEY not configured' };
  if (recipients.length === 0) return { success: false, error: 'No recipients' };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://kmboards.co';
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@dailycookie.co';
  const subject = `Weekly Plan — ${clientName} — ${formatDate(weekStart)}`;

  const html = buildWeeklyEmailHtml(clientName, weekStart, tasks, siteUrl);

  try {
    // Snapshot before email
    await createSnapshot(supabase, planId, 'before_email', null);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipients,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: `Resend error: ${err}` };
    }

    const result = await res.json();

    // Log the email
    await supabase.from('weekly_plan_email_log').insert({
      plan_id: planId,
      sent_to: recipients,
      subject,
      resend_message_id: result.id || null,
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ============================================================================
// PRINT HTML (server-rendered for PDF or print)
// ============================================================================

export function buildPrintHtml(
  clientName: string,
  weekStart: string,
  tasks: WeeklyTask[],
  teamMembers: { id: string; display_name: string }[]
): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekLabel = `${formatDate(weekStart)} – ${formatDate(weekEnd.toISOString().split('T')[0])}`;

  const ownerMap = new Map(teamMembers.map((m) => [m.id, m.display_name]));

  const taskRows = tasks
    .map((t) => {
      const owner = t.owner_id ? (ownerMap.get(t.owner_id) ?? '—') : '—';
      const dayCells = [1, 2, 3, 4, 5, 6, 7]
        .map((d) => {
          const inRange = d >= t.day_start && d <= t.day_end;
          const bg = inRange
            ? t.completed ? '#dcfce7' : (t.priority === 'high' ? '#fef3c7' : '#dbeafe')
            : 'transparent';
          return `<td style="width: 60px; text-align: center; padding: 6px; background: ${bg}; border: 1px solid #e5e7eb;">${inRange ? (t.completed ? '&#10003;' : '&bull;') : ''}</td>`;
        })
        .join('');

      const titleStyle = t.completed ? 'text-decoration: line-through; color: #9ca3af;' : '';

      return `
        <tr>
          <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 13px; ${titleStyle}">${t.title}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">${owner}</td>
          ${dayCells}
        </tr>
      `;
    })
    .join('');

  const dayHeaders = DAY_LABELS.map(
    (d) =>
      `<th style="padding: 6px; text-align: center; font-size: 11px; color: #6b7280; border: 1px solid #e5e7eb; width: 60px;">${d}</th>`
  ).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @media print {
          body { margin: 0; padding: 16px; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; }
        }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      </style>
    </head>
    <body>
      <h2 style="margin: 0 0 4px;">${clientName}</h2>
      <p style="color: #6b7280; font-size: 13px; margin: 0 0 16px;">${weekLabel}</p>

      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 8px; text-align: left; font-size: 12px; color: #6b7280; border: 1px solid #e5e7eb; min-width: 180px;">Task</th>
            <th style="padding: 8px; text-align: left; font-size: 12px; color: #6b7280; border: 1px solid #e5e7eb; width: 100px;">Owner</th>
            ${dayHeaders}
          </tr>
        </thead>
        <tbody>
          ${taskRows}
        </tbody>
      </table>

      <p style="margin-top: 16px; font-size: 11px; color: #9ca3af;">
        Generated by KM Boards
      </p>
    </body>
    </html>
  `;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
