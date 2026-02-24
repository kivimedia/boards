/**
 * Follow-Up Management Engine
 *
 * Tracks leads that need follow-up based on:
 *  - Explicit follow_up_date set on the card
 *  - Cards in "Needs Follow-Up" list
 *  - Cards in inquiry lists with no activity for X days
 *
 * The daily cron scans for overdue follow-ups and:
 *  1. Surfaces them via notifications
 *  2. Generates draft follow-up emails
 *  3. Moves stale cards to "Needs Follow-Up" list
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from './notification-service';

interface FollowUp {
  cardId: string;
  cardTitle: string;
  clientEmail: string | null;
  eventType: string | null;
  eventDate: string | null;
  followUpDate: string | null;
  lastTouchedAt: string | null;
  daysOverdue: number;
  listName: string;
  boardId: string;
  reason: 'explicit_date' | 'stale_inquiry' | 'needs_follow_up_list';
}

const INQUIRY_LIST_NAMES = [
  'Website Inquiry',
  'DM/Text Inquiry',
  'Responded - Need More Info',
  'Proposal/Pricing Sent',
];

const STALE_DAYS = 3; // Cards untouched for 3 days need follow-up

/**
 * Get all upcoming/overdue follow-ups across all boards.
 */
export async function getUpcomingFollowUps(
  supabase: SupabaseClient,
  options?: { daysAhead?: number; boardId?: string },
): Promise<FollowUp[]> {
  const daysAhead = options?.daysAhead ?? 1;
  const now = new Date();
  const cutoffDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const followUps: FollowUp[] = [];

  // 1. Cards with explicit follow_up_date
  let dateQuery = supabase
    .from('cards')
    .select('id, title, client_email, event_type, event_date, follow_up_date, last_touched_at')
    .not('follow_up_date', 'is', null)
    .lte('follow_up_date', cutoffDate.toISOString());

  const { data: dateCards } = await dateQuery;

  if (dateCards) {
    for (const card of dateCards) {
      const placement = await getCardPlacement(supabase, card.id, options?.boardId);
      if (!placement) continue;

      const followUpDate = new Date(card.follow_up_date);
      const daysOverdue = Math.ceil((now.getTime() - followUpDate.getTime()) / (1000 * 60 * 60 * 24));

      followUps.push({
        cardId: card.id,
        cardTitle: card.title,
        clientEmail: card.client_email,
        eventType: card.event_type,
        eventDate: card.event_date,
        followUpDate: card.follow_up_date,
        lastTouchedAt: card.last_touched_at,
        daysOverdue: Math.max(0, daysOverdue),
        listName: placement.listName,
        boardId: placement.boardId,
        reason: 'explicit_date',
      });
    }
  }

  // 2. Stale cards in inquiry lists
  const { data: lists } = await supabase
    .from('lists')
    .select('id, name, board_id')
    .in('name', INQUIRY_LIST_NAMES);

  if (lists) {
    const listIds = lists.map((l) => l.id);
    const listMap = new Map(lists.map((l) => [l.id, { name: l.name, boardId: l.board_id }]));

    const staleCutoff = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);

    const { data: placements } = await supabase
      .from('card_placements')
      .select('card_id, list_id')
      .in('list_id', listIds)
      .eq('is_mirror', false);

    if (placements) {
      const cardIds = Array.from(new Set(placements.map((p: { card_id: string }) => p.card_id)));
      const placementMap = new Map(placements.map((p) => [p.card_id, p.list_id]));

      // Only check cards not already in followUps
      const existingIds = new Set(followUps.map((f) => f.cardId));
      const toCheck = cardIds.filter((id) => !existingIds.has(id));

      if (toCheck.length > 0) {
        const { data: staleCards } = await supabase
          .from('cards')
          .select('id, title, client_email, event_type, event_date, follow_up_date, last_touched_at')
          .in('id', toCheck)
          .or(`last_touched_at.is.null,last_touched_at.lte.${staleCutoff.toISOString()}`);

        if (staleCards) {
          for (const card of staleCards) {
            const listId = placementMap.get(card.id);
            const listInfo = listId ? listMap.get(listId) : null;
            if (!listInfo) continue;

            if (options?.boardId && listInfo.boardId !== options.boardId) continue;

            const lastTouch = card.last_touched_at ? new Date(card.last_touched_at) : null;
            const daysStale = lastTouch
              ? Math.ceil((now.getTime() - lastTouch.getTime()) / (1000 * 60 * 60 * 24))
              : STALE_DAYS + 1;

            followUps.push({
              cardId: card.id,
              cardTitle: card.title,
              clientEmail: card.client_email,
              eventType: card.event_type,
              eventDate: card.event_date,
              followUpDate: card.follow_up_date,
              lastTouchedAt: card.last_touched_at,
              daysOverdue: daysStale - STALE_DAYS,
              listName: listInfo.name,
              boardId: listInfo.boardId,
              reason: 'stale_inquiry',
            });
          }
        }
      }
    }
  }

  // Sort by urgency (most overdue first)
  followUps.sort((a, b) => b.daysOverdue - a.daysOverdue);

  return followUps;
}

/**
 * Schedule a follow-up for a card.
 */
export async function scheduleFollowUp(
  supabase: SupabaseClient,
  cardId: string,
  followUpDate: string,
  userId: string,
): Promise<void> {
  await supabase
    .from('cards')
    .update({
      follow_up_date: followUpDate,
      last_touched_at: new Date().toISOString(),
      last_touched_by: userId,
    })
    .eq('id', cardId);
}

/**
 * Process overdue follow-ups: send notifications to admins.
 * Called by the daily cron.
 */
export async function processOverdueFollowUps(
  supabase: SupabaseClient,
): Promise<{ notified: number; total: number }> {
  const followUps = await getUpcomingFollowUps(supabase, { daysAhead: 0 });

  if (followUps.length === 0) return { notified: 0, total: 0 };

  // Get admin users to notify
  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_role', 'admin');

  if (!admins || admins.length === 0) return { notified: 0, total: followUps.length };

  let notified = 0;

  for (const fu of followUps) {
    for (const admin of admins) {
      await createNotification(supabase, {
        userId: admin.id,
        type: 'follow_up_due',
        title: `Follow-up due: ${fu.cardTitle}`,
        body: fu.daysOverdue > 0
          ? `${fu.daysOverdue} day${fu.daysOverdue > 1 ? 's' : ''} overdue (${fu.reason.replace(/_/g, ' ')})`
          : `Follow-up due today`,
        cardId: fu.cardId,
        boardId: fu.boardId,
        metadata: {
          reason: fu.reason,
          days_overdue: fu.daysOverdue,
          client_email: fu.clientEmail,
        },
      });
    }
    notified++;
  }

  return { notified, total: followUps.length };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getCardPlacement(
  supabase: SupabaseClient,
  cardId: string,
  boardIdFilter?: string,
): Promise<{ listName: string; boardId: string } | null> {
  const { data } = await supabase
    .from('card_placements')
    .select('list_id, lists(name, board_id)')
    .eq('card_id', cardId)
    .eq('is_mirror', false)
    .limit(1)
    .single();

  if (!data) return null;

  const listInfo = data.lists as unknown as { name: string; board_id: string };
  if (!listInfo) return null;

  if (boardIdFilter && listInfo.board_id !== boardIdFilter) return null;

  return { listName: listInfo.name, boardId: listInfo.board_id };
}
