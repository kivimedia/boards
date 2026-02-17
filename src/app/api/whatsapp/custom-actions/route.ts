import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getCustomActions, createCustomAction } from '@/lib/whatsapp-advanced';

/**
 * GET /api/whatsapp/custom-actions
 * List the current user's custom WhatsApp actions.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  try {
    const actions = await getCustomActions(supabase, userId);
    return successResponse(actions);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : 'Failed to load custom actions',
      500
    );
  }
}

interface CreateCustomActionBody {
  keyword: string;
  label: string;
  action_type: string;
  action_config?: Record<string, unknown>;
  response_template?: string;
}

/**
 * POST /api/whatsapp/custom-actions
 * Create a new custom WhatsApp action.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<CreateCustomActionBody>(request);
  if (!parsed.ok) return parsed.response;

  const { keyword, label, action_type, action_config, response_template } = parsed.body;

  if (!keyword?.trim()) return errorResponse('keyword is required');
  if (!label?.trim()) return errorResponse('label is required');
  if (!action_type?.trim()) return errorResponse('action_type is required');

  const { supabase, userId } = auth.ctx;

  const action = await createCustomAction(supabase, {
    userId,
    keyword: keyword.trim(),
    label: label.trim(),
    actionType: action_type.trim(),
    actionConfig: action_config,
    responseTemplate: response_template,
  });

  if (!action) return errorResponse('Failed to create custom action', 500);
  return successResponse(action, 201);
}
