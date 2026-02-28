import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

/**
 * POST /api/pageforge/builds/[id]/preview
 * Generate a new preview token for this build.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const buildId = params.id;

  // Verify the build exists
  const { data: build, error: buildErr } = await auth.ctx.supabase
    .from('pageforge_builds')
    .select('id')
    .eq('id', buildId)
    .single();

  if (buildErr || !build) {
    return errorResponse('Build not found', 404);
  }

  // Create the preview token
  const { data: token, error: tokenErr } = await auth.ctx.supabase
    .from('pageforge_preview_tokens')
    .insert({
      build_id: buildId,
      created_by: auth.ctx.userId,
    })
    .select()
    .single();

  if (tokenErr || !token) {
    return errorResponse('Failed to create preview token', 500);
  }

  return successResponse({
    token: token.token,
    preview_url: `/pageforge/preview/${token.token}`,
    expires_at: token.expires_at,
    id: token.id,
  }, 201);
}

/**
 * GET /api/pageforge/builds/[id]/preview
 * Get all active (non-revoked, non-expired) tokens for this build.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const buildId = params.id;

  const { data: tokens, error } = await auth.ctx.supabase
    .from('pageforge_preview_tokens')
    .select('*')
    .eq('build_id', buildId)
    .eq('is_revoked', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    return errorResponse('Failed to fetch tokens', 500);
  }

  return successResponse({ tokens: tokens || [] });
}

/**
 * DELETE /api/pageforge/builds/[id]/preview
 * Revoke a specific token. Body: { token_id: string }
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  let body: { token_id?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  if (!body.token_id) {
    return errorResponse('token_id is required');
  }

  const { error } = await auth.ctx.supabase
    .from('pageforge_preview_tokens')
    .update({ is_revoked: true })
    .eq('id', body.token_id)
    .eq('build_id', params.id)
    .eq('created_by', auth.ctx.userId);

  if (error) {
    return errorResponse('Failed to revoke token', 500);
  }

  return successResponse({ revoked: true });
}
