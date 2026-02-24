import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { canMakeAICall } from '@/lib/ai/budget-checker';
import type { AIProvider, AIActivity } from '@/lib/types';

const VALID_PROVIDERS: AIProvider[] = ['anthropic', 'openai', 'google', 'browserless'];

const VALID_ACTIVITIES: AIActivity[] = [
  'chatbot_ticket', 'chatbot_board', 'chatbot_global',
  'email_draft', 'brief_assist', 'image_prompt_enhance',
  'proposal_generation', 'lead_triage', 'follow_up_draft', 'friendor_email',
];

interface CheckBudgetBody {
  provider: AIProvider;
  activity: AIActivity;
  userId?: string;
  boardId?: string;
}

/**
 * POST /api/ai/budget/check
 * Check if an AI call is allowed under current budget constraints.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CheckBudgetBody>(request);
  if (!body.ok) return body.response;

  const { provider, activity, userId, boardId } = body.body;

  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return errorResponse(`Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}`);
  }
  if (!activity || !VALID_ACTIVITIES.includes(activity)) {
    return errorResponse(`Invalid activity. Must be one of: ${VALID_ACTIVITIES.join(', ')}`);
  }

  const { supabase } = auth.ctx;

  try {
    const result = await canMakeAICall(supabase, {
      provider,
      activity,
      userId: userId || auth.ctx.userId,
      boardId,
    });

    return successResponse(result);
  } catch (err) {
    console.error('[AI Budget Check] Error:', err);
    return errorResponse('Failed to check budget', 500);
  }
}
