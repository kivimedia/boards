import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { bulkMoveCards, bulkAssign, bulkAddLabel, bulkDelete, bulkSetPriority, bulkArchive } from '@/lib/bulk-operations';

function getAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

type BulkAction = 'move' | 'assign' | 'add_label' | 'delete' | 'set_priority' | 'archive';

interface BulkOperationBody {
  action: BulkAction;
  card_ids: string[];
  target_list_id?: string;
  user_id?: string;
  label_id?: string;
  priority?: string;
}

const VALID_ACTIONS: BulkAction[] = ['move', 'assign', 'add_label', 'delete', 'set_priority', 'archive'];

/**
 * POST /api/cards/bulk
 * Perform bulk operations on multiple cards.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<BulkOperationBody>(request);
  if (!parsed.ok) return parsed.response;

  const { action, card_ids, target_list_id, user_id, label_id, priority } = parsed.body;

  if (!action || !VALID_ACTIONS.includes(action)) {
    return errorResponse(`action must be one of: ${VALID_ACTIONS.join(', ')}`);
  }

  if (!card_ids || !Array.isArray(card_ids) || card_ids.length === 0) {
    return errorResponse('card_ids must be a non-empty array');
  }

  // Use service role client to bypass RLS on card_placements, cards, etc.
  const supabase = getAdminClient() ?? auth.ctx.supabase;

  let result;

  switch (action) {
    case 'move':
      if (!target_list_id) return errorResponse('target_list_id is required for move action');
      result = await bulkMoveCards(supabase, card_ids, target_list_id);
      break;

    case 'assign':
      if (!user_id) return errorResponse('user_id is required for assign action');
      result = await bulkAssign(supabase, card_ids, user_id);
      break;

    case 'add_label':
      if (!label_id) return errorResponse('label_id is required for add_label action');
      result = await bulkAddLabel(supabase, card_ids, label_id);
      break;

    case 'delete':
      result = await bulkDelete(supabase, card_ids);
      break;

    case 'set_priority':
      if (!priority) return errorResponse('priority is required for set_priority action');
      result = await bulkSetPriority(supabase, card_ids, priority);
      break;

    case 'archive':
      result = await bulkArchive(supabase, card_ids);
      break;
  }

  return successResponse(result);
}
