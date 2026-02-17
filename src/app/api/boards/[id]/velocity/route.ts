import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getVelocityData } from '@/lib/analytics';

interface Params {
  params: { id: string };
}

/**
 * GET /api/boards/[id]/velocity?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&sprint_days=7
 * Returns velocity metrics (cards completed per sprint period).
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');
  const sprintDays = parseInt(searchParams.get('sprint_days') || '7', 10);

  if (!startDate || !endDate) {
    return errorResponse('start_date and end_date are required (YYYY-MM-DD)');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return errorResponse('Dates must be in YYYY-MM-DD format');
  }

  if (new Date(startDate) >= new Date(endDate)) {
    return errorResponse('start_date must be before end_date');
  }

  if (![7, 14, 30].includes(sprintDays)) {
    return errorResponse('sprint_days must be 7, 14, or 30');
  }

  const { supabase } = auth.ctx;
  const data = await getVelocityData(supabase, params.id, startDate, endDate, sprintDays);

  // Calculate summary stats
  const totalCompleted = data.reduce((sum, p) => sum + p.cards_completed, 0);
  const totalAdded = data.reduce((sum, p) => sum + p.cards_added, 0);
  const avgVelocity = data.length > 0
    ? Math.round((totalCompleted / data.length) * 10) / 10
    : 0;
  const cycleTimes = data.filter((d) => d.avg_cycle_time_hours !== null);
  const avgCycleTime = cycleTimes.length > 0
    ? Math.round((cycleTimes.reduce((s, d) => s + (d.avg_cycle_time_hours ?? 0), 0) / cycleTimes.length) * 10) / 10
    : null;

  return successResponse({
    periods: data,
    summary: {
      total_completed: totalCompleted,
      total_added: totalAdded,
      avg_velocity_per_sprint: avgVelocity,
      avg_cycle_time_hours: avgCycleTime,
      sprint_count: data.length,
      sprint_days: sprintDays,
    },
  });
}
