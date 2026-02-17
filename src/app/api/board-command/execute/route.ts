import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse, successResponse } from '@/lib/api-helpers';
import { bulkMoveCards, bulkAssign, bulkAddLabel, bulkSetPriority, bulkArchive } from '@/lib/bulk-operations';
import type { CommandAction, CommandExecutionResult } from '@/lib/types';

export const maxDuration = 30;

const VALID_ACTION_TYPES = ['move', 'assign', 'add_label', 'set_priority', 'archive', 'unarchive'];

/**
 * POST /api/board-command/execute
 * Executes an approved action plan using existing bulk operations.
 * Body: { board_id: string, actions: CommandAction[] }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: { board_id: string; actions: CommandAction[] };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { board_id, actions } = body;
  if (!board_id || !Array.isArray(actions) || actions.length === 0) {
    return errorResponse('board_id and actions array are required');
  }

  if (actions.length > 10) {
    return errorResponse('Maximum 10 actions per execution');
  }

  // Check board membership with edit permission
  const { data: membership } = await supabase
    .from('board_members')
    .select('role')
    .eq('board_id', board_id)
    .eq('user_id', userId)
    .single();

  if (!membership) {
    return errorResponse('You do not have access to this board', 403);
  }

  const editRoles = ['admin', 'department_lead', 'member'];
  if (!editRoles.includes(membership.role)) {
    return errorResponse('You need at least member role to execute commands', 403);
  }

  const results: CommandExecutionResult[] = [];

  // Execute actions sequentially (order matters)
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    // Basic validation
    if (!action || !VALID_ACTION_TYPES.includes(action.type)) {
      results.push({
        action_index: i,
        success: false,
        affected_count: 0,
        error: `Invalid action type: ${action?.type}`,
      });
      continue;
    }

    if (!Array.isArray(action.card_ids) || action.card_ids.length === 0) {
      results.push({
        action_index: i,
        success: false,
        affected_count: 0,
        error: 'No card IDs provided',
      });
      continue;
    }

    if (action.card_ids.length > 50) {
      results.push({
        action_index: i,
        success: false,
        affected_count: 0,
        error: 'Maximum 50 cards per action',
      });
      continue;
    }

    try {
      let result: { errors: string[] } & Record<string, number>;

      switch (action.type) {
        case 'move': {
          if (!action.config.target_list_id) {
            results.push({ action_index: i, success: false, affected_count: 0, error: 'Missing target_list_id' });
            continue;
          }
          const moveResult = await bulkMoveCards(supabase, action.card_ids, action.config.target_list_id);
          results.push({
            action_index: i,
            success: moveResult.errors.length === 0,
            affected_count: moveResult.moved,
            ...(moveResult.errors.length > 0 ? { error: moveResult.errors[0] } : {}),
          });
          break;
        }

        case 'assign': {
          if (!action.config.assignee_id) {
            results.push({ action_index: i, success: false, affected_count: 0, error: 'Missing assignee_id' });
            continue;
          }
          const assignResult = await bulkAssign(supabase, action.card_ids, action.config.assignee_id);
          results.push({
            action_index: i,
            success: assignResult.errors.length === 0,
            affected_count: assignResult.assigned,
            ...(assignResult.errors.length > 0 ? { error: assignResult.errors[0] } : {}),
          });
          break;
        }

        case 'add_label': {
          if (!action.config.label_id) {
            results.push({ action_index: i, success: false, affected_count: 0, error: 'Missing label_id' });
            continue;
          }
          const labelResult = await bulkAddLabel(supabase, action.card_ids, action.config.label_id);
          results.push({
            action_index: i,
            success: labelResult.errors.length === 0,
            affected_count: labelResult.labeled,
            ...(labelResult.errors.length > 0 ? { error: labelResult.errors[0] } : {}),
          });
          break;
        }

        case 'set_priority': {
          if (!action.config.priority) {
            results.push({ action_index: i, success: false, affected_count: 0, error: 'Missing priority' });
            continue;
          }
          const priorityResult = await bulkSetPriority(supabase, action.card_ids, action.config.priority);
          results.push({
            action_index: i,
            success: priorityResult.errors.length === 0,
            affected_count: priorityResult.updated,
            ...(priorityResult.errors.length > 0 ? { error: priorityResult.errors[0] } : {}),
          });
          break;
        }

        case 'archive': {
          const archiveResult = await bulkArchive(supabase, action.card_ids);
          results.push({
            action_index: i,
            success: archiveResult.errors.length === 0,
            affected_count: archiveResult.archived,
            ...(archiveResult.errors.length > 0 ? { error: archiveResult.errors[0] } : {}),
          });
          break;
        }

        case 'unarchive': {
          // Unarchive: re-create placements in the first list of the board
          // This is a simplified approach - cards go to the first list
          const { data: firstList } = await supabase
            .from('lists')
            .select('id')
            .eq('board_id', board_id)
            .order('position')
            .limit(1)
            .single();

          if (!firstList) {
            results.push({ action_index: i, success: false, affected_count: 0, error: 'No lists found on board' });
            continue;
          }

          let unarchived = 0;
          const errors: string[] = [];
          for (const cardId of action.card_ids) {
            const { error } = await supabase
              .from('card_placements')
              .upsert(
                { card_id: cardId, list_id: firstList.id, position: 99999, is_mirror: false },
                { onConflict: 'card_id,list_id' }
              );
            if (error) {
              errors.push(error.message);
            } else {
              unarchived++;
            }
          }

          results.push({
            action_index: i,
            success: errors.length === 0,
            affected_count: unarchived,
            ...(errors.length > 0 ? { error: errors[0] } : {}),
          });
          break;
        }
      }
    } catch (err: any) {
      results.push({
        action_index: i,
        success: false,
        affected_count: 0,
        error: err.message || 'Unexpected error',
      });
    }
  }

  return successResponse({ results });
}
