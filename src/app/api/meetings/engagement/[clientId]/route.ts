import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/meetings/engagement/{clientId}?period=30
 * Return engagement statistics for a specific client over the given period,
 * with comparison to the previous period and weekly breakdown.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { clientId } = params;

  const url = new URL(request.url);
  const periodDays = parseInt(url.searchParams.get('period') || '30', 10);

  try {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const prevPeriodStart = new Date(periodStart.getTime() - periodDays * 24 * 60 * 60 * 1000);

    // 1. Current period meetings
    const { data: currentMeetings, count: currentCount, error: currentError } = await supabase
      .from('fathom_recordings')
      .select('id, duration_seconds, ai_action_items, recorded_at', { count: 'exact' })
      .eq('matched_client_id', clientId)
      .gte('recorded_at', periodStart.toISOString());

    if (currentError) throw currentError;

    // 2. Previous period count
    const { count: prevCount, error: prevError } = await supabase
      .from('fathom_recordings')
      .select('id', { count: 'exact', head: true })
      .eq('matched_client_id', clientId)
      .gte('recorded_at', prevPeriodStart.toISOString())
      .lt('recorded_at', periodStart.toISOString());

    if (prevError) throw prevError;

    // Calculate stats from current period
    const meetings = currentMeetings || [];
    const totalMeetings = currentCount || 0;
    const previousPeriodMeetings = prevCount || 0;

    // Average duration
    const durationsValid = meetings.filter(
      (m: { duration_seconds: number | null }) => m.duration_seconds != null
    );
    const avgDurationMinutes =
      durationsValid.length > 0
        ? Math.round(
            (durationsValid.reduce(
              (sum: number, m: { duration_seconds: number | null }) =>
                sum + (m.duration_seconds || 0),
              0
            ) /
              durationsValid.length /
              60) *
              10
          ) / 10
        : 0;

    // Action items total
    const actionItemsTotal = meetings.reduce(
      (sum: number, m: { ai_action_items: unknown[] | null }) => {
        if (Array.isArray(m.ai_action_items)) {
          return sum + m.ai_action_items.length;
        }
        return sum;
      },
      0
    );

    // 3. Weekly breakdown - bucket meetings by ISO week (Monday start)
    const weekBuckets: Record<string, { count: number; duration_minutes: number }> = {};

    for (const m of meetings) {
      const date = new Date((m as { recorded_at: string }).recorded_at);
      // Get Monday of the ISO week
      const day = date.getDay();
      const diff = day === 0 ? -6 : 1 - day; // Monday = 1
      const monday = new Date(date);
      monday.setDate(monday.getDate() + diff);
      const weekStart = monday.toISOString().slice(0, 10); // YYYY-MM-DD

      if (!weekBuckets[weekStart]) {
        weekBuckets[weekStart] = { count: 0, duration_minutes: 0 };
      }
      weekBuckets[weekStart].count++;
      weekBuckets[weekStart].duration_minutes += Math.round(
        ((m as { duration_seconds: number | null }).duration_seconds || 0) / 60
      );
    }

    const weeklyData = Object.entries(weekBuckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8) // last 8 weeks max
      .map(([week_start, data]) => ({
        week_start,
        count: data.count,
        duration_minutes: data.duration_minutes,
      }));

    return NextResponse.json({
      total_meetings: totalMeetings,
      previous_period_meetings: previousPeriodMeetings,
      avg_duration_minutes: avgDurationMinutes,
      action_items_total: actionItemsTotal,
      weekly_data: weeklyData,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[meetings/engagement] Failed to fetch engagement stats:', message);
    return errorResponse(`Failed to fetch engagement stats: ${message}`, 500);
  }
}
