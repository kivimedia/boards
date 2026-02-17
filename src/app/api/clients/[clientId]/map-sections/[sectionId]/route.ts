import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { clientId: string; sectionId: string };
}

interface UpdateSectionBody {
  title?: string;
  content?: Record<string, unknown>;
  position?: number;
  is_client_visible?: boolean;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateSectionBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const updates: Record<string, unknown> = {};

  if (body.body.title !== undefined) updates.title = body.body.title.trim();
  if (body.body.content !== undefined) updates.content = body.body.content;
  if (body.body.position !== undefined) updates.position = body.body.position;
  if (body.body.is_client_visible !== undefined) updates.is_client_visible = body.body.is_client_visible;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const { data, error } = await supabase
    .from('map_sections')
    .update(updates)
    .eq('id', params.sectionId)
    .eq('client_id', params.clientId)
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
    .from('map_sections')
    .delete()
    .eq('id', params.sectionId)
    .eq('client_id', params.clientId);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true });
}
