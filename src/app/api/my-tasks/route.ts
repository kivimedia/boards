import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { fetchMyTasks } from '@/lib/my-tasks';

/**
 * GET /api/my-tasks?page=1&pageSize=50
 * Fetch paginated tasks assigned to the current user.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '50', 10)));

  try {
    const result = await fetchMyTasks(supabase, userId, page, pageSize);
    return successResponse(result);
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to fetch tasks', 500);
  }
}
