import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthContext, successResponse, errorResponse, parseBody, requireFeatureAccess } from '@/lib/api-helpers';
import { UserRole } from '@/lib/types';
import { ALL_ROLES } from '@/lib/permissions';
import { getOrCreateClientBoard } from '@/lib/client-board-sync';

/** Helper: get admin Supabase client with service role */
function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );
}

/**
 * GET /api/settings/users
 * List all profiles with user_role and email. Admin only.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const denied = await requireFeatureAccess(supabase, userId, 'user_management');
  if (denied) return denied;

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .order('display_name', { ascending: true });

  if (error) {
    return errorResponse(error.message, 500);
  }

  // Fetch emails from auth.users via admin API
  const adminClient = getAdminClient();
  let emailMap = new Map<string, string>();
  if (adminClient) {
    try {
      const { data: { users } } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      for (const u of users) {
        if (u.email) emailMap.set(u.id, u.email);
      }
    } catch {
      // If admin API fails, emails just won't be included
    }
  }

  const profilesWithRole = (profiles || []).map((p) => ({
    ...p,
    user_role: p.user_role || 'member',
    email: p.email || emailMap.get(p.id) || null,
  }));

  return successResponse(profilesWithRole);
}

interface UpdateUserBody {
  user_id: string;
  user_role?: UserRole;
  display_name?: string;
  email?: string;
}

/**
 * PATCH /api/settings/users
 * Update a user's user_role, display_name, or email. Admin only.
 * Body: { user_id: string, user_role?: UserRole, display_name?: string, email?: string }
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const denied = await requireFeatureAccess(supabase, userId, 'user_management');
  if (denied) return denied;

  const body = await parseBody<UpdateUserBody>(request);
  if (!body.ok) return body.response;

  const { user_id, user_role, display_name, email } = body.body;

  if (!user_id) {
    return errorResponse('user_id is required');
  }

  if (user_role) {
    if (!ALL_ROLES.includes(user_role)) {
      return errorResponse(`Invalid role. Must be one of: ${ALL_ROLES.join(', ')}`);
    }

    // Prevent admin from changing their own role
    if (user_id === userId) {
      return errorResponse('You cannot change your own role');
    }
  }

  // Build profile update
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profileUpdate: Record<string, any> = {};
  if (user_role) profileUpdate.user_role = user_role;
  if (display_name?.trim()) profileUpdate.display_name = display_name.trim();

  // Update profile fields
  if (Object.keys(profileUpdate).length > 0) {
    const { error } = await supabase
      .from('profiles')
      .update(profileUpdate)
      .eq('id', user_id);

    if (error) {
      return errorResponse(error.message, 500);
    }
  }

  // If role changed to 'client', auto-create a clients record and link it
  if (user_role === 'client') {
    const adminClient = getAdminClient();
    if (adminClient) {
      // Check if this user already has a client_id
      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('client_id, display_name, email')
        .eq('id', user_id)
        .single();

      if (currentProfile && !currentProfile.client_id) {
        // Create a new clients record
        const clientName = display_name?.trim() || currentProfile.display_name || 'New Client';
        const clientEmail = email?.trim() || currentProfile.email || null;

        const { data: newClient } = await adminClient
          .from('clients')
          .insert({
            name: clientName,
            email: clientEmail,
            created_by: userId,
          })
          .select('id')
          .single();

        if (newClient) {
          // Link profile to client
          await adminClient
            .from('profiles')
            .update({ client_id: newClient.id })
            .eq('id', user_id);

          // Create client board
          try {
            await getOrCreateClientBoard(adminClient, newClient.id);
          } catch {
            // Non-critical: board can be created later
          }
        }
      }
    }
  }

  // Update email via admin API (requires service role)
  if (email?.trim()) {
    const adminClient = getAdminClient();
    if (!adminClient) {
      return errorResponse('Server is not configured for email changes (missing service role key)', 500);
    }

    const { error: emailError } = await adminClient.auth.admin.updateUserById(user_id, {
      email: email.trim(),
    });

    if (emailError) {
      return errorResponse(`Failed to update email: ${emailError.message}`, 500);
    }

    // Also update email in profiles table if the column exists
    await supabase
      .from('profiles')
      .update({ email: email.trim() })
      .eq('id', user_id);
  }

  // Fetch updated profile to return
  const { data, error: fetchError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user_id)
    .single();

  if (fetchError) {
    return errorResponse(fetchError.message, 500);
  }

  return successResponse(data);
}

interface DeleteUserBody {
  user_id: string;
  reassign_to: string;
}

/**
 * DELETE /api/settings/users
 * Delete a user and reassign their cards to another user. Admin only.
 * Body: { user_id: string, reassign_to: string }
 */
export async function DELETE(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const denied = await requireFeatureAccess(supabase, userId, 'user_management');
  if (denied) return denied;

  const body = await parseBody<DeleteUserBody>(request);
  if (!body.ok) return body.response;

  const { user_id, reassign_to } = body.body;

  if (!user_id || !reassign_to) {
    return errorResponse('user_id and reassign_to are required');
  }

  if (user_id === userId) {
    return errorResponse('You cannot delete your own account');
  }

  if (user_id === reassign_to) {
    return errorResponse('Cannot reassign cards to the same user being deleted');
  }

  // Verify both users exist
  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('id', reassign_to)
    .single();

  if (!targetProfile) {
    return errorResponse('Reassignment target user not found', 404);
  }

  const { data: deleteProfile } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('id', user_id)
    .single();

  if (!deleteProfile) {
    return errorResponse('User to delete not found', 404);
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return errorResponse('Server is not configured for user deletion (missing service role key)', 500);
  }

  try {
    // 1. Reassign card_assignees: delete old, insert new (avoiding duplicates)
    // First get all cards assigned to the user being deleted
    const { data: assignments } = await adminClient
      .from('card_assignees')
      .select('card_id')
      .eq('user_id', user_id);

    const cardIds = (assignments || []).map(a => a.card_id);

    if (cardIds.length > 0) {
      // Check which cards are already assigned to the target user
      const { data: existingAssignments } = await adminClient
        .from('card_assignees')
        .select('card_id')
        .eq('user_id', reassign_to)
        .in('card_id', cardIds);

      const alreadyAssigned = new Set((existingAssignments || []).map(a => a.card_id));

      // Delete all assignments from the old user
      await adminClient
        .from('card_assignees')
        .delete()
        .eq('user_id', user_id);

      // Insert assignments for the new user (only for cards they don't already have)
      const newAssignments = cardIds
        .filter(cardId => !alreadyAssigned.has(cardId))
        .map(cardId => ({ card_id: cardId, user_id: reassign_to }));

      if (newAssignments.length > 0) {
        // Insert in batches of 100
        for (let i = 0; i < newAssignments.length; i += 100) {
          const batch = newAssignments.slice(i, i + 100);
          await adminClient.from('card_assignees').insert(batch);
        }
      }
    }

    // 2. Remove from board_members
    await adminClient
      .from('board_members')
      .delete()
      .eq('user_id', user_id);

    // 3. Delete profile
    await adminClient
      .from('profiles')
      .delete()
      .eq('id', user_id);

    // 4. Delete auth user
    await adminClient.auth.admin.deleteUser(user_id);

    return successResponse({
      deleted: deleteProfile.display_name,
      reassigned_to: targetProfile.display_name,
      cards_reassigned: cardIds.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete user';
    return errorResponse(message, 500);
  }
}
