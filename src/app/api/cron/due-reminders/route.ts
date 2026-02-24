import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createBulkNotifications, sendEmailNotification } from '@/lib/notification-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/due-reminders
 * Runs daily. Finds overdue and due-soon cards and notifies assignees.
 *
 * Notifications:
 *   - Overdue: cards with due_date < today
 *   - Due today: cards with due_date = today
 *   - Due tomorrow: cards with due_date = tomorrow
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

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  let notified = 0;
  let emailed = 0;

  // 1. Overdue cards (due_date < today, not null)
  const { data: overdueCards } = await supabase
    .from('cards')
    .select('id, title, due_date')
    .lt('due_date', todayStr)
    .not('due_date', 'is', null);

  // 2. Due today
  const { data: dueTodayCards } = await supabase
    .from('cards')
    .select('id, title, due_date')
    .gte('due_date', todayStr)
    .lt('due_date', tomorrowStr);

  // 3. Due tomorrow
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);
  const dayAfterStr = dayAfter.toISOString().split('T')[0];

  const { data: dueTomorrowCards } = await supabase
    .from('cards')
    .select('id, title, due_date')
    .gte('due_date', tomorrowStr)
    .lt('due_date', dayAfterStr);

  // Process each group
  const groups = [
    { cards: overdueCards || [], notifType: 'card_overdue' as const, titlePrefix: 'Overdue', reminderType: 'overdue' },
    { cards: dueTodayCards || [], notifType: 'card_due_soon' as const, titlePrefix: 'Due today', reminderType: 'due_today' },
    { cards: dueTomorrowCards || [], notifType: 'card_due_soon' as const, titlePrefix: 'Due tomorrow', reminderType: 'due_tomorrow' },
  ];

  for (const group of groups) {
    if (group.cards.length === 0) continue;

    // Get assignees for all cards in this group
    const cardIds = group.cards.map(c => c.id);
    const { data: assignees } = await supabase
      .from('card_assignees')
      .select('card_id, user_id')
      .in('card_id', cardIds);

    if (!assignees || assignees.length === 0) continue;

    // Group assignees by card
    const cardAssigneeMap = new Map<string, string[]>();
    for (const a of assignees) {
      const list = cardAssigneeMap.get(a.card_id) || [];
      list.push(a.user_id);
      cardAssigneeMap.set(a.card_id, list);
    }

    // Send notifications per card
    for (const card of group.cards) {
      const userIds = cardAssigneeMap.get(card.id);
      if (!userIds || userIds.length === 0) continue;

      const dueDate = card.due_date
        ? new Date(card.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : '';

      const title = `${group.titlePrefix}: ${card.title}`;
      const body = group.reminderType === 'overdue'
        ? `This card was due ${dueDate} and is now overdue.`
        : `This card is due ${dueDate}.`;

      await createBulkNotifications(supabase, userIds, {
        type: group.notifType,
        title,
        body,
        cardId: card.id,
        metadata: { reminder_type: group.reminderType },
      });
      notified += userIds.length;

      // Send email to each assignee (non-blocking)
      for (const uid of userIds) {
        sendEmailNotification(supabase, uid, title, body, card.id).catch(() => {});
        emailed++;
      }
    }
  }

  return NextResponse.json({
    message: 'Due reminders sent',
    overdue_cards: (overdueCards || []).length,
    due_today: (dueTodayCards || []).length,
    due_tomorrow: (dueTomorrowCards || []).length,
    notifications_created: notified,
    emails_queued: emailed,
  });
}
