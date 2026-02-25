import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthContext, successResponse, errorResponse, parseBody, requireFeatureAccess } from '@/lib/api-helpers';
import { getOrCreateClientBoard } from '@/lib/client-board-sync';

/**
 * GET /api/admin/client-users?clientId=xxx
 * List auth users linked to a specific client.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const denied = await requireFeatureAccess(auth.ctx.supabase, auth.ctx.userId, 'user_management');
  if (denied) return denied;

  const clientId = request.nextUrl.searchParams.get('clientId');
  if (!clientId) return errorResponse('clientId query param required');

  const { supabase } = auth.ctx;
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, user_role, account_status, created_at')
    .eq('client_id', clientId)
    .eq('user_role', 'client');

  if (error) return errorResponse(error.message, 500);

  // Get emails from auth.users via admin API
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || !profiles || profiles.length === 0) {
    return successResponse(profiles || []);
  }

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
  const { data: authData } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = new Map<string, string>();
  if (authData?.users) {
    for (const u of authData.users) {
      if (u.email) emailMap.set(u.id, u.email);
    }
  }

  const result = profiles.map((p) => ({
    ...p,
    email: emailMap.get(p.id) || null,
  }));

  return successResponse(result);
}

interface CreateClientUserBody {
  clientId: string;
  email: string;
  password: string;
  displayName: string;
}

/**
 * POST /api/admin/client-users
 * Create a new auth user linked to a client with email/password login.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const denied = await requireFeatureAccess(auth.ctx.supabase, auth.ctx.userId, 'user_management');
  if (denied) return denied;

  const body = await parseBody<CreateClientUserBody>(request);
  if (!body.ok) return body.response;

  const { clientId, email, password, displayName } = body.body;
  if (!clientId || !email || !password || !displayName) {
    return errorResponse('clientId, email, password, and displayName are required');
  }

  if (password.length < 6) {
    return errorResponse('Password must be at least 6 characters');
  }

  // Verify client exists
  const { data: client } = await auth.ctx.supabase
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .single();

  if (!client) return errorResponse('Client not found', 404);

  // Create auth user via admin API
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return errorResponse('Server configuration error', 500);

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
      user_role: 'client',
      client_id: clientId,
    },
  });

  if (createError) {
    return errorResponse(createError.message, 400);
  }

  // Ensure client board exists
  try {
    await getOrCreateClientBoard(adminClient, clientId);
  } catch {
    // Non-critical: board can be created later
  }

  return successResponse(
    { id: newUser.user.id, email: newUser.user.email, display_name: displayName },
    201
  );
}
