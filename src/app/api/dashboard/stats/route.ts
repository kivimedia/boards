import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

const INQUIRY_LISTS = [
  'Website Inquiry',
  'DM/Text Inquiry',
  'Responded - Need More Info',
];

const FOLLOW_UP_LISTS = [
  'Needs Follow-Up',
];

const EVENTS_WEEK_LISTS = [
  'Event This Week',
  'Supplies/Prep Needed',
];

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  try {
    // Open leads: cards in inquiry lists
    const { data: inquiryLists } = await supabase
      .from('lists')
      .select('id')
      .in('name', INQUIRY_LISTS);

    let openLeads = 0;
    if (inquiryLists && inquiryLists.length > 0) {
      const { count } = await supabase
        .from('card_placements')
        .select('*', { count: 'exact', head: true })
        .in('list_id', inquiryLists.map((l: { id: string }) => l.id))
        .eq('is_mirror', false);
      openLeads = count || 0;
    }

    // Pending proposals
    const { count: pendingProposals } = await supabase
      .from('proposal_drafts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Events this week: cards in event-week lists
    const { data: eventLists } = await supabase
      .from('lists')
      .select('id')
      .in('name', EVENTS_WEEK_LISTS);

    let eventsThisWeek = 0;
    if (eventLists && eventLists.length > 0) {
      const { count } = await supabase
        .from('card_placements')
        .select('*', { count: 'exact', head: true })
        .in('list_id', eventLists.map((l: { id: string }) => l.id))
        .eq('is_mirror', false);
      eventsThisWeek = count || 0;
    }

    // Follow-ups due
    const { data: followUpLists } = await supabase
      .from('lists')
      .select('id')
      .in('name', FOLLOW_UP_LISTS);

    let followUpsDue = 0;
    if (followUpLists && followUpLists.length > 0) {
      const { count } = await supabase
        .from('card_placements')
        .select('*', { count: 'exact', head: true })
        .in('list_id', followUpLists.map((l: { id: string }) => l.id))
        .eq('is_mirror', false);
      followUpsDue = count || 0;
    }

    // Also count cards with overdue follow_up_date
    const { count: overdueFollowUps } = await supabase
      .from('cards')
      .select('*', { count: 'exact', head: true })
      .lt('follow_up_date', new Date().toISOString())
      .not('follow_up_date', 'is', null);
    followUpsDue += (overdueFollowUps || 0);

    // Venue count
    const { count: venueCount } = await supabase
      .from('venues')
      .select('*', { count: 'exact', head: true });

    // Revenue this month: sum estimated_value of cards in "Paid in Full" lists
    const { data: paidLists } = await supabase
      .from('lists')
      .select('id')
      .eq('name', 'Paid in Full');

    let revenueThisMonth = 0;
    if (paidLists && paidLists.length > 0) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: paidPlacements } = await supabase
        .from('card_placements')
        .select('card_id')
        .in('list_id', paidLists.map((l: { id: string }) => l.id))
        .eq('is_mirror', false);

      if (paidPlacements && paidPlacements.length > 0) {
        const { data: paidCards } = await supabase
          .from('cards')
          .select('estimated_value')
          .in('id', paidPlacements.map((p: { card_id: string }) => p.card_id))
          .gte('last_touched_at', startOfMonth.toISOString())
          .not('estimated_value', 'is', null);

        if (paidCards) {
          revenueThisMonth = paidCards.reduce(
            (sum: number, c: { estimated_value: number | null }) => sum + (c.estimated_value || 0),
            0
          );
        }
      }
    }

    return successResponse({
      openLeads,
      pendingProposals: pendingProposals || 0,
      eventsThisWeek,
      followUpsDue,
      venueCount: venueCount || 0,
      revenueThisMonth,
    });
  } catch (err) {
    console.error('[Dashboard] Stats error:', err);
    return errorResponse('Failed to fetch dashboard stats', 500);
  }
}
