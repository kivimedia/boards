import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getPlans, getOrCreatePlan, getMonday } from '@/lib/weekly-gantt';

interface Params {
  params: Promise<{ clientId: string }>;
}

/**
 * GET /api/clients/[clientId]/weekly-plans
 * List weekly plans for a client (most recent first).
 * Query: ?limit=20
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { clientId } = await params;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 100);

  try {
    const plans = await getPlans(auth.ctx.supabase, clientId, limit);
    return successResponse(plans);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to fetch plans', 500);
  }
}

interface CreatePlanBody {
  week_start?: string;
}

/**
 * POST /api/clients/[clientId]/weekly-plans
 * Get or create a plan for a specific week (defaults to current week).
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreatePlanBody>(request);
  if (!body.ok) return body.response;

  const { clientId } = await params;
  const weekStart = body.body.week_start || getMonday(new Date());

  try {
    const plan = await getOrCreatePlan(auth.ctx.supabase, clientId, weekStart, auth.ctx.userId);
    return successResponse(plan, 201);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to create plan', 500);
  }
}
