import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getBudgetAlerts, createBudgetAlert } from '@/lib/ai/cost-profiling';

/**
 * GET /api/ai/budget-alerts
 * List budget alerts. Optionally filter by scope.
 * Query params:
 *   scope?: string - filter by scope (global, user, board, activity)
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope') ?? undefined;

  try {
    const alerts = await getBudgetAlerts(supabase, scope);
    return successResponse(alerts);
  } catch (err) {
    return errorResponse(
      `Failed to fetch budget alerts: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

interface CreateAlertBody {
  scope: string;
  scopeId?: string;
  thresholdPercent: number;
  monthlyCap: number;
}

/**
 * POST /api/ai/budget-alerts
 * Create a new budget alert.
 *
 * Body:
 *   scope: string (required) - global | user | board | activity
 *   scopeId?: string - ID for non-global scopes
 *   thresholdPercent: number (required) - alert at this percentage of cap
 *   monthlyCap: number (required) - monthly budget cap in USD
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateAlertBody>(request);
  if (!body.ok) return body.response;

  const { scope, scopeId, thresholdPercent, monthlyCap } = body.body;
  const { supabase } = auth.ctx;

  if (!scope) return errorResponse('scope is required');
  if (!['global', 'user', 'board', 'activity'].includes(scope)) {
    return errorResponse('scope must be one of: global, user, board, activity');
  }
  if (typeof thresholdPercent !== 'number' || thresholdPercent <= 0 || thresholdPercent > 100) {
    return errorResponse('thresholdPercent must be a number between 1 and 100');
  }
  if (typeof monthlyCap !== 'number' || monthlyCap <= 0) {
    return errorResponse('monthlyCap must be a positive number');
  }

  try {
    const alert = await createBudgetAlert(supabase, {
      scope,
      scopeId,
      thresholdPercent,
      monthlyCap,
    });

    if (!alert) {
      return errorResponse('Failed to create budget alert', 500);
    }

    return successResponse(alert, 201);
  } catch (err) {
    return errorResponse(
      `Failed to create budget alert: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
