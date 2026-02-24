import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { buildMeetingPrep } from '@/lib/meeting-prep-builder';

interface Params { params: { clientId: string } }

/**
 * GET /api/meeting-prep/:clientId — Get meeting prep data
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const meetingTitle = url.searchParams.get('title') || 'Client Meeting';
    const meetingTime = url.searchParams.get('time') || new Date().toISOString();
    const eventLink = url.searchParams.get('link') || null;

    const prep = await buildMeetingPrep(
      auth.ctx.supabase,
      params.clientId,
      meetingTitle,
      meetingTime,
      eventLink
    );

    return successResponse(prep);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}

/**
 * POST /api/meeting-prep/:clientId — Start a meeting session
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const sessionId = body.session_id;

    if (sessionId) {
      // Mark existing session as started
      const { data, error } = await auth.ctx.supabase
        .from('meeting_prep_sessions')
        .update({ meeting_started_at: new Date().toISOString() })
        .eq('id', sessionId)
        .select()
        .single();

      if (error) return errorResponse(error.message, 500);
      return successResponse(data);
    }

    // Create a new session
    const prep = await buildMeetingPrep(
      auth.ctx.supabase,
      params.clientId,
      body.meeting_title || 'Client Meeting',
      body.meeting_time || new Date().toISOString(),
      body.event_link || null
    );

    const { data: session, error } = await auth.ctx.supabase
      .from('meeting_prep_sessions')
      .insert({
        client_id: params.clientId,
        calendar_event_id: body.calendar_event_id || null,
        meeting_time: body.meeting_time || new Date().toISOString(),
        meeting_title: body.meeting_title || 'Client Meeting',
        executive_summary: prep.executive_summary,
        tickets_snapshot: prep.tickets,
        last_update_id: prep.last_update?.id || null,
        meeting_started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return errorResponse(error.message, 500);
    return successResponse(session);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}
