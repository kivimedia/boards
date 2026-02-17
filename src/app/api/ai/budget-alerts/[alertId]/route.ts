import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { updateBudgetAlert } from '@/lib/ai/cost-profiling';

interface Params {
  params: { alertId: string };
}

interface UpdateAlertBody {
  threshold_percent?: number;
  monthly_cap?: number;
  current_spend?: number;
  alert_sent?: boolean;
}

/**
 * PATCH /api/ai/budget-alerts/[alertId]
 * Update a budget alert.
 *
 * Body (partial):
 *   threshold_percent?: number
 *   monthly_cap?: number
 *   current_spend?: number
 *   alert_sent?: boolean
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateAlertBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const { alertId } = params;
  const updates = body.body;

  try {
    const updated = await updateBudgetAlert(supabase, alertId, updates);

    if (!updated) {
      return errorResponse('Budget alert not found or update failed', 404);
    }

    return successResponse(updated);
  } catch (err) {
    return errorResponse(
      `Failed to update budget alert: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

/**
 * DELETE /api/ai/budget-alerts/[alertId]
 * Delete a budget alert.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { alertId } = params;

  try {
    await supabase.from('ai_budget_alerts').delete().eq('id', alertId);
    return successResponse({ deleted: true });
  } catch (err) {
    return errorResponse(
      `Failed to delete budget alert: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
