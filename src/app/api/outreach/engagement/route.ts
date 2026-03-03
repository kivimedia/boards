import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/outreach/engagement - Engagement funnel analytics
 *
 * Returns conversion rates between pipeline stages and weekly trends.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '30');

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Parallel queries for funnel data
  const [stageCountsRes, transitionsRes, weeklyRes] = await Promise.all([
    // Current stage distribution
    supabase
      .from('li_leads')
      .select('pipeline_stage')
      .eq('user_id', userId)
      .is('deleted_at', null),

    // Stage transitions for conversion rates
    supabase
      .from('li_pipeline_events')
      .select('from_stage, to_stage, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true }),

    // Weekly aggregation of key events
    supabase
      .from('li_pipeline_events')
      .select('to_stage, created_at')
      .gte('created_at', since)
      .in('to_stage', ['CONNECTION_SENT', 'CONNECTED', 'MESSAGE_SENT', 'REPLIED', 'BOOKED', 'NOT_INTERESTED']),
  ]);

  // Calculate stage counts
  const stageCounts: Record<string, number> = {};
  for (const lead of stageCountsRes.data || []) {
    stageCounts[lead.pipeline_stage] = (stageCounts[lead.pipeline_stage] || 0) + 1;
  }

  // Calculate conversion rates
  const transitions = transitionsRes.data || [];
  const transitionCounts: Record<string, number> = {};
  for (const t of transitions) {
    const key = `${t.from_stage}->${t.to_stage}`;
    transitionCounts[key] = (transitionCounts[key] || 0) + 1;
  }

  // Key funnel metrics
  const connectionsSent = stageCounts['CONNECTION_SENT'] || 0;
  const connected = stageCounts['CONNECTED'] || 0;
  const messagesSent = stageCounts['MESSAGE_SENT'] || 0;
  const replied = stageCounts['REPLIED'] || 0;
  const booked = stageCounts['BOOKED'] || 0;

  const funnel = {
    connections_sent: connectionsSent,
    connected,
    messages_sent: messagesSent,
    replied,
    booked,
    accept_rate: connectionsSent > 0 ? (connected / connectionsSent * 100).toFixed(1) : '0.0',
    reply_rate: messagesSent > 0 ? (replied / messagesSent * 100).toFixed(1) : '0.0',
    booking_rate: replied > 0 ? (booked / replied * 100).toFixed(1) : '0.0',
  };

  // Weekly trend: group events by ISO week
  const weeklyEvents = weeklyRes.data || [];
  const weeklyTrend: Record<string, Record<string, number>> = {};

  for (const event of weeklyEvents) {
    const date = new Date(event.created_at);
    const weekStart = getWeekStart(date);
    if (!weeklyTrend[weekStart]) {
      weeklyTrend[weekStart] = {};
    }
    weeklyTrend[weekStart][event.to_stage] = (weeklyTrend[weekStart][event.to_stage] || 0) + 1;
  }

  // Calculate avg days between key stages
  const avgDays = calculateAvgDaysBetweenStages(transitions);

  return successResponse({
    funnel,
    stage_counts: stageCounts,
    weekly_trend: Object.entries(weeklyTrend).map(([week, counts]) => ({
      week,
      ...counts,
    })),
    avg_days_between_stages: avgDays,
    period_days: days,
  });
}

function getWeekStart(date: Date): string {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}

function calculateAvgDaysBetweenStages(
  transitions: { from_stage: string; to_stage: string; created_at: string }[]
): Record<string, number> {
  // Track first occurrence of each stage per lead-chain
  const stagePairs = [
    { from: 'CONNECTION_SENT', to: 'CONNECTED', label: 'send_to_accept' },
    { from: 'CONNECTED', to: 'MESSAGE_SENT', label: 'accept_to_message' },
    { from: 'MESSAGE_SENT', to: 'REPLIED', label: 'message_to_reply' },
    { from: 'REPLIED', to: 'BOOKED', label: 'reply_to_booking' },
  ];

  const result: Record<string, number> = {};

  for (const pair of stagePairs) {
    const fromEvents = transitions.filter(t => t.to_stage === pair.from);
    const toEvents = transitions.filter(t => t.from_stage === pair.from && t.to_stage === pair.to);

    if (fromEvents.length > 0 && toEvents.length > 0) {
      // Simple avg: total time / count
      let totalDays = 0;
      let count = 0;

      for (const toEvent of toEvents) {
        // Find the closest preceding from_event
        const fromEvent = fromEvents
          .filter(f => new Date(f.created_at) < new Date(toEvent.created_at))
          .pop();

        if (fromEvent) {
          const days = (new Date(toEvent.created_at).getTime() - new Date(fromEvent.created_at).getTime()) / (1000 * 60 * 60 * 24);
          totalDays += days;
          count++;
        }
      }

      if (count > 0) {
        result[pair.label] = Math.round((totalDays / count) * 10) / 10;
      }
    }
  }

  return result;
}
