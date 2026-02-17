import { SupabaseClient } from '@supabase/supabase-js';
import type { CommentReaction } from './types';

// ============================================================================
// COMMENT REACTIONS
// ============================================================================

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '🚀', '👀', '💯'] as const;

/**
 * Get all reactions for a single comment, with profile info.
 */
export async function getReactions(
  supabase: SupabaseClient,
  commentId: string
): Promise<CommentReaction[]> {
  const { data, error } = await supabase
    .from('comment_reactions')
    .select('*, profile:profiles(id, display_name, avatar_url, role)')
    .eq('comment_id', commentId);

  if (error) {
    console.error('[CommentReactions] Failed to get reactions:', error.message);
    return [];
  }

  return (data || []) as CommentReaction[];
}

/**
 * Get reactions for multiple comments at once, grouped by comment ID.
 */
export async function getReactionsForComments(
  supabase: SupabaseClient,
  commentIds: string[]
): Promise<Record<string, CommentReaction[]>> {
  if (commentIds.length === 0) return {};

  const { data, error } = await supabase
    .from('comment_reactions')
    .select('*, profile:profiles(id, display_name, avatar_url, role)')
    .in('comment_id', commentIds);

  if (error) {
    console.error('[CommentReactions] Failed to get reactions for comments:', error.message);
    return {};
  }

  const grouped: Record<string, CommentReaction[]> = {};
  for (const reaction of (data || []) as CommentReaction[]) {
    if (!grouped[reaction.comment_id]) {
      grouped[reaction.comment_id] = [];
    }
    grouped[reaction.comment_id].push(reaction);
  }

  return grouped;
}

/**
 * Add a reaction to a comment (upserts on comment_id + user_id + emoji).
 */
export async function addReaction(
  supabase: SupabaseClient,
  commentId: string,
  userId: string,
  emoji: string
): Promise<void> {
  const { error } = await supabase
    .from('comment_reactions')
    .upsert(
      { comment_id: commentId, user_id: userId, emoji },
      { onConflict: 'comment_id,user_id,emoji' }
    );

  if (error) {
    console.error('[CommentReactions] Failed to add reaction:', error.message);
  }
}

/**
 * Remove a reaction from a comment.
 */
export async function removeReaction(
  supabase: SupabaseClient,
  commentId: string,
  userId: string,
  emoji: string
): Promise<void> {
  const { error } = await supabase
    .from('comment_reactions')
    .delete()
    .eq('comment_id', commentId)
    .eq('user_id', userId)
    .eq('emoji', emoji);

  if (error) {
    console.error('[CommentReactions] Failed to remove reaction:', error.message);
  }
}
