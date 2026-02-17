import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { DoorStatus } from '@/lib/types';

interface Params {
  params: { clientId: string; doorId: string };
}

interface UpdateDoorBody {
  title?: string;
  description?: string;
  status?: DoorStatus;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateDoorBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const updates: Record<string, unknown> = {};

  if (body.body.title !== undefined) {
    if (!body.body.title.trim()) return errorResponse('Door title cannot be empty');
    updates.title = body.body.title.trim();
  }
  if (body.body.description !== undefined) updates.description = body.body.description?.trim() || null;
  if (body.body.status !== undefined) updates.status = body.body.status;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const { data, error } = await supabase
    .from('doors')
    .update(updates)
    .eq('id', params.doorId)
    .eq('client_id', params.clientId)
    .select('*, keys:door_keys(*)')
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { error } = await supabase
    .from('doors')
    .delete()
    .eq('id', params.doorId)
    .eq('client_id', params.clientId);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true });
}
