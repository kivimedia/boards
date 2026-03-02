import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getPlanWithTasks, updatePlanStatus } from '@/lib/weekly-gantt';

interface Params {
  params: Promise<{ clientId: string; planId: string }>;
}

/**
 * GET /api/clients/[clientId]/weekly-plans/[planId]
 * Full plan with tasks and owner profiles.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { planId } = await params;

  try {
    const plan = await getPlanWithTasks(auth.ctx.supabase, planId);
    if (!plan) return errorResponse('Plan not found', 404);
    return successResponse(plan);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to fetch plan', 500);
  }
}

interface UpdateBody {
  status?: string;
  day_labels?: Record<string, string>;
  day_colors?: Record<string, string>;
}

/**
 * PATCH /api/clients/[clientId]/weekly-plans/[planId]
 * Update plan status, day_labels, day_colors.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateBody>(request);
  if (!body.ok) return body.response;

  const { planId } = await params;
  const { status, day_labels, day_colors } = body.body;

  if (status && !['draft', 'active', 'archived'].includes(status)) {
    return errorResponse('Invalid status');
  }

  try {
    const patch: Record<string, unknown> = {};
    if (status) patch.status = status;
    if (day_labels !== undefined) patch.day_labels = day_labels;
    if (day_colors !== undefined) patch.day_colors = day_colors;

    if (Object.keys(patch).length > 0) {
      const { error } = await auth.ctx.supabase
        .from('client_weekly_plans')
        .update(patch)
        .eq('id', planId);
      if (error) throw new Error(error.message);
    }

    return successResponse({ updated: true });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to update plan', 500);
  }
}
