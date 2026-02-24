/**
 * Cross-board mirroring engine.
 *
 * When a card moves to a list, evaluateMirrorRules() checks the mirror_rules
 * table for matching active rules. For each match, it creates (or confirms)
 * a card_placement with `is_mirror=true` on the target board/list.
 *
 * Key behaviours:
 *  - Idempotent: won't duplicate a mirror placement that already exists.
 *  - remove_from_source: optionally removes the source placement after mirroring.
 *  - Conditional: optional condition_field / condition_value filtering.
 *  - Bidirectional rules are evaluated from both sides (handled by two rows or
 *    by checking direction='bidirectional' and swapping source/target).
 */

import { SupabaseClient } from '@supabase/supabase-js';

interface MirrorRule {
  id: string;
  source_board_id: string;
  source_list_name: string;
  target_board_id: string;
  target_list_name: string;
  direction: string;
  condition_field: string | null;
  condition_value: string | null;
  remove_from_source: boolean;
  is_active: boolean;
}

/**
 * Evaluate mirror rules after a card moves to `toListName` on `boardId`.
 *
 * Call this in the background (non-blocking) from the card move route.
 */
export async function evaluateMirrorRules(
  supabase: SupabaseClient,
  cardId: string,
  boardId: string,
  toListName: string,
  userId: string,
  sourcePlacementId?: string,
): Promise<void> {
  // Find active rules where this board+list is the source
  const { data: forwardRules } = await supabase
    .from('mirror_rules')
    .select('*')
    .eq('source_board_id', boardId)
    .eq('source_list_name', toListName)
    .eq('is_active', true);

  // Also find bidirectional rules where this board+list is the TARGET
  // (i.e. rule was defined the other way but direction='bidirectional')
  const { data: reverseRules } = await supabase
    .from('mirror_rules')
    .select('*')
    .eq('target_board_id', boardId)
    .eq('target_list_name', toListName)
    .eq('direction', 'bidirectional')
    .eq('is_active', true);

  const allRules: { rule: MirrorRule; targetBoardId: string; targetListName: string }[] = [];

  for (const rule of (forwardRules || []) as MirrorRule[]) {
    allRules.push({ rule, targetBoardId: rule.target_board_id, targetListName: rule.target_list_name });
  }

  for (const rule of (reverseRules || []) as MirrorRule[]) {
    // Reverse: the source becomes the target
    allRules.push({ rule, targetBoardId: rule.source_board_id, targetListName: rule.source_list_name });
  }

  if (allRules.length === 0) return;

  // Fetch the card data for conditional checks
  const { data: card } = await supabase
    .from('cards')
    .select('*')
    .eq('id', cardId)
    .single();

  if (!card) return;

  for (const { rule, targetBoardId, targetListName } of allRules) {
    try {
      // Conditional check
      if (rule.condition_field && rule.condition_value) {
        const cardValue = (card as Record<string, unknown>)[rule.condition_field];
        if (String(cardValue ?? '') !== rule.condition_value) continue;
      }

      // Find the target list
      const { data: targetList } = await supabase
        .from('lists')
        .select('id')
        .eq('board_id', targetBoardId)
        .eq('name', targetListName)
        .single();

      if (!targetList) {
        console.warn(`[Mirror] Target list "${targetListName}" not found on board ${targetBoardId}`);
        continue;
      }

      // Check if a mirror placement already exists for this card on this list
      const { data: existing } = await supabase
        .from('card_placements')
        .select('id')
        .eq('card_id', cardId)
        .eq('list_id', targetList.id)
        .eq('is_mirror', true)
        .limit(1)
        .single();

      if (existing) continue; // Already mirrored

      // Get the next position in the target list
      const { data: maxPos } = await supabase
        .from('card_placements')
        .select('position')
        .eq('list_id', targetList.id)
        .order('position', { ascending: false })
        .limit(1)
        .single();

      const position = (maxPos?.position ?? -1) + 1;

      // Create the mirror placement
      await supabase
        .from('card_placements')
        .insert({
          card_id: cardId,
          list_id: targetList.id,
          position,
          is_mirror: true,
        });

      // Optionally remove the source placement
      if (rule.remove_from_source && sourcePlacementId) {
        await supabase
          .from('card_placements')
          .delete()
          .eq('id', sourcePlacementId);
      }

      // Log the mirroring action
      await supabase.from('activity_log').insert({
        card_id: cardId,
        board_id: boardId,
        user_id: userId,
        event_type: 'mirror_created',
        metadata: {
          rule_id: rule.id,
          target_board_id: targetBoardId,
          target_list_name: targetListName,
          remove_from_source: rule.remove_from_source,
        },
      });
    } catch (err) {
      console.error(`[Mirror] Rule ${rule.id} failed for card ${cardId}:`, err);
    }
  }
}

/**
 * Remove mirror placements for a card when it leaves a mirrored list.
 *
 * Call this when a card moves AWAY from a list that has mirror rules.
 * This cleans up stale mirrors so the card doesn't appear on the target
 * board after it's been moved out of the source list.
 */
export async function cleanupMirrorPlacements(
  supabase: SupabaseClient,
  cardId: string,
  boardId: string,
  fromListName: string,
): Promise<void> {
  // Find rules where this board+list was the source
  const { data: rules } = await supabase
    .from('mirror_rules')
    .select('target_board_id, target_list_name')
    .eq('source_board_id', boardId)
    .eq('source_list_name', fromListName)
    .eq('is_active', true);

  if (!rules || rules.length === 0) return;

  for (const rule of rules) {
    // Find the target list
    const { data: targetList } = await supabase
      .from('lists')
      .select('id')
      .eq('board_id', rule.target_board_id)
      .eq('name', rule.target_list_name)
      .single();

    if (!targetList) continue;

    // Remove the mirror placement
    await supabase
      .from('card_placements')
      .delete()
      .eq('card_id', cardId)
      .eq('list_id', targetList.id)
      .eq('is_mirror', true);
  }
}
