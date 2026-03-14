import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * GET /api/team-pr/outlets/[id]
 * Single outlet detail
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
    .from('pr_outlets')
    .select(`
      *,
      run:pr_runs!inner(id, user_id, client_id, status)
    `)
    .eq('id', id)
    .eq('run.user_id', userId)
    .single();

  if (error) return errorResponse('Outlet not found', 404);
  return successResponse(data);
}

/**
 * PATCH /api/team-pr/outlets/[id]
 * Edit outlet (contact info, notes, manual corrections)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{
    name?: string;
    outlet_code?: string;
    outlet_type?: string;
    contact_name?: string;
    contact_email?: string;
    contact_role?: string;
    website_url?: string;
    domain_authority?: number;
    notes?: string;
    manual_corrections?: Record<string, unknown>;
  }>(request);
  if (!body.ok) return body.response;

  const { supabase, userId } = auth.ctx;
  const { id } = params;

  // Verify ownership via run
  const { data: outlet, error: checkError } = await supabase
    .from('pr_outlets')
    .select('id, run:pr_runs!inner(user_id)')
    .eq('id', id)
    .eq('run.user_id', userId)
    .single();

  if (checkError || !outlet) return errorResponse('Outlet not found', 404);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  const allowedFields = [
    'name', 'outlet_code', 'outlet_type', 'contact_name',
    'contact_email', 'contact_role', 'website_url',
    'domain_authority', 'notes', 'manual_corrections',
  ] as const;

  for (const field of allowedFields) {
    if (body.body[field] !== undefined) {
      updates[field] = body.body[field];
    }
  }

  const { data, error } = await supabase
    .from('pr_outlets')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
