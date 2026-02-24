import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { toggleIPWhitelistEntry, removeIPWhitelistEntry } from '@/lib/enterprise';

interface Params {
  params: { entryId: string };
}

interface ToggleIPWhitelistBody {
  is_active: boolean;
}

/**
 * PATCH /api/enterprise/ip-whitelist/[entryId]
 * Toggle an IP whitelist entry's active status.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<ToggleIPWhitelistBody>(request);
  if (!parsed.ok) return parsed.response;

  const { is_active } = parsed.body;

  if (typeof is_active !== 'boolean') return errorResponse('is_active must be a boolean');

  const { supabase } = auth.ctx;
  const { entryId } = params;

  await toggleIPWhitelistEntry(supabase, entryId, is_active);
  return successResponse({ id: entryId, is_active });
}

/**
 * DELETE /api/enterprise/ip-whitelist/[entryId]
 * Remove an IP whitelist entry.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { entryId } = params;

  await removeIPWhitelistEntry(supabase, entryId);
  return successResponse({ deleted: true });
}
