import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { checkBudgetAlerts } from '@/lib/ai/cost-profiling';

/**
 * POST /api/ai/budget-alerts/check
 * Check all unsent budget alerts and trigger any that have exceeded their threshold.
 * Returns the list of newly triggered alerts.
 */
export async function POST(_request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  try {
    const triggered = await checkBudgetAlerts(supabase);
    return successResponse({
      triggeredCount: triggered.length,
      triggered,
    });
  } catch (err) {
    return errorResponse(
      `Failed to check budget alerts: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
