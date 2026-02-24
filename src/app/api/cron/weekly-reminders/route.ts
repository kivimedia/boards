import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createNotification, sendEmailNotification } from '@/lib/notification-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/weekly-reminders
 * Runs every 15 minutes. Finds weekly tasks with reminder_at <= now
 * that haven't been sent yet, and notifies the task owner.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const now = new Date().toISOString();

  // Find tasks with pending reminders
  const { data: tasks, error } = await supabase
    .from('client_weekly_tasks')
    .select(`
      id, title, reminder_at, owner_id,
      plan:client_weekly_plans!client_weekly_tasks_plan_id_fkey(
        id, client_id, week_start
      )
    `)
    .eq('completed', false)
    .eq('reminder_sent', false)
    .not('reminder_at', 'is', null)
    .not('owner_id', 'is', null)
    .lte('reminder_at', now)
    .limit(100);

  if (error) {
    console.error('[weekly-reminders] Query error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!tasks || tasks.length === 0) {
    return NextResponse.json({ data: { processed: 0 } });
  }

  let processed = 0;

  for (const task of tasks) {
    const ownerId = task.owner_id as string;

    // In-app notification
    await createNotification(supabase, {
      userId: ownerId,
      type: 'weekly_task_reminder',
      title: 'Task Reminder',
      body: `Reminder: "${task.title}"`,
      metadata: {
        task_id: task.id,
        plan_id: Array.isArray(task.plan) ? task.plan[0]?.id : (task.plan as { id: string } | null)?.id,
      },
    });

    // Email notification
    await sendEmailNotification(
      supabase,
      ownerId,
      'Task Reminder',
      `You have a reminder for: "${task.title}"`
    );

    // Mark reminder as sent
    await supabase
      .from('client_weekly_tasks')
      .update({ reminder_sent: true })
      .eq('id', task.id);

    processed++;
  }

  return NextResponse.json({ data: { processed } });
}
