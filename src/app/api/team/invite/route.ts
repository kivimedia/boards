import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface InviteBody {
  email: string;
  display_name: string;
}

/**
 * POST /api/team/invite
 * Invite a new user by email. Creates an auth user + profile, marks them active.
 * Requires the caller to be an admin or agency_owner.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Check if requester has permission (agency_owner or admin)
  const { data: requester } = await supabase
    .from('profiles')
    .select('agency_role, user_role')
    .eq('id', userId)
    .single();

  if (requester?.agency_role !== 'agency_owner' && requester?.user_role !== 'admin') {
    return errorResponse('Only agency owners or admins can invite users', 403);
  }

  const body = await parseBody<InviteBody>(request);
  if (!body.ok) return body.response;

  const { email, display_name } = body.body;
  if (!email?.trim()) return errorResponse('email is required');
  if (!display_name?.trim()) return errorResponse('display_name is required');

  // Need service role key for auth.admin
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return errorResponse('Server is not configured for user invitations (missing service role key)', 500);
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );

  try {
    // Check if user already exists
    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('id, display_name')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();

    if (existingProfile) {
      // User already exists — just return their profile
      return successResponse(existingProfile);
    }

    // Create user directly via admin API (no email sent — avoids rate limits)
    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email: email.trim(),
      email_confirm: true,
      user_metadata: {
        display_name: display_name.trim(),
      },
    });

    if (createError || !createData.user) {
      return errorResponse(createError?.message || 'Failed to create user', 500);
    }

    const newUserId = createData.user.id;

    // The handle_new_user trigger creates the profile row automatically.
    // Update it to active since an admin is explicitly inviting them.
    // Small delay to allow trigger to complete.
    await new Promise((r) => setTimeout(r, 500));

    await adminClient
      .from('profiles')
      .update({
        account_status: 'active',
        display_name: display_name.trim(),
      })
      .eq('id', newUserId);

    // Fetch the final profile to return
    const { data: profile } = await adminClient
      .from('profiles')
      .select('id, display_name, avatar_url, role')
      .eq('id', newUserId)
      .single();

    return successResponse(profile);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to invite user';
    return errorResponse(message, 500);
  }
}
