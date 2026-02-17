import { NextRequest } from 'next/server';
import {
  getAuthContext,
  successResponse,
  errorResponse,
  parseBody,
} from '@/lib/api-helpers';
import { reorderAutomationRules } from '@/lib/automation-rules-builder';

interface Params {
  params: { id: string };
}

interface ReorderBody {
  rule_ids: string[];
}

/**
 * POST /api/boards/[id]/automations/reorder
 * Reorder automation rules by providing an ordered array of rule IDs.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<ReorderBody>(request);
  if (!parsed.ok) return parsed.response;

  const { supabase } = auth.ctx;
  const boardId = params.id;
  const { rule_ids } = parsed.body;

  if (!Array.isArray(rule_ids) || rule_ids.length === 0) {
    return errorResponse('rule_ids must be a non-empty array');
  }

  await reorderAutomationRules(supabase, boardId, rule_ids);
  return successResponse({ reordered: true });
}
