import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { encryptToHex } from '@/lib/encryption';

interface Params {
  params: { clientId: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { data, error } = await supabase
    .from('credential_entries')
    .select('id, platform, category, created_at, updated_at')
    .eq('client_id', params.clientId)
    .order('created_at', { ascending: false });

  if (error) return errorResponse(error.message, 500);

  // Log audit entries for each credential viewed in the list
  if (data && data.length > 0) {
    const auditEntries = data.map((cred) => ({
      credential_id: cred.id,
      user_id: userId,
      action: 'viewed',
    }));
    await supabase.from('credential_audit_log').insert(auditEntries);
  }

  return successResponse(data);
}

interface CreateCredentialBody {
  platform: string;
  username?: string;
  password?: string;
  notes?: string;
  category?: string;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateCredentialBody>(request);
  if (!body.ok) return body.response;

  const { platform, username, password, notes, category } = body.body;
  if (!platform?.trim()) return errorResponse('Platform is required');

  const { supabase, userId } = auth.ctx;
  const { data, error } = await supabase
    .from('credential_entries')
    .insert({
      client_id: params.clientId,
      platform: platform.trim(),
      username_encrypted: username ? encryptToHex(username) : null,
      password_encrypted: password ? encryptToHex(password) : null,
      notes_encrypted: notes ? encryptToHex(notes) : null,
      category: category?.trim() || 'general',
      created_by: userId,
    })
    .select('id, platform, category, created_at, updated_at')
    .single();

  if (error) return errorResponse(error.message, 500);

  // Log creation audit entry
  await supabase.from('credential_audit_log').insert({
    credential_id: data.id,
    user_id: userId,
    action: 'created',
  });

  return successResponse(data, 201);
}
