import { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// BULK OPERATIONS (v5.3.0)
// ============================================================================

/**
 * Move multiple cards to a target list by updating their primary placement.
 * Each card's primary placement (is_mirror=false) is updated to the new list_id.
 */
export async function bulkMoveCards(
  supabase: SupabaseClient,
  cardIds: string[],
  targetListId: string
): Promise<{ moved: number; errors: string[] }> {
  let moved = 0;
  const errors: string[] = [];

  for (const cardId of cardIds) {
    const { error } = await supabase
      .from('card_placements')
      .update({ list_id: targetListId })
      .eq('card_id', cardId)
      .eq('is_mirror', false);

    if (error) {
      errors.push(`Failed to move card ${cardId}: ${error.message}`);
    } else {
      moved++;
    }
  }

  return { moved, errors };
}

/**
 * Assign a user to multiple cards by upserting into card_assignees.
 */
export async function bulkAssign(
  supabase: SupabaseClient,
  cardIds: string[],
  userId: string
): Promise<{ assigned: number; errors: string[] }> {
  let assigned = 0;
  const errors: string[] = [];

  for (const cardId of cardIds) {
    const { error } = await supabase
      .from('card_assignees')
      .upsert(
        { card_id: cardId, user_id: userId },
        { onConflict: 'card_id,user_id' }
      );

    if (error) {
      errors.push(`Failed to assign user to card ${cardId}: ${error.message}`);
    } else {
      assigned++;
    }
  }

  return { assigned, errors };
}

/**
 * Add a label to multiple cards by upserting into card_labels.
 */
export async function bulkAddLabel(
  supabase: SupabaseClient,
  cardIds: string[],
  labelId: string
): Promise<{ labeled: number; errors: string[] }> {
  let labeled = 0;
  const errors: string[] = [];

  for (const cardId of cardIds) {
    const { error } = await supabase
      .from('card_labels')
      .upsert(
        { card_id: cardId, label_id: labelId },
        { onConflict: 'card_id,label_id' }
      );

    if (error) {
      errors.push(`Failed to add label to card ${cardId}: ${error.message}`);
    } else {
      labeled++;
    }
  }

  return { labeled, errors };
}

/**
 * Delete multiple cards and all their related data.
 * For each card, removes: card_placements, card_labels, card_assignees,
 * comments, and finally the card itself.
 */
export async function bulkDelete(
  supabase: SupabaseClient,
  cardIds: string[]
): Promise<{ deleted: number; errors: string[] }> {
  let deleted = 0;
  const errors: string[] = [];

  for (const cardId of cardIds) {
    try {
      const { error: placementsError } = await supabase
        .from('card_placements')
        .delete()
        .eq('card_id', cardId);

      if (placementsError) {
        errors.push(`Failed to delete placements for card ${cardId}: ${placementsError.message}`);
        continue;
      }

      const { error: labelsError } = await supabase
        .from('card_labels')
        .delete()
        .eq('card_id', cardId);

      if (labelsError) {
        errors.push(`Failed to delete labels for card ${cardId}: ${labelsError.message}`);
        continue;
      }

      const { error: assigneesError } = await supabase
        .from('card_assignees')
        .delete()
        .eq('card_id', cardId);

      if (assigneesError) {
        errors.push(`Failed to delete assignees for card ${cardId}: ${assigneesError.message}`);
        continue;
      }

      const { error: commentsError } = await supabase
        .from('comments')
        .delete()
        .eq('card_id', cardId);

      if (commentsError) {
        errors.push(`Failed to delete comments for card ${cardId}: ${commentsError.message}`);
        continue;
      }

      const { error: cardError } = await supabase
        .from('cards')
        .delete()
        .eq('id', cardId);

      if (cardError) {
        errors.push(`Failed to delete card ${cardId}: ${cardError.message}`);
        continue;
      }

      deleted++;
    } catch (err) {
      errors.push(`Unexpected error deleting card ${cardId}: ${String(err)}`);
    }
  }

  return { deleted, errors };
}

/**
 * Archive multiple cards: set is_archived=true and remove all placements.
 */
export async function bulkArchive(
  supabase: SupabaseClient,
  cardIds: string[]
): Promise<{ archived: number; errors: string[] }> {
  let archived = 0;
  const errors: string[] = [];

  for (const cardId of cardIds) {
    const { error: cardErr } = await supabase
      .from('cards')
      .update({ is_archived: true })
      .eq('id', cardId);

    if (cardErr) {
      errors.push(`Failed to archive card ${cardId}: ${cardErr.message}`);
      continue;
    }

    const { error: placementErr } = await supabase
      .from('card_placements')
      .delete()
      .eq('card_id', cardId);

    if (placementErr) {
      errors.push(`Failed to remove placements for card ${cardId}: ${placementErr.message}`);
    } else {
      archived++;
    }
  }

  return { archived, errors };
}

/**
 * Set the priority on multiple cards at once.
 */
export async function bulkSetPriority(
  supabase: SupabaseClient,
  cardIds: string[],
  priority: string
): Promise<{ updated: number; errors: string[] }> {
  let updated = 0;
  const errors: string[] = [];

  for (const cardId of cardIds) {
    const { error } = await supabase
      .from('cards')
      .update({ priority })
      .eq('id', cardId);

    if (error) {
      errors.push(`Failed to set priority on card ${cardId}: ${error.message}`);
    } else {
      updated++;
    }
  }

  return { updated, errors };
}
