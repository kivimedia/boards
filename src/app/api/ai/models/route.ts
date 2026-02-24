import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getAllModelConfigs } from '@/lib/ai/model-resolver';
import type { AIProvider, AIActivity } from '@/lib/types';

const VALID_PROVIDERS: AIProvider[] = ['anthropic', 'openai', 'google', 'browserless'];

const VALID_ACTIVITIES: AIActivity[] = [
  'chatbot_ticket', 'chatbot_board', 'chatbot_global',
  'email_draft', 'brief_assist', 'image_prompt_enhance',
  'proposal_generation', 'lead_triage', 'follow_up_draft', 'friendor_email',
];

/**
 * GET /api/ai/models
 * List all active model configurations.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const configs = await getAllModelConfigs(supabase);
  return successResponse(configs);
}

interface CreateModelConfigBody {
  activity: AIActivity;
  provider: AIProvider;
  model_id: string;
  temperature?: number;
  max_tokens?: number;
}

/**
 * POST /api/ai/models
 * Create a new model configuration.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateModelConfigBody>(request);
  if (!body.ok) return body.response;

  const { activity, provider, model_id, temperature, max_tokens } = body.body;

  if (!activity || !VALID_ACTIVITIES.includes(activity)) {
    return errorResponse(`Invalid activity. Must be one of: ${VALID_ACTIVITIES.join(', ')}`);
  }
  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return errorResponse(`Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}`);
  }
  if (!model_id?.trim()) {
    return errorResponse('model_id is required');
  }
  if (temperature !== undefined && (typeof temperature !== 'number' || temperature < 0 || temperature > 2)) {
    return errorResponse('temperature must be a number between 0 and 2');
  }
  if (max_tokens !== undefined && (typeof max_tokens !== 'number' || max_tokens < 1)) {
    return errorResponse('max_tokens must be a positive number');
  }

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('ai_model_config')
    .insert({
      activity,
      provider,
      model_id: model_id.trim(),
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 4096,
      is_active: true,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
