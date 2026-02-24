import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const url = new URL(request.url);

  const startDate = url.searchParams.get('start') || null;
  const endDate = url.searchParams.get('end') || null;

  // Find all "Didn't Book" lists
  const { data: lists } = await supabase
    .from('lists')
    .select('id, board_id')
    .eq('name', "Didn't Book");

  if (!lists || lists.length === 0) {
    return successResponse({
      total: 0,
      by_reason: {},
      by_sub_reason: {},
      by_source: {},
      by_event_type: {},
      estimated_revenue_lost: 0,
      cards: [],
    });
  }

  const listIds = lists.map((l) => l.id);

  // Get placements in those lists
  const { data: placements } = await supabase
    .from('card_placements')
    .select('card_id')
    .in('list_id', listIds)
    .eq('is_mirror', false);

  if (!placements || placements.length === 0) {
    return successResponse({
      total: 0,
      by_reason: {},
      by_sub_reason: {},
      by_source: {},
      by_event_type: {},
      estimated_revenue_lost: 0,
      cards: [],
    });
  }

  const cardIds = Array.from(new Set(placements.map((p: { card_id: string }) => p.card_id)));

  // Fetch card details
  let query = supabase
    .from('cards')
    .select('id, title, didnt_book_reason, didnt_book_sub_reason, lead_source, event_type, event_date, estimated_value, created_at')
    .in('id', cardIds);

  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);

  const { data: cards, error } = await query;

  if (error) return errorResponse(error.message, 500);
  if (!cards) return successResponse({ total: 0, by_reason: {}, by_sub_reason: {}, by_source: {}, by_event_type: {}, estimated_revenue_lost: 0, cards: [] });

  // Aggregate
  const byReason: Record<string, number> = {};
  const bySubReason: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byEventType: Record<string, number> = {};
  let estimatedRevenueLost = 0;

  for (const card of cards) {
    const reason = card.didnt_book_reason || 'Unknown';
    byReason[reason] = (byReason[reason] || 0) + 1;

    if (card.didnt_book_sub_reason) {
      bySubReason[card.didnt_book_sub_reason] = (bySubReason[card.didnt_book_sub_reason] || 0) + 1;
    }

    const source = card.lead_source || 'Unknown';
    bySource[source] = (bySource[source] || 0) + 1;

    const eventType = card.event_type || 'Unknown';
    byEventType[eventType] = (byEventType[eventType] || 0) + 1;

    if (card.estimated_value) {
      estimatedRevenueLost += card.estimated_value;
    }
  }

  return successResponse({
    total: cards.length,
    by_reason: byReason,
    by_sub_reason: bySubReason,
    by_source: bySource,
    by_event_type: byEventType,
    estimated_revenue_lost: estimatedRevenueLost,
    cards: cards.map((c) => ({
      id: c.id,
      title: c.title,
      reason: c.didnt_book_reason,
      sub_reason: c.didnt_book_sub_reason,
      source: c.lead_source,
      event_type: c.event_type,
      event_date: c.event_date,
      estimated_value: c.estimated_value,
    })),
  });
}
