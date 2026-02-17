import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * GET /api/handoff-rules
 * List all handoff rules. Include source and target board names by joining with boards table.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('handoff_rules')
    .select('*, source_board:boards!handoff_rules_source_board_id_fkey(id, name), target_board:boards!handoff_rules_target_board_id_fkey(id, name)')
    .order('created_at', { ascending: false });

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface CreateHandoffRuleBody {
  name: string;
  source_board_id: string;
  source_column: string;
  target_board_id: string;
  target_column: string;
  inherit_fields?: string[];
}

/**
 * POST /api/handoff-rules
 * Create a handoff rule.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateHandoffRuleBody>(request);
  if (!body.ok) return body.response;

  const { name, source_board_id, source_column, target_board_id, target_column, inherit_fields } = body.body;

  if (!name?.trim()) return errorResponse('Rule name is required');
  if (!source_board_id) return errorResponse('source_board_id is required');
  if (!source_column?.trim()) return errorResponse('source_column is required');
  if (!target_board_id) return errorResponse('target_board_id is required');
  if (!target_column?.trim()) return errorResponse('target_column is required');

  const { supabase, userId } = auth.ctx;

  const { data, error } = await supabase
    .from('handoff_rules')
    .insert({
      name: name.trim(),
      source_board_id,
      source_column: source_column.trim(),
      target_board_id,
      target_column: target_column.trim(),
      inherit_fields: inherit_fields || [],
      is_active: true,
      created_by: userId,
    })
    .select('*, source_board:boards!handoff_rules_source_board_id_fkey(id, name), target_board:boards!handoff_rules_target_board_id_fkey(id, name)')
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
