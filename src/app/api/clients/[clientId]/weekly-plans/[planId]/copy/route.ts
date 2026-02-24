import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { copyFromPlan, getOrCreatePlan, getMonday } from '@/lib/weekly-gantt';

interface Params {
  params: Promise<{ clientId: string; planId: string }>;
}

interface CopyBody {
  target_week_start?: string;
  mode?: 'incomplete_only' | 'all';
}

/**
 * POST /api/clients/[clientId]/weekly-plans/[planId]/copy
 * Copy tasks from this plan to a new/existing plan for the target week.
 * Defaults to next week and incomplete-only mode.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CopyBody>(request);
  if (!body.ok) return body.response;

  const { clientId, planId } = await params;
  const mode = body.body.mode || 'incomplete_only';

  // Default target = next week's Monday
  let targetWeekStart = body.body.target_week_start;
  if (!targetWeekStart) {
    const nextMonday = new Date();
    nextMonday.setDate(nextMonday.getDate() + 7);
    targetWeekStart = getMonday(nextMonday);
  }

  try {
    // Get or create target plan
    const targetPlan = await getOrCreatePlan(
      auth.ctx.supabase,
      clientId,
      targetWeekStart,
      auth.ctx.userId
    );

    // Copy tasks
    const copiedTasks = await copyFromPlan(auth.ctx.supabase, planId, targetPlan.id, mode);

    return successResponse({
      plan: targetPlan,
      copied_tasks: copiedTasks.length,
    }, 201);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to copy plan', 500);
  }
}
