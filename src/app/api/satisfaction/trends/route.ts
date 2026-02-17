import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/satisfaction/trends?period=30|60|90&client_id=xxx
 * Returns satisfaction data aggregated by week for trend visualization.
 * If client_id is provided, filters to that client. Otherwise, returns all.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const period = parseInt(searchParams.get('period') || '90', 10);
  const clientId = searchParams.get('client_id');

  if (![30, 60, 90].includes(period)) {
    return errorResponse('period must be 30, 60, or 90');
  }

  const { supabase } = auth.ctx;
  const startDate = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString();

  // Fetch all satisfaction responses in the period
  let query = supabase
    .from('satisfaction_responses')
    .select('id, client_id, rating, feedback, created_at')
    .gte('created_at', startDate)
    .order('created_at', { ascending: true });

  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  const { data: responses, error } = await query;
  if (error) {
    return errorResponse(`Failed to fetch responses: ${error.message}`, 500);
  }

  // Also fetch from satisfaction_surveys table
  let surveyQuery = supabase
    .from('satisfaction_surveys')
    .select('id, client_id, rating, feedback, survey_type, created_at')
    .gte('created_at', startDate)
    .order('created_at', { ascending: true });

  if (clientId) {
    surveyQuery = surveyQuery.eq('client_id', clientId);
  }

  const { data: surveys } = await surveyQuery;

  // Combine both sources
  const allRatings = [
    ...(responses ?? []).map((r: any) => ({
      rating: r.rating,
      date: r.created_at.split('T')[0],
      client_id: r.client_id,
      type: 'response' as const,
    })),
    ...(surveys ?? []).map((s: any) => ({
      rating: s.rating,
      date: s.created_at.split('T')[0],
      client_id: s.client_id,
      type: s.survey_type || 'survey',
    })),
  ];

  // Group by week
  const weeklyData: Record<string, { total: number; count: number; week_start: string }> = {};
  for (const r of allRatings) {
    const date = new Date(r.date);
    const weekStart = new Date(date);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekKey = weekStart.toISOString().split('T')[0];

    if (!weeklyData[weekKey]) {
      weeklyData[weekKey] = { total: 0, count: 0, week_start: weekKey };
    }
    weeklyData[weekKey].total += r.rating;
    weeklyData[weekKey].count++;
  }

  const trend = Object.values(weeklyData)
    .sort((a, b) => a.week_start.localeCompare(b.week_start))
    .map((w) => ({
      week_start: w.week_start,
      avg_rating: Math.round((w.total / w.count) * 10) / 10,
      response_count: w.count,
    }));

  // Rating distribution
  const distribution = [1, 2, 3, 4, 5].map((star) => ({
    rating: star,
    count: allRatings.filter((r) => r.rating === star).length,
  }));

  // Per-client averages
  const clientMap: Record<string, { total: number; count: number }> = {};
  for (const r of allRatings) {
    if (!clientMap[r.client_id]) {
      clientMap[r.client_id] = { total: 0, count: 0 };
    }
    clientMap[r.client_id].total += r.rating;
    clientMap[r.client_id].count++;
  }

  const overallAvg = allRatings.length > 0
    ? Math.round((allRatings.reduce((s, r) => s + r.rating, 0) / allRatings.length) * 10) / 10
    : 0;

  return successResponse({
    trend,
    distribution,
    summary: {
      total_responses: allRatings.length,
      avg_rating: overallAvg,
      period_days: period,
    },
  });
}
