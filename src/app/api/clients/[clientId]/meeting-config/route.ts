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
    .order('created_at', { ascending: true });

  if (error) return errorResponse(error.message, 500);
  return successResponse(data || []);
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
        custom_minutes: body.custom_minutes ?? null,
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
    if (!body.id) return errorResponse('Config ID required', 400);

    const updates: Record<string, unknown> = {};
    if (body.calendar_event_keyword !== undefined) updates.calendar_event_keyword = body.calendar_event_keyword;
    if (body.update_timing !== undefined) updates.update_timing = body.update_timing;
    if (body.custom_minutes !== undefined) updates.custom_minutes = body.custom_minutes;
    if (body.send_mode !== undefined) updates.send_mode = body.send_mode;
    if (body.is_active !== undefined) updates.is_active = body.is_active;
    if (body.send_to_contacts !== undefined) updates.send_to_contacts = body.send_to_contacts;
    if (body.include_fathom_meetings !== undefined) updates.include_fathom_meetings = body.include_fathom_meetings;

    const { data, error } = await auth.ctx.supabase
      .from('client_meeting_configs')
      .update(updates)
      .eq('id', body.id)
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

  const url = new URL(request.url);
  const configId = url.searchParams.get('configId');
  if (!configId) return errorResponse('configId query param required', 400);

  const { error } = await auth.ctx.supabase
    .from('client_meeting_configs')
    .delete()
    .eq('id', configId)
    .eq('client_id', params.clientId);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true });
}
