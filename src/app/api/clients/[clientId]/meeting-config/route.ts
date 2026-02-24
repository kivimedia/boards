import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params { params: { clientId: string } }

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.ctx.supabase
    .from('client_meeting_configs')
    .select('*')
    .eq('client_id', params.clientId)
    .single();

  if (error && error.code !== 'PGRST116') return errorResponse(error.message, 500);
  return successResponse(data || null);
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { data, error } = await auth.ctx.supabase
      .from('client_meeting_configs')
      .insert({
        client_id: params.clientId,
        calendar_event_keyword: body.calendar_event_keyword,
        update_timing: body.update_timing || '1_hour_before',
        send_mode: body.send_mode || 'approve',
        is_active: body.is_active ?? true,
        send_to_contacts: body.send_to_contacts || [],
        created_by: auth.ctx.userId,
      })
      .select()
      .single();

    if (error) return errorResponse(error.message, 500);
    return successResponse(data);
  } catch (err: any) {
    return errorResponse(err.message, 400);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (body.calendar_event_keyword !== undefined) updates.calendar_event_keyword = body.calendar_event_keyword;
    if (body.update_timing !== undefined) updates.update_timing = body.update_timing;
    if (body.send_mode !== undefined) updates.send_mode = body.send_mode;
    if (body.is_active !== undefined) updates.is_active = body.is_active;
    if (body.send_to_contacts !== undefined) updates.send_to_contacts = body.send_to_contacts;

    const { data, error } = await auth.ctx.supabase
      .from('client_meeting_configs')
      .update(updates)
      .eq('client_id', params.clientId)
      .select()
      .single();

    if (error) return errorResponse(error.message, 500);
    return successResponse(data);
  } catch (err: any) {
    return errorResponse(err.message, 400);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { error } = await auth.ctx.supabase
    .from('client_meeting_configs')
    .delete()
    .eq('client_id', params.clientId);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true });
}
