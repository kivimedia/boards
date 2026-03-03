import { getAuthContext, successResponse } from '@/lib/api-helpers';
import { getSafetyStatus } from '@/lib/outreach/safety-monitor';

/**
 * GET /api/outreach/safety - LinkedIn safety dashboard data
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const safety = await getSafetyStatus(supabase, userId);

  return successResponse({ safety });
}
