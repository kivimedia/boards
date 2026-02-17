import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { clientId: string; doorId: string; keyId: string };
}

interface UpdateKeyBody {
  title?: string;
  description?: string;
  is_completed?: boolean;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateKeyBody>(request);
  if (!body.ok) return body.response;

  const { supabase, userId } = auth.ctx;
  const updates: Record<string, unknown> = {};

  if (body.body.title !== undefined) {
    if (!body.body.title.trim()) return errorResponse('Key title cannot be empty');
    updates.title = body.body.title.trim();
  }
  if (body.body.description !== undefined) updates.description = body.body.description?.trim() || null;
  if (body.body.is_completed !== undefined) {
    updates.is_completed = body.body.is_completed;
    if (body.body.is_completed) {
      updates.completed_by = userId;
      updates.completed_at = new Date().toISOString();
    } else {
      updates.completed_by = null;
      updates.completed_at = null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const { data, error } = await supabase
    .from('door_keys')
    .update(updates)
    .eq('id', params.keyId)
    .eq('door_id', params.doorId)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { error } = await supabase
    .from('door_keys')
    .delete()
    .eq('id', params.keyId)
    .eq('door_id', params.doorId);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true });
}
