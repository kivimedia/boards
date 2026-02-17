import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { updateSavedFilter, deleteSavedFilter } from '@/lib/saved-filters';

interface Params {
  params: { id: string; filterId: string };
}

interface UpdateSavedFilterBody {
  name?: string;
  filter_config?: Record<string, unknown>;
  is_default?: boolean;
  is_shared?: boolean;
}

/**
 * PATCH /api/boards/[id]/saved-filters/[filterId]
 * Update a saved filter.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<UpdateSavedFilterBody>(request);
  if (!parsed.ok) return parsed.response;

  const { supabase, userId } = auth.ctx;

  const updates: Record<string, unknown> = {};

  if (parsed.body.name !== undefined) {
    if (!parsed.body.name.trim()) return errorResponse('name cannot be empty');
    updates.name = parsed.body.name.trim();
  }
  if (parsed.body.filter_config !== undefined) {
    updates.filter_config = parsed.body.filter_config;
  }
  if (parsed.body.is_default !== undefined) {
    updates.is_default = parsed.body.is_default;
  }
  if (parsed.body.is_shared !== undefined) {
    updates.is_shared = parsed.body.is_shared;
  }

  const filter = await updateSavedFilter(supabase, params.filterId, userId, updates);

  return successResponse(filter);
}

/**
 * DELETE /api/boards/[id]/saved-filters/[filterId]
 * Delete a saved filter.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  await deleteSavedFilter(supabase, params.filterId, userId);

  return successResponse(null);
}
