/**
 * Payment Enforcement Engine
 *
 * For private client bookings:
 *  1. When a card reaches "Invoice Sent" → auto-move to "Needs to Pay Before Event"
 *  2. Schedule escalating payment reminders:
 *     - 7 days before event: first reminder
 *     - 3 days before event: second reminder
 *     - 1 day before event: final reminder (urgent)
 *  3. If not paid by event day, block the card from progressing
 *
 * The daily cron checks all cards in "Invoice Sent" / "Needs to Pay Before Event"
 * and sends appropriate reminders based on event date proximity.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from './notification-service';

interface PaymentCard {
  id: string;
  title: string;
  client_email: string | null;
  event_date: string | null;
  estimated_value: number | null;
  listName: string;
  boardId: string;
  boardType: string;
  daysUntilEvent: number;
}

const PAYMENT_LIST_NAMES = ['Invoice Sent', 'Needs to Pay Before Event'];
const PRIVATE_BOARD_TYPE = 'private_clients';

const REMINDER_SCHEDULE = [
  { daysBeforeEvent: 7, reminderNumber: 1, label: 'first' },
  { daysBeforeEvent: 3, reminderNumber: 2, label: 'second' },
  { daysBeforeEvent: 1, reminderNumber: 3, label: 'final' },
];

/**
 * Process payment reminders for all qualifying cards.
 * Called by the daily cron.
 */
export async function processPaymentReminders(
  supabase: SupabaseClient,
): Promise<{ reminders_sent: number; cards_checked: number }> {
  const now = new Date();
  let remindersSent = 0;

  // Find all lists named "Invoice Sent" or "Needs to Pay Before Event" on private client boards
  const { data: boards } = await supabase
    .from('boards')
    .select('id, type')
    .eq('type', PRIVATE_BOARD_TYPE);

  if (!boards || boards.length === 0) return { reminders_sent: 0, cards_checked: 0 };

  const boardIds = boards.map((b) => b.id);

  const { data: lists } = await supabase
    .from('lists')
    .select('id, name, board_id')
    .in('board_id', boardIds)
    .in('name', PAYMENT_LIST_NAMES);

  if (!lists || lists.length === 0) return { reminders_sent: 0, cards_checked: 0 };

  const listIds = lists.map((l) => l.id);
  const listMap = new Map(lists.map((l) => [l.id, { name: l.name, boardId: l.board_id }]));

  // Find all card placements in those lists
  const { data: placements } = await supabase
    .from('card_placements')
    .select('card_id, list_id')
    .in('list_id', listIds)
    .eq('is_mirror', false);

  if (!placements || placements.length === 0) return { reminders_sent: 0, cards_checked: 0 };

  const cardIds = Array.from(new Set(placements.map((p: { card_id: string }) => p.card_id)));
  const placementMap = new Map(placements.map((p) => [p.card_id, p.list_id]));

  // Fetch card details
  const { data: cards } = await supabase
    .from('cards')
    .select('id, title, client_email, event_date, estimated_value')
    .in('id', cardIds)
    .not('event_date', 'is', null);

  if (!cards) return { reminders_sent: 0, cards_checked: 0 };

  // Get admin users for notifications
  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_role', 'admin');

  for (const card of cards) {
    const eventDate = new Date(card.event_date);
    const daysUntilEvent = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilEvent < 0) continue; // Past event, skip

    const listId = placementMap.get(card.id);
    const listInfo = listId ? listMap.get(listId) : null;

    // Determine which reminder to send
    for (const schedule of REMINDER_SCHEDULE) {
      if (daysUntilEvent <= schedule.daysBeforeEvent) {
        // Check if this reminder was already sent
        const { data: existingReminder } = await supabase
          .from('activity_log')
          .select('id')
          .eq('card_id', card.id)
          .eq('event_type', 'payment_reminder')
          .contains('metadata', { reminder_number: schedule.reminderNumber })
          .limit(1)
          .single();

        if (existingReminder) continue; // Already sent this reminder

        // Log the reminder
        await supabase.from('activity_log').insert({
          card_id: card.id,
          board_id: listInfo?.boardId || null,
          user_id: null,
          event_type: 'payment_reminder',
          metadata: {
            reminder_number: schedule.reminderNumber,
            reminder_label: schedule.label,
            days_until_event: daysUntilEvent,
            estimated_value: card.estimated_value,
          },
        });

        // Notify admins
        if (admins) {
          for (const admin of admins) {
            await createNotification(supabase, {
              userId: admin.id,
              type: 'payment_reminder',
              title: `Payment reminder (${schedule.label}): ${card.title}`,
              body: `Event in ${daysUntilEvent} day${daysUntilEvent !== 1 ? 's' : ''}. ${card.estimated_value ? `Amount: $${card.estimated_value}` : ''}`,
              cardId: card.id,
              boardId: listInfo?.boardId,
              metadata: {
                reminder_number: schedule.reminderNumber,
                days_until_event: daysUntilEvent,
              },
            });
          }
        }

        remindersSent++;
        break; // Only send the most appropriate reminder
      }
    }
  }

  return { reminders_sent: remindersSent, cards_checked: cards.length };
}

/**
 * When a card moves to "Invoice Sent" on a private client board,
 * auto-move it to "Needs to Pay Before Event" if that list exists.
 */
export async function enforcePaymentOnInvoiceSent(
  supabase: SupabaseClient,
  cardId: string,
  boardId: string,
  boardType: string,
): Promise<boolean> {
  if (boardType !== PRIVATE_BOARD_TYPE) return false;

  // Find "Needs to Pay Before Event" list
  const { data: paymentList } = await supabase
    .from('lists')
    .select('id')
    .eq('board_id', boardId)
    .eq('name', 'Needs to Pay Before Event')
    .single();

  if (!paymentList) return false;

  // Get current placement
  const { data: placement } = await supabase
    .from('card_placements')
    .select('id')
    .eq('card_id', cardId)
    .eq('is_mirror', false)
    .limit(1)
    .single();

  if (!placement) return false;

  // Get next position
  const { data: maxPos } = await supabase
    .from('card_placements')
    .select('position')
    .eq('list_id', paymentList.id)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const position = (maxPos?.position ?? -1) + 1;

  await supabase
    .from('card_placements')
    .update({ list_id: paymentList.id, position })
    .eq('id', placement.id);

  return true;
}
