import { getAuthContext, successResponse } from '@/lib/api-helpers';
import { getHealthMetrics } from '@/lib/outreach/safety-monitor';

/**
 * GET /api/outreach/health - Agent health metrics
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const metrics = await getHealthMetrics(supabase, userId);

  return successResponse({ metrics });
}
