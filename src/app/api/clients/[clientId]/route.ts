import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { clientId: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', params.clientId)
    .single();

  if (error) return errorResponse('Client not found', 404);
  return successResponse(data);
}

interface UpdateClientBody {
  name?: string;
  company?: string;
  contacts?: { name: string; email: string; phone?: string; role?: string }[];
  client_tag?: string;
  contract_type?: string;
  notes?: string;
  email?: string;
  phone?: string;
  location?: string;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateClientBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const updates: Record<string, unknown> = {};

  if (body.body.name !== undefined) {
    if (!body.body.name.trim()) return errorResponse('Client name cannot be empty');
    updates.name = body.body.name.trim();
  }
  if (body.body.company !== undefined) updates.company = body.body.company?.trim() || null;
  if (body.body.contacts !== undefined) updates.contacts = body.body.contacts;
  if (body.body.client_tag !== undefined) updates.client_tag = body.body.client_tag?.trim() || null;
  if (body.body.contract_type !== undefined) updates.contract_type = body.body.contract_type?.trim() || null;
  if (body.body.notes !== undefined) updates.notes = body.body.notes?.trim() || null;
  if (body.body.email !== undefined) updates.email = body.body.email?.trim() || null;
  if (body.body.phone !== undefined) updates.phone = body.body.phone?.trim() || null;
  if (body.body.location !== undefined) updates.location = body.body.location?.trim() || null;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', params.clientId)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { error } = await supabase.from('clients').delete().eq('id', params.clientId);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true });
}
