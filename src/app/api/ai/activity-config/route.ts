import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getActivityConfigs, createActivityConfig } from '@/lib/ai/cost-profiling';

/**
 * GET /api/ai/activity-config
 * List activity configs. Optionally filter by activity.
 * Query params:
 *   activity?: string - filter by activity name
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const activity = searchParams.get('activity') ?? undefined;

  try {
    const configs = await getActivityConfigs(supabase, activity);
    return successResponse(configs);
  } catch (err) {
    return errorResponse(
      `Failed to fetch activity configs: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

interface CreateConfigBody {
  activity: string;
  provider: string;
  modelId: string;
  weight?: number;
  maxTokens?: number;
  temperature?: number;
}

/**
 * POST /api/ai/activity-config
 * Create a new activity config.
 *
 * Body:
 *   activity: string (required)
 *   provider: string (required)
 *   modelId: string (required)
 *   weight?: number (default 100)
 *   maxTokens?: number (default 4096)
 *   temperature?: number (default 0.7)
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateConfigBody>(request);
  if (!body.ok) return body.response;

  const { activity, provider, modelId, weight, maxTokens, temperature } = body.body;
  const { supabase } = auth.ctx;

  if (!activity) return errorResponse('activity is required');
  if (!provider) return errorResponse('provider is required');
  if (!modelId) return errorResponse('modelId is required');

  try {
    const config = await createActivityConfig(supabase, {
      activity,
      provider,
      modelId,
      weight,
      maxTokens,
      temperature,
    });

    if (!config) {
      return errorResponse('Failed to create activity config', 500);
    }

    return successResponse(config, 201);
  } catch (err) {
    return errorResponse(
      `Failed to create activity config: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
