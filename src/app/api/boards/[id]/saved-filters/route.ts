import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getSavedFilters, createSavedFilter } from '@/lib/saved-filters';

interface Params {
  params: { id: string };
}

/**
 * GET /api/boards/[id]/saved-filters
 * List saved filters for the board.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const filters = await getSavedFilters(supabase, params.id, userId);

  return successResponse(filters);
}

interface CreateSavedFilterBody {
  name: string;
  filter_config: Record<string, unknown>;
  is_default?: boolean;
  is_shared?: boolean;
}

/**
 * POST /api/boards/[id]/saved-filters
 * Create a saved filter for the board.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<CreateSavedFilterBody>(request);
  if (!parsed.ok) return parsed.response;

  const { name, filter_config, is_default, is_shared } = parsed.body;

  if (!name?.trim()) return errorResponse('name is required');

  const { supabase, userId } = auth.ctx;

  const filter = await createSavedFilter(supabase, {
    board_id: params.id,
    user_id: userId,
    name: name.trim(),
    filter_config,
    is_default,
    is_shared,
  });

  return successResponse(filter, 201);
}
