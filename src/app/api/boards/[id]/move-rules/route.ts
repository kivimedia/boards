import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { UserRole } from '@/lib/types';
import { ALL_ROLES, canManageMembers } from '@/lib/permissions';

interface Params {
  params: { id: string };
}

/**
 * GET /api/boards/[id]/move-rules
 * List column move rules for a board.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const boardId = params.id;

  const { data, error } = await supabase
    .from('column_move_rules')
    .select('*')
    .eq('board_id', boardId)
    .order('created_at', { ascending: true });

  if (error) {
    return errorResponse(error.message, 500);
  }

  return successResponse(data || []);
}

interface CreateMoveRuleBody {
  from_list_id: string;
  to_list_id: string;
  allowed_roles: UserRole[];
}

/**
 * POST /api/boards/[id]/move-rules
 * Create a column move rule.
 * Body: { from_list_id: string, to_list_id: string, allowed_roles: UserRole[] }
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const boardId = params.id;

  // Check if requesting user can manage members (same permission level for rules)
  const { data: currentMembership } = await supabase
    .from('board_members')
    .select('role')
    .eq('board_id', boardId)
    .eq('user_id', userId)
    .single();

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('user_role, role')
    .eq('id', userId)
    .single();

  const globalRole = (currentProfile?.user_role || currentProfile?.role || 'member') as UserRole;
  const effectiveRole = currentMembership?.role || globalRole;

  if (!canManageMembers(effectiveRole as UserRole) && globalRole !== 'admin') {
    return errorResponse('Forbidden: Insufficient permissions to manage move rules', 403);
  }

  const body = await parseBody<CreateMoveRuleBody>(request);
  if (!body.ok) return body.response;

  const { from_list_id, to_list_id, allowed_roles } = body.body;

  if (!from_list_id || !to_list_id || !allowed_roles || !Array.isArray(allowed_roles)) {
    return errorResponse('from_list_id, to_list_id, and allowed_roles are required');
  }

  if (from_list_id === to_list_id) {
    return errorResponse('from_list_id and to_list_id must be different');
  }

  // Validate all roles
  for (const role of allowed_roles) {
    if (!ALL_ROLES.includes(role)) {
      return errorResponse(`Invalid role: ${role}. Must be one of: ${ALL_ROLES.join(', ')}`);
    }
  }

  // Verify both lists belong to this board
  const { data: fromList } = await supabase
    .from('lists')
    .select('id')
    .eq('id', from_list_id)
    .eq('board_id', boardId)
    .single();

  const { data: toList } = await supabase
    .from('lists')
    .select('id')
    .eq('id', to_list_id)
    .eq('board_id', boardId)
    .single();

  if (!fromList || !toList) {
    return errorResponse('One or both lists do not belong to this board', 404);
  }

  // Check for duplicate rule
  const { data: existingRule } = await supabase
    .from('column_move_rules')
    .select('id')
    .eq('board_id', boardId)
    .eq('from_list_id', from_list_id)
    .eq('to_list_id', to_list_id)
    .single();

  if (existingRule) {
    return errorResponse('A rule already exists for this column transition. Remove the existing rule first.');
  }

  const { data, error } = await supabase
    .from('column_move_rules')
    .insert({
      board_id: boardId,
      from_list_id,
      to_list_id,
      allowed_roles,
    })
    .select()
    .single();

  if (error) {
    return errorResponse(error.message, 500);
  }

  return successResponse(data, 201);
}
