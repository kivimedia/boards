import { SupabaseClient } from '@supabase/supabase-js';

/**
 * PostgreSQL int4 max is 2147483647.
 * Positions near the max cause "value is out of range for type integer" errors.
 * This threshold gives a small safety margin.
 */
const INT4_SAFE_THRESHOLD = 2147483640;

/**
 * Safely compute the next position for a card in a list.
 *
 * If the current max position is approaching the int4 overflow limit, all cards
 * in the list are renumbered sequentially (0, 1, 2, …) before returning the
 * next value, preventing the PostgreSQL int4 overflow error.
 *
 * @param supabase - Supabase client (server or browser)
 * @param listId   - The list whose card_placements we operate on
 * @returns The safe next position integer
 */
export async function safeNextPosition(
  supabase: SupabaseClient,
  listId: string
): Promise<number> {
  const { data: maxRow } = await supabase
    .from('card_placements')
    .select('position')
    .eq('list_id', listId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const maxPos: number = maxRow?.position ?? -1;

  if (maxPos >= INT4_SAFE_THRESHOLD) {
    // Renumber all cards in the list sequentially to reclaim position space
    const { data: placements } = await supabase
      .from('card_placements')
      .select('id')
      .eq('list_id', listId)
      .order('position', { ascending: true });

    if (placements && placements.length > 0) {
      await Promise.all(
        placements.map((p: { id: string }, i: number) =>
          supabase
            .from('card_placements')
            .update({ position: i })
            .eq('id', p.id)
        )
      );
      return placements.length; // next position after renumbering
    }
    return 0;
  }

  return maxPos + 1;
}
