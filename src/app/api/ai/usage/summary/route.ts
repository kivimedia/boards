import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getUsageSummary } from '@/lib/ai/cost-tracker';

/**
 * GET /api/ai/usage/summary
 * Return current month usage summary grouped by activity and provider.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  try {
    const summary = await getUsageSummary(supabase);
    return successResponse(summary);
  } catch (err) {
    console.error('[AI Usage Summary] Error:', err);
    return errorResponse('Failed to fetch usage summary', 500);
  }
}
