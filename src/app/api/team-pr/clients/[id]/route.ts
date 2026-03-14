import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * GET /api/team-pr/clients/[id]
 * Get a single PR client by ID (verify user_id matches)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { id } = params;

  const { data, error } = await supabase
    .from('pr_clients')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error) return errorResponse('Client not found', 404);
  return successResponse(data);
}

/**
 * PATCH /api/team-pr/clients/[id]
 * Update client fields
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{
    name?: string;
    company?: string;
    industry?: string;
    website?: string;
    brand_voice?: Record<string, unknown>;
    pitch_angles?: Array<Record<string, unknown>>;
    tone_rules?: Record<string, unknown>;
    bio?: string;
    headshot_url?: string;
    media_kit_url?: string;
    exclusion_list?: string[];
    target_markets?: string[];
  }>(request);
  if (!body.ok) return body.response;

  const { supabase, userId } = auth.ctx;
  const { id } = params;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  const allowedFields = [
    'name', 'company', 'industry', 'website', 'brand_voice',
    'pitch_angles', 'tone_rules', 'bio', 'headshot_url',
    'media_kit_url', 'exclusion_list', 'target_markets',
  ] as const;

  for (const field of allowedFields) {
    if (body.body[field] !== undefined) {
      updates[field] = body.body[field];
    }
  }

  const { data, error } = await supabase
    .from('pr_clients')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

/**
 * DELETE /api/team-pr/clients/[id]
 * Soft delete - set is_active=false
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { id } = params;

  const { data, error } = await supabase
    .from('pr_clients')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true, id: data.id });
}
