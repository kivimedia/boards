import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse, parseBody, successResponse } from '@/lib/api-helpers';

interface Params {
  params: { identityId: string };
}

interface UpdateIdentityBody {
  client_id?: string;
  contact_name?: string;
  confirm?: boolean;
}

/**
 * PATCH /api/meetings/identities/[identityId]
 * Update or confirm a single participant identity.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateIdentityBody>(request);
  if (!body.ok) return body.response;

  const { supabase, userId } = auth.ctx;
  const { identityId } = params;
  const { client_id, contact_name, confirm } = body.body;

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (client_id !== undefined) {
    updates.client_id = client_id || null;
  }

  if (contact_name !== undefined) {
    updates.contact_name = contact_name?.trim() || null;
  }

  if (confirm) {
    updates.confirmed_at = new Date().toISOString();
    updates.confirmed_by = userId;
    updates.source = 'manual';
    updates.confidence = 'high';
  }

  const { data, error } = await supabase
    .from('participant_identities')
    .update(updates)
    .eq('id', identityId)
    .select(`
      id,
      email,
      display_name,
      fathom_speaker_name,
      client_id,
      contact_name,
      source,
      confidence,
      confirmed_at,
      confirmed_by,
      created_at,
      updated_at,
      clients:client_id (id, name)
    `)
    .single();

  if (error) {
    return errorResponse(error.message, 500);
  }

  return successResponse(data);
}

/**
 * DELETE /api/meetings/identities/[identityId]
 * Delete a participant identity.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { identityId } = params;

  const { error } = await supabase
    .from('participant_identities')
    .delete()
    .eq('id', identityId);

  if (error) {
    return errorResponse(error.message, 500);
  }

  return successResponse({ deleted: true });
}
