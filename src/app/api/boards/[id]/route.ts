import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error) return errorResponse('Board not found', 404);
  return successResponse(data);
}

interface UpdateBoardBody {
  name?: string;
  background_color?: string | null;
  background_image_url?: string | null;
  is_archived?: boolean;
  is_starred?: boolean;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateBoardBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const updates: Record<string, unknown> = {};
  if (body.body.name?.trim()) updates.name = body.body.name.trim();
  if (body.body.background_color !== undefined) updates.background_color = body.body.background_color;
  if (body.body.background_image_url !== undefined) updates.background_image_url = body.body.background_image_url;
  if (body.body.is_archived !== undefined) updates.is_archived = body.body.is_archived;
  if (body.body.is_starred !== undefined) updates.is_starred = body.body.is_starred;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const { data, error } = await supabase
    .from('boards')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { error } = await supabase.from('boards').delete().eq('id', params.id);

  if (error) return errorResponse(error.message, 500);
  return successResponse(null);
}
