import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * GET /api/team-pr/territories/[id]
 * Get a single territory by ID (verify user_id matches)
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
    .from('pr_territories')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error) return errorResponse('Territory not found', 404);
  return successResponse(data);
}

/**
 * PATCH /api/team-pr/territories/[id]
 * Update territory fields
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{
    name?: string;
    country_code?: string;
    language?: string;
    market_data?: Record<string, unknown>;
    signal_keywords?: string[];
    seed_outlets?: Array<Record<string, unknown>>;
    seasonal_calendar?: Record<string, unknown>;
    pitch_norms?: string;
  }>(request);
  if (!body.ok) return body.response;

  const { supabase, userId } = auth.ctx;
  const { id } = params;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  const allowedFields = [
    'name', 'country_code', 'language', 'market_data',
    'signal_keywords', 'seed_outlets', 'seasonal_calendar', 'pitch_norms',
  ] as const;

  for (const field of allowedFields) {
    if (body.body[field] !== undefined) {
      updates[field] = body.body[field];
    }
  }

  const { data, error } = await supabase
    .from('pr_territories')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

/**
 * DELETE /api/team-pr/territories/[id]
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
    .from('pr_territories')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true, id: data.id });
}
