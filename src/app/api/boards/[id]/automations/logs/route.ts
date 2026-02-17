import { NextRequest } from 'next/server';
import {
  getAuthContext,
  successResponse,
} from '@/lib/api-helpers';
import { getExecutionLogs } from '@/lib/automation-rules-builder';

interface Params {
  params: { id: string };
}

/**
 * GET /api/boards/[id]/automations/logs
 * Get execution logs for a board's automations.
 * Query params: rule_id, status, limit
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const boardId = params.id;
  const { searchParams } = new URL(request.url);

  const filters: {
    ruleId?: string;
    boardId?: string;
    status?: string;
    limit?: number;
  } = { boardId };

  const ruleId = searchParams.get('rule_id');
  const status = searchParams.get('status');
  const limit = searchParams.get('limit');

  if (ruleId) filters.ruleId = ruleId;
  if (status) filters.status = status;
  if (limit) filters.limit = parseInt(limit, 10);

  const logs = await getExecutionLogs(supabase, filters);
  return successResponse(logs);
}
