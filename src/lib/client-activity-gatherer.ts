import { SupabaseClient } from '@supabase/supabase-js';

export interface ClientActivityCard {
  id: string;
  title: string;
  list_name: string;
  priority: string;
  due_date: string | null;
  status_changes: { from_list: string; to_list: string; changed_at: string }[];
  new_comments: { author: string; content: string; created_at: string }[];
  activity_entries: { event_type: string; metadata: Record<string, unknown>; created_at: string }[];
  was_created_this_period: boolean;
  was_completed_this_period: boolean;
}

export interface ClientActivityData {
  client: { id: string; name: string; company: string | null; contacts: { name: string; email: string }[] };
  period: { start: string; end: string };
  cards: ClientActivityCard[];
  summary_stats: {
    total_cards: number;
    cards_completed: number;
    cards_created: number;
    cards_in_progress: number;
    comments_added: number;
  };
}

const DONE_LIST_PATTERNS = ['done', 'complete', 'completed', 'delivered', 'finished', 'approved'];

function isDoneList(listName: string): boolean {
  const lower = listName.toLowerCase();
  return DONE_LIST_PATTERNS.some(p => lower.includes(p));
}

/**
 * Gather all activity for a client over the past N days.
 */
export async function gatherClientActivity(
  supabase: SupabaseClient,
  clientId: string,
  periodDays: number = 7
): Promise<ClientActivityData> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const periodStartISO = periodStart.toISOString();

  // 1. Fetch client record
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, company, contacts')
    .eq('id', clientId)
    .single();

  if (!client) throw new Error(`Client ${clientId} not found`);

  // 2. Fetch all cards for this client with current placement
  const { data: cards } = await supabase
    .from('cards')
    .select('id, title, priority, due_date, created_at')
    .eq('client_id', clientId);

  if (!cards || cards.length === 0) {
    return {
      client: {
        id: client.id,
        name: client.name,
        company: client.company,
        contacts: (client.contacts || []).map((c: any) => ({ name: c.name, email: c.email })),
      },
      period: { start: periodStartISO, end: periodEnd.toISOString() },
      cards: [],
      summary_stats: { total_cards: 0, cards_completed: 0, cards_created: 0, cards_in_progress: 0, comments_added: 0 },
    };
  }

  const cardIds = cards.map(c => c.id);

  // 3. Fetch current placements (for list names)
  const { data: placements } = await supabase
    .from('card_placements')
    .select('card_id, list:lists(name)')
    .in('card_id', cardIds);

  const cardListMap: Record<string, string> = {};
  for (const p of (placements || [])) {
    cardListMap[p.card_id] = (p as any).list?.name || 'Unknown';
  }

  // 4. Batch-fetch activity_log for the period
  const { data: activities } = await supabase
    .from('activity_log')
    .select('card_id, event_type, metadata, created_at')
    .in('card_id', cardIds)
    .gte('created_at', periodStartISO)
    .order('created_at', { ascending: false });

  // 5. Batch-fetch comments for the period
  const { data: comments } = await supabase
    .from('comments')
    .select('card_id, content, created_at, user:profiles(display_name)')
    .in('card_id', cardIds)
    .gte('created_at', periodStartISO)
    .order('created_at', { ascending: false });

  // Group by card
  const activityByCard: Record<string, typeof activities> = {};
  const commentsByCard: Record<string, typeof comments> = {};

  for (const a of (activities || [])) {
    if (!activityByCard[a.card_id]) activityByCard[a.card_id] = [];
    activityByCard[a.card_id]!.push(a);
  }
  for (const c of (comments || [])) {
    if (!commentsByCard[c.card_id]) commentsByCard[c.card_id] = [];
    commentsByCard[c.card_id]!.push(c);
  }

  // Build per-card data
  let cardsCompleted = 0;
  let cardsCreated = 0;
  let totalComments = 0;

  const activityCards: ClientActivityCard[] = cards.map(card => {
    const listName = cardListMap[card.id] || 'Unknown';
    const cardActivities = activityByCard[card.id] || [];
    const cardComments = commentsByCard[card.id] || [];

    // Extract status changes from activity_log
    const statusChanges = cardActivities
      .filter(a => a.event_type === 'card_moved')
      .map(a => ({
        from_list: (a.metadata as any)?.from_list || 'Unknown',
        to_list: (a.metadata as any)?.to_list || 'Unknown',
        changed_at: a.created_at,
      }));

    const wasCreatedThisPeriod = new Date(card.created_at) >= periodStart;
    const wasCompletedThisPeriod = isDoneList(listName) && statusChanges.some(sc => isDoneList(sc.to_list));

    if (wasCreatedThisPeriod) cardsCreated++;
    if (wasCompletedThisPeriod) cardsCompleted++;
    totalComments += cardComments.length;

    return {
      id: card.id,
      title: card.title,
      list_name: listName,
      priority: card.priority || 'none',
      due_date: card.due_date,
      status_changes: statusChanges,
      new_comments: cardComments.map(c => ({
        author: (c as any).user?.display_name || 'Unknown',
        content: c.content,
        created_at: c.created_at,
      })),
      activity_entries: cardActivities.map(a => ({
        event_type: a.event_type,
        metadata: a.metadata as Record<string, unknown>,
        created_at: a.created_at,
      })),
      was_created_this_period: wasCreatedThisPeriod,
      was_completed_this_period: wasCompletedThisPeriod,
    };
  });

  // Filter to only cards with activity in the period OR newly created
  const activeCards = activityCards.filter(c =>
    c.was_created_this_period ||
    c.new_comments.length > 0 ||
    c.activity_entries.length > 0 ||
    c.status_changes.length > 0
  );

  return {
    client: {
      id: client.id,
      name: client.name,
      company: client.company,
      contacts: (client.contacts || []).map((c: any) => ({ name: c.name, email: c.email })),
    },
    period: { start: periodStartISO, end: periodEnd.toISOString() },
    cards: activeCards.slice(0, 20), // Cap at 20 most active
    summary_stats: {
      total_cards: cards.length,
      cards_completed: cardsCompleted,
      cards_created: cardsCreated,
      cards_in_progress: cards.length - cardsCompleted,
      comments_added: totalComments,
    },
  };
}
