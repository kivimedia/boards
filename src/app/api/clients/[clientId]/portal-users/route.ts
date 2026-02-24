import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getPortalUsers, upsertPortalUser } from '@/lib/client-portal';

interface Params {
  params: { clientId: string };
}

/**
 * GET /api/clients/[clientId]/portal-users
 * Get all active portal users for a client.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  try {
    const users = await getPortalUsers(supabase, params.clientId);
    return successResponse(users);
  } catch (err) {
    return errorResponse(
      `Failed to fetch portal users: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

interface UpsertPortalUserBody {
  email: string;
  name: string;
  isPrimary?: boolean;
}

/**
 * POST /api/clients/[clientId]/portal-users
 * Create or update a client portal user.
 *
 * Body:
 *   email: string (required)
 *   name: string (required)
 *   isPrimary?: boolean
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpsertPortalUserBody>(request);
  if (!body.ok) return body.response;

  const { email, name, isPrimary } = body.body;
  if (!email) return errorResponse('email is required');
  if (!name) return errorResponse('name is required');

  const { supabase } = auth.ctx;

  try {
    const user = await upsertPortalUser(supabase, params.clientId, email, name, isPrimary ?? false);
    if (!user) {
      return errorResponse('Failed to create or update portal user', 500);
    }
    return successResponse(user, 201);
  } catch (err) {
    return errorResponse(
      `Failed to upsert portal user: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
