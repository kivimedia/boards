import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { budgetId: string };
}

interface UpdateBudgetBody {
  monthly_cap_usd?: number;
  alert_threshold_pct?: number;
  is_active?: boolean;
}

/**
 * PUT /api/ai/budget/[budgetId]
 * Update a budget configuration.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateBudgetBody>(request);
  if (!body.ok) return body.response;

  const { monthly_cap_usd, alert_threshold_pct, is_active } = body.body;
  const updates: Record<string, unknown> = {};

  if (monthly_cap_usd !== undefined) {
    if (typeof monthly_cap_usd !== 'number' || monthly_cap_usd <= 0) {
      return errorResponse('monthly_cap_usd must be a positive number');
    }
    updates.monthly_cap_usd = monthly_cap_usd;
  }
  if (alert_threshold_pct !== undefined) {
    if (typeof alert_threshold_pct !== 'number' || alert_threshold_pct < 0 || alert_threshold_pct > 100) {
      return errorResponse('alert_threshold_pct must be a number between 0 and 100');
    }
    updates.alert_threshold_pct = alert_threshold_pct;
  }
  if (is_active !== undefined) {
    if (typeof is_active !== 'boolean') return errorResponse('is_active must be a boolean');
    updates.is_active = is_active;
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const { supabase } = auth.ctx;
  const { budgetId } = params;

  const { data, error } = await supabase
    .from('ai_budget_config')
    .update(updates)
    .eq('id', budgetId)
    .select()
    .single();

  if (error) return errorResponse('Budget config not found', 404);
  return successResponse(data);
}

/**
 * DELETE /api/ai/budget/[budgetId]
 * Delete a budget configuration.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { budgetId } = params;

  const { error } = await supabase
    .from('ai_budget_config')
    .delete()
    .eq('id', budgetId);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true });
}
