import { SupabaseClient } from '@supabase/supabase-js';
import type { CardWatcher } from './types';
import { createBulkNotifications } from './notification-service';

// ============================================================================
// CARD WATCHERS
// ============================================================================

/**
 * Get all watchers for a card, with profile info.
 */
export async function getWatchers(
  supabase: SupabaseClient,
  cardId: string
): Promise<CardWatcher[]> {
  const { data, error } = await supabase
    .from('card_watchers')
    .select('*, profile:profiles(id, display_name, avatar_url, role)')
    .eq('card_id', cardId);

  if (error) {
    console.error('[CardWatchers] Failed to get watchers:', error.message);
    return [];
  }

  return (data || []) as CardWatcher[];
}

/**
 * Add a watcher to a card.
 */
export async function addWatcher(
  supabase: SupabaseClient,
  cardId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase.from('card_watchers').insert({
    card_id: cardId,
    user_id: userId,
  });

  if (error) {
    console.error('[CardWatchers] Failed to add watcher:', error.message);
  }
}

/**
 * Remove a watcher from a card.
 */
export async function removeWatcher(
  supabase: SupabaseClient,
  cardId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('card_watchers')
    .delete()
    .eq('card_id', cardId)
    .eq('user_id', userId);

  if (error) {
    console.error('[CardWatchers] Failed to remove watcher:', error.message);
  }
}

/**
 * Check if a user is watching a card.
 */
export async function isWatching(
  supabase: SupabaseClient,
  cardId: string,
  userId: string
): Promise<boolean> {
  const { count } = await supabase
    .from('card_watchers')
    .select('*', { count: 'exact', head: true })
    .eq('card_id', cardId)
    .eq('user_id', userId);

  return (count || 0) > 0;
}

/**
 * Notify all watchers of a card about an event.
 * Optionally exclude a user (e.g. the actor who triggered the event).
 */
export async function notifyWatchers(
  supabase: SupabaseClient,
  cardId: string,
  eventTitle: string,
  eventBody?: string,
  excludeUserId?: string,
  boardId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const watchers = await getWatchers(supabase, cardId);

  if (watchers.length === 0) return;

  const userIds = watchers
    .map((w: CardWatcher) => w.user_id)
    .filter((id: string) => id !== excludeUserId);

  if (userIds.length === 0) return;

  await createBulkNotifications(supabase, userIds, {
    type: 'card_watched',
    title: eventTitle,
    body: eventBody,
    cardId,
    boardId,
    metadata,
  });
}
