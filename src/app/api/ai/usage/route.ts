import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/ai/usage
 * Query usage log with filters and pagination.
 *
 * Query params:
 *   provider   - filter by provider (anthropic, openai, google, browserless)
 *   activity   - filter by activity type
 *   userId     - filter by user ID
 *   startDate  - filter by start date (ISO string)
 *   endDate    - filter by end date (ISO string)
 *   page       - page number (default 1)
 *   pageSize   - items per page (default 50, max 100)
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const provider = searchParams.get('provider');
  const activity = searchParams.get('activity');
  const userId = searchParams.get('userId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10)));

  const { supabase } = auth.ctx;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('ai_usage_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (provider) query = query.eq('provider', provider);
  if (activity) query = query.eq('activity', activity);
  if (userId) query = query.eq('user_id', userId);
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);

  const { data, error, count } = await query;

  if (error) return errorResponse(error.message, 500);

  return successResponse({
    items: data,
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    },
  });
}
