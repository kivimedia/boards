import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { encryptToHex, decryptFromHex } from '@/lib/encryption';

interface Params {
  params: { clientId: string; credentialId: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { data, error } = await supabase
    .from('credential_entries')
    .select('*')
    .eq('id', params.credentialId)
    .eq('client_id', params.clientId)
    .single();

  if (error || !data) return errorResponse('Credential not found', 404);

  // Log viewed audit entry
  await supabase.from('credential_audit_log').insert({
    credential_id: data.id,
    user_id: userId,
    action: 'viewed',
  });

  // Decrypt fields
  const decrypted = {
    id: data.id,
    client_id: data.client_id,
    platform: data.platform,
    username: data.username_encrypted ? decryptFromHex(data.username_encrypted) : null,
    password: data.password_encrypted ? decryptFromHex(data.password_encrypted) : null,
    notes: data.notes_encrypted ? decryptFromHex(data.notes_encrypted) : null,
    category: data.category,
    created_by: data.created_by,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };

  return successResponse(decrypted);
}

interface UpdateCredentialBody {
  platform?: string;
  username?: string;
  password?: string;
  notes?: string;
  category?: string;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateCredentialBody>(request);
  if (!body.ok) return body.response;

  const { supabase, userId } = auth.ctx;
  const updates: Record<string, unknown> = {};

  if (body.body.platform !== undefined) {
    if (!body.body.platform.trim()) return errorResponse('Platform cannot be empty');
    updates.platform = body.body.platform.trim();
  }
  if (body.body.username !== undefined) {
    updates.username_encrypted = body.body.username ? encryptToHex(body.body.username) : null;
  }
  if (body.body.password !== undefined) {
    updates.password_encrypted = body.body.password ? encryptToHex(body.body.password) : null;
  }
  if (body.body.notes !== undefined) {
    updates.notes_encrypted = body.body.notes ? encryptToHex(body.body.notes) : null;
  }
  if (body.body.category !== undefined) {
    updates.category = body.body.category.trim() || 'general';
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const { data, error } = await supabase
    .from('credential_entries')
    .update(updates)
    .eq('id', params.credentialId)
    .eq('client_id', params.clientId)
    .select('id, platform, category, created_at, updated_at')
    .single();

  if (error) return errorResponse(error.message, 500);

  // Log updated audit entry
  await supabase.from('credential_audit_log').insert({
    credential_id: params.credentialId,
    user_id: userId,
    action: 'updated',
  });

  return successResponse(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Log deleted audit entry before deleting
  await supabase.from('credential_audit_log').insert({
    credential_id: params.credentialId,
    user_id: userId,
    action: 'deleted',
  });

  const { error } = await supabase
    .from('credential_entries')
    .delete()
    .eq('id', params.credentialId)
    .eq('client_id', params.clientId);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true });
}
