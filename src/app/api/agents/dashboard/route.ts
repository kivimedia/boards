import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getSkillQualityDashboard, getExecutionStats } from '@/lib/agent-engine';

/**
 * GET /api/agents/dashboard — Get quality dashboard + execution stats
 * Query params: board_id, skill_id, days
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const boardId = url.searchParams.get('board_id') ?? undefined;
    const skillId = url.searchParams.get('skill_id') ?? undefined;
    const days = parseInt(url.searchParams.get('days') ?? '30');

    const [qualityDashboard, executionStats] = await Promise.all([
      getSkillQualityDashboard(auth.ctx.supabase),
      getExecutionStats(auth.ctx.supabase, { board_id: boardId, skill_id: skillId, days }),
    ]);

    return successResponse({
      quality: qualityDashboard,
      executions: executionStats,
    });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}
