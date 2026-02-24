import { SupabaseClient } from '@supabase/supabase-js';

const BOOKING_STAGE_LISTS = [
  'Needs Invoice',
  'Invoice Sent',
  'Paid in Full',
  'Needs to Pay Before Event',
];

/**
 * When a card moves to a booking-stage list, check if the venue exists
 * in the venues table. If not, auto-create a venue record.
 */
export async function autoPopulateVenue(
  supabase: SupabaseClient,
  cardId: string,
  boardId: string,
  toListName: string,
  userId: string
): Promise<void> {
  if (!BOOKING_STAGE_LISTS.includes(toListName)) return;

  // Fetch the card's venue info
  const { data: card } = await supabase
    .from('cards')
    .select('venue_name, venue_city, client_email, title')
    .eq('id', cardId)
    .single();

  if (!card?.venue_name) return;

  const venueName = card.venue_name.trim();
  if (!venueName) return;

  // Check if venue already exists (case-insensitive match)
  const { data: existing } = await supabase
    .from('venues')
    .select('id')
    .ilike('name', venueName)
    .limit(1);

  if (existing && existing.length > 0) return;

  // Auto-create venue
  const { error } = await supabase.from('venues').insert({
    name: venueName,
    city: card.venue_city || null,
    state: 'NC',
    source: 'auto_from_card',
    relationship_status: 'new',
    created_by: userId,
  });

  if (error) {
    console.error('[AutoVenue] Failed to create venue:', error.message);
    return;
  }

  // Log activity
  await supabase.from('activity_log').insert({
    card_id: cardId,
    board_id: boardId,
    user_id: userId,
    event_type: 'venue_auto_created',
    metadata: { venue_name: venueName, venue_city: card.venue_city },
  });
}
