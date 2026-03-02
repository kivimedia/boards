import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: Promise<{ clientId: string }>;
}

/**
 * GET /api/clients/[clientId]/team
 * List team members assigned to this client.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { clientId } = await params;

  try {
    const { data, error } = await auth.ctx.supabase
      .from('client_team_members')
      .select('id, client_id, user_id, role, created_at, profile:profiles!client_team_members_user_id_fkey(id, display_name, avatar_url, agency_role)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return successResponse(data ?? []);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to fetch team', 500);
  }
}

interface AddBody {
  user_id: string;
  role?: string;
}

/**
 * POST /api/clients/[clientId]/team
 * Add a team member to this client.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<AddBody>(request);
  if (!body.ok) return body.response;

  const { clientId } = await params;
  const { user_id, role } = body.body;

  if (!user_id) return errorResponse('user_id is required');

  try {
    const { data, error } = await auth.ctx.supabase
      .from('client_team_members')
      .upsert(
        { client_id: clientId, user_id, role: role || 'member' },
        { onConflict: 'client_id,user_id' }
      )
      .select('id, client_id, user_id, role, created_at, profile:profiles!client_team_members_user_id_fkey(id, display_name, avatar_url, agency_role)')
      .single();

    if (error) throw new Error(error.message);
    return successResponse(data, 201);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to add team member', 500);
  }
}

interface DeleteBody {
  user_id: string;
}

/**
 * DELETE /api/clients/[clientId]/team
 * Remove a team member from this client.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<DeleteBody>(request);
  if (!body.ok) return body.response;

  const { clientId } = await params;
  const { user_id } = body.body;

  if (!user_id) return errorResponse('user_id is required');

  try {
    const { error } = await auth.ctx.supabase
      .from('client_team_members')
      .delete()
      .eq('client_id', clientId)
      .eq('user_id', user_id);

    if (error) throw new Error(error.message);
    return successResponse({ deleted: true });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to remove team member', 500);
  }
}
