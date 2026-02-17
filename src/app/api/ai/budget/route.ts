import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getAllBudgetStatuses } from '@/lib/ai/budget-checker';
import type { AIBudgetScope } from '@/lib/types';

const VALID_SCOPES: AIBudgetScope[] = ['global', 'provider', 'activity', 'user', 'board', 'client'];

/**
 * GET /api/ai/budget
 * List all active budget configs with their current spend status.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  try {
    const statuses = await getAllBudgetStatuses(supabase);
    return successResponse(statuses);
  } catch (err) {
    console.error('[AI Budget] Error fetching statuses:', err);
    return errorResponse('Failed to fetch budget statuses', 500);
  }
}

interface CreateBudgetBody {
  scope: AIBudgetScope;
  scope_id?: string | null;
  monthly_cap_usd: number;
  alert_threshold_pct?: number;
}

/**
 * POST /api/ai/budget
 * Create a new budget configuration.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateBudgetBody>(request);
  if (!body.ok) return body.response;

  const { scope, scope_id, monthly_cap_usd, alert_threshold_pct } = body.body;

  if (!scope || !VALID_SCOPES.includes(scope)) {
    return errorResponse(`Invalid scope. Must be one of: ${VALID_SCOPES.join(', ')}`);
  }
  if (scope !== 'global' && !scope_id?.trim()) {
    return errorResponse('scope_id is required for non-global scopes');
  }
  if (typeof monthly_cap_usd !== 'number' || monthly_cap_usd <= 0) {
    return errorResponse('monthly_cap_usd must be a positive number');
  }
  if (alert_threshold_pct !== undefined) {
    if (typeof alert_threshold_pct !== 'number' || alert_threshold_pct < 0 || alert_threshold_pct > 100) {
      return errorResponse('alert_threshold_pct must be a number between 0 and 100');
    }
  }

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('ai_budget_config')
    .insert({
      scope,
      scope_id: scope === 'global' ? null : scope_id!.trim(),
      monthly_cap_usd,
      alert_threshold_pct: alert_threshold_pct ?? 80,
      is_active: true,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
