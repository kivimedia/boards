import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { canAccessBoardByRole } from '@/lib/permissions';
import { getProductivitySnapshots, aggregateSnapshots } from '@/lib/productivity-analytics';
import type { ExecutiveDashboardResponse, UpcomingMeeting, StuckCard, RedFlags, ThroughputData } from '@/lib/types';

export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const url = new URL(request.url);
  const stuckDays = parseInt(url.searchParams.get('stuck_days') || '5', 10);

  // Fetch user profile (name + agency role for board filtering)
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, agency_role')
    .eq('id', userId)
    .single();

  const userName = profile?.display_name || 'there';
  const agencyRole = profile?.agency_role ?? null;

  // Date ranges
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const thisWeekStart = getMonday(now);
  const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const lastWeekEnd = new Date(thisWeekStart.getTime() - 1);

  // Run all queries in parallel
  const [
    meetingsResult,
    stuckResult,
    overdueResult,
    failedUpdatesResult,
    pendingUpdatesResult,
    flaggedResult,
    thisWeekSnapshots,
    lastWeekSnapshots,
    boardsResult,
  ] = await Promise.all([
    // 1. Upcoming meetings (next 48h)
    supabase
      .from('calendar_events')
      .select('id, title, start_time, end_time, location, event_link, attendees')
      .gte('start_time', now.toISOString())
      .lte('start_time', in48h.toISOString())
      .order('start_time', { ascending: true })
      .limit(5),

    // 2. Stuck cards via RPC
    supabase.rpc('get_stuck_cards', {
      p_days_threshold: Math.max(1, Math.min(stuckDays, 30)),
      p_max_results: 15,
    }),

    // 3a. Overdue cards count
    supabase
      .from('cards')
      .select('id', { count: 'exact', head: true })
      .lt('due_date', now.toISOString())
      .not('due_date', 'is', null),

    // 3b. Failed client updates count
    supabase
      .from('client_weekly_updates')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed'),

    // 3c. Pending approval updates count
    supabase
      .from('client_weekly_updates')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_approval'),

    // 3d. Flagged tickets count
    supabase
      .from('pk_flagged_tickets')
      .select('id', { count: 'exact', head: true }),

    // 4a. This week productivity snapshots
    getProductivitySnapshots(supabase, {
      startDate: thisWeekStart.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
    }),

    // 4b. Last week productivity snapshots
    getProductivitySnapshots(supabase, {
      startDate: lastWeekStart.toISOString().split('T')[0],
      endDate: lastWeekEnd.toISOString().split('T')[0],
    }),

    // 5. All boards (for board summaries)
    supabase
      .from('boards')
      .select('*')
      .order('created_at', { ascending: true }),
  ]);

  // --- Meetings: enrich with client names ---
  const meetings: UpcomingMeeting[] = [];
  const rawMeetings = meetingsResult.data || [];

  if (rawMeetings.length > 0) {
    // Get all client meeting configs to match keywords
    const { data: configs } = await supabase
      .from('client_meeting_configs')
      .select('client_id, calendar_event_keyword');
    const { data: clients } = await supabase
      .from('clients')
      .select('id, name');

    const clientMap = new Map((clients || []).map((c: any) => [c.id, c.name]));

    for (const evt of rawMeetings) {
      let clientName: string | null = null;
      if (configs) {
        const match = configs.find((cfg: any) =>
          cfg.calendar_event_keyword &&
          evt.title?.toLowerCase().includes(cfg.calendar_event_keyword.toLowerCase())
        );
        if (match) clientName = clientMap.get(match.client_id) || null;
      }

      // Check if prep session exists
      const { count: prepCount } = await supabase
        .from('meeting_prep_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('calendar_event_id', evt.id);

      meetings.push({
        id: evt.id,
        title: evt.title,
        start_time: evt.start_time,
        end_time: evt.end_time,
        location: evt.location,
        event_link: evt.event_link,
        attendees: evt.attendees || [],
        client_name: clientName,
        has_prep: (prepCount || 0) > 0,
        prep_id: null,
      });
    }
  }

  // --- Stuck cards ---
  const stuckCards: StuckCard[] = (stuckResult.data || []).map((row: any) => ({
    card_id: row.card_id,
    title: row.title,
    board_id: row.board_id,
    board_name: row.board_name,
    list_name: row.list_name,
    priority: row.priority || 'none',
    due_date: row.due_date,
    owner_id: row.owner_id,
    owner_name: row.owner_name,
    owner_avatar: row.owner_avatar,
    days_stuck: row.days_stuck,
    last_moved_at: row.last_moved_at,
  }));

  // --- Red flags ---
  const redFlags: RedFlags = {
    overdueCards: overdueResult.count || 0,
    failedUpdates: failedUpdatesResult.count || 0,
    pendingApprovalUpdates: pendingUpdatesResult.count || 0,
    flaggedTickets: flaggedResult.count || 0,
  };

  // --- Throughput ---
  const thisWeekMetrics = aggregateSnapshots(thisWeekSnapshots);
  const lastWeekMetrics = aggregateSnapshots(lastWeekSnapshots);

  const completedDelta = lastWeekMetrics.ticketsCompleted > 0
    ? Math.round(((thisWeekMetrics.ticketsCompleted - lastWeekMetrics.ticketsCompleted) / lastWeekMetrics.ticketsCompleted) * 100)
    : 0;
  const cycleDelta = lastWeekMetrics.avgCycleTimeHours > 0
    ? Math.round(((thisWeekMetrics.avgCycleTimeHours - lastWeekMetrics.avgCycleTimeHours) / lastWeekMetrics.avgCycleTimeHours) * 100)
    : 0;

  const throughput: ThroughputData = {
    thisWeek: {
      ticketsCompleted: thisWeekMetrics.ticketsCompleted,
      ticketsCreated: thisWeekMetrics.ticketsCreated,
      avgCycleTimeHours: thisWeekMetrics.avgCycleTimeHours,
    },
    lastWeek: {
      ticketsCompleted: lastWeekMetrics.ticketsCompleted,
      ticketsCreated: lastWeekMetrics.ticketsCreated,
      avgCycleTimeHours: lastWeekMetrics.avgCycleTimeHours,
    },
    completedDelta,
    cycleDelta,
  };

  // --- Board summaries (reuse logic from dashboard-summary) ---
  const allBoards = boardsResult.data || [];
  const filtered = agencyRole
    ? allBoards.filter((board: any) => canAccessBoardByRole(agencyRole, board.type))
    : allBoards;

  let boardSummaries: ExecutiveDashboardResponse['boardSummaries'] = [];

  if (filtered.length > 0) {
    const boardIds = filtered.map((b: any) => b.id);

    const { data: allLists } = await supabase
      .from('lists')
      .select('id, name, position, board_id')
      .in('board_id', boardIds)
      .order('position', { ascending: true });

    const listIds = (allLists || []).map((l: any) => l.id);
    const listCardCounts = new Map<string, number>();

    if (listIds.length > 0) {
      const batchSize = 20;
      for (let i = 0; i < listIds.length; i += batchSize) {
        const batch = listIds.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map((listId: string) =>
            supabase
              .from('card_placements')
              .select('*', { count: 'exact', head: true })
              .eq('list_id', listId)
              .then(({ count }) => ({ listId, count: count || 0 }))
          )
        );
        for (const { listId, count } of results) {
          listCardCounts.set(listId, count);
        }
      }
    }

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentMoves } = await supabase
      .from('activity_log')
      .select('board_id')
      .eq('event_type', 'card_moved')
      .in('board_id', boardIds)
      .gte('created_at', oneDayAgo);

    const recentMoveCounts = new Map<string, number>();
    for (const m of recentMoves || []) {
      recentMoveCounts.set(m.board_id, (recentMoveCounts.get(m.board_id) || 0) + 1);
    }

    const listsByBoard = new Map<string, any[]>();
    for (const list of allLists || []) {
      if (!listsByBoard.has(list.board_id)) listsByBoard.set(list.board_id, []);
      listsByBoard.get(list.board_id)!.push(list);
    }

    boardSummaries = filtered.map((board: any) => {
      const boardLists = listsByBoard.get(board.id) || [];
      let totalCards = 0;
      const lists = boardLists.map((list: any) => {
        const cardCount = listCardCounts.get(list.id) || 0;
        totalCards += cardCount;
        return { id: list.id, name: list.name, cardCount };
      });
      return {
        board,
        totalCards,
        lists,
        recentlyMoved: recentMoveCounts.get(board.id) || 0,
      };
    });
  }

  const response: ExecutiveDashboardResponse = {
    upcomingMeetings: meetings,
    stuckCards,
    redFlags,
    throughput,
    boardSummaries,
    userName,
  };

  return successResponse(response);
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
