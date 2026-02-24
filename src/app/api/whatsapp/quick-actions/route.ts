import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getQuickActions, createQuickAction } from '@/lib/whatsapp';

/**
 * GET /api/whatsapp/quick-actions
 * List all active quick actions.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const actions = await getQuickActions(supabase);

  return successResponse(actions);
}

interface CreateQuickActionBody {
  keyword: string;
  action_type: string;
  description?: string;
  action_config?: Record<string, unknown>;
}

/**
 * POST /api/whatsapp/quick-actions
 * Create a new quick action.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<CreateQuickActionBody>(request);
  if (!parsed.ok) return parsed.response;

  const { keyword, action_type, description, action_config } = parsed.body;

  if (!keyword?.trim()) {
    return errorResponse('keyword is required');
  }

  const validTypes = ['mark_done', 'approve', 'reject', 'assign', 'comment', 'snooze'];
  if (!action_type || !validTypes.includes(action_type)) {
    return errorResponse(`action_type must be one of: ${validTypes.join(', ')}`);
  }

  const { supabase } = auth.ctx;

  const action = await createQuickAction(supabase, {
    keyword: keyword.trim(),
    actionType: action_type,
    description: description?.trim(),
    actionConfig: action_config,
  });

  if (!action) {
    return errorResponse('Failed to create quick action', 500);
  }

  return successResponse(action, 201);
}
