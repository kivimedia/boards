import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { fetchTeamWorkload } from '@/lib/team-view';

/**
 * GET /api/team/workload
 * Fetch detailed team workload (explicit endpoint).
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  try {
    const workload = await fetchTeamWorkload(supabase);
    return successResponse(workload);
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to fetch team workload', 500);
  }
}
