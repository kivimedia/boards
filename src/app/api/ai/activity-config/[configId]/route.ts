import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { updateActivityConfig, deleteActivityConfig } from '@/lib/ai/cost-profiling';

interface Params {
  params: { configId: string };
}

interface UpdateConfigBody {
  provider?: string;
  model_id?: string;
  weight?: number;
  is_active?: boolean;
  max_tokens?: number;
  temperature?: number;
}

/**
 * PATCH /api/ai/activity-config/[configId]
 * Update an activity config.
 *
 * Body (partial):
 *   provider?: string
 *   model_id?: string
 *   weight?: number
 *   is_active?: boolean
 *   max_tokens?: number
 *   temperature?: number
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateConfigBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const { configId } = params;
  const updates = body.body;

  try {
    const updated = await updateActivityConfig(supabase, configId, updates);

    if (!updated) {
      return errorResponse('Activity config not found or update failed', 404);
    }

    return successResponse(updated);
  } catch (err) {
    return errorResponse(
      `Failed to update activity config: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

/**
 * DELETE /api/ai/activity-config/[configId]
 * Delete an activity config.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { configId } = params;

  try {
    await deleteActivityConfig(supabase, configId);
    return successResponse({ deleted: true });
  } catch (err) {
    return errorResponse(
      `Failed to delete activity config: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
