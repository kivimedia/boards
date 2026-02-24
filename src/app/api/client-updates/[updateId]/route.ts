import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params { params: { updateId: string } }

/**
 * GET /api/client-updates/:updateId — Get full update detail
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.ctx.supabase
    .from('client_weekly_updates')
    .select('*')
    .eq('id', params.updateId)
    .single();

  if (error) return errorResponse('Update not found', 404);
  return successResponse(data);
}

/**
 * PATCH /api/client-updates/:updateId — Edit content or perform actions
 * Body: { ai_summary?, ai_detailed_html?, _action?: 'approve' | 'send' | 'cancel' }
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { supabase } = auth.ctx;

    // Load the update
    const { data: update, error: fetchErr } = await supabase
      .from('client_weekly_updates')
      .select('*')
      .eq('id', params.updateId)
      .single();

    if (fetchErr || !update) return errorResponse('Update not found', 404);

    // Handle actions
    if (body._action === 'approve') {
      if (!['draft', 'pending_approval'].includes(update.status)) {
        return errorResponse(`Cannot approve update with status ${update.status}`, 400);
      }

      // Calculate scheduled_send_at from meeting_time and config timing
      let scheduledSendAt: string | null = null;
      if (update.meeting_time) {
        const { data: config } = await supabase
          .from('client_meeting_configs')
          .select('update_timing')
          .eq('id', update.config_id)
          .single();

        const meetingTime = new Date(update.meeting_time);
        const offset = config?.update_timing === '1_day_before' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
        scheduledSendAt = new Date(meetingTime.getTime() - offset).toISOString();

        // If scheduled time is in the past, schedule for now
        if (new Date(scheduledSendAt) < new Date()) {
          scheduledSendAt = new Date().toISOString();
        }
      }

      const { data, error } = await supabase
        .from('client_weekly_updates')
        .update({ status: 'scheduled', scheduled_send_at: scheduledSendAt })
        .eq('id', params.updateId)
        .select()
        .single();

      if (error) return errorResponse(error.message, 500);
      return successResponse(data);
    }

    if (body._action === 'send') {
      // Get client contacts
      const { data: config } = await supabase
        .from('client_meeting_configs')
        .select('send_to_contacts, client:clients(contacts)')
        .eq('id', update.config_id)
        .single();

      const clientContacts = (config as any)?.client?.contacts || [];
      const sendToFilter = config?.send_to_contacts || [];
      const recipients = sendToFilter.length > 0
        ? clientContacts.filter((c: any) => sendToFilter.includes(c.email))
        : clientContacts;

      const emails = recipients.map((c: any) => c.email).filter(Boolean);

      if (emails.length === 0) {
        const { data } = await supabase
          .from('client_weekly_updates')
          .update({ status: 'failed', error_message: 'No recipient email addresses configured' })
          .eq('id', params.updateId)
          .select()
          .single();
        return errorResponse('No recipient email addresses', 400);
      }

      // Send via Resend
      const resendKey = process.env.RESEND_API_KEY;
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'ziv@dailycookie.co';
      const messageIds: string[] = [];
      const errors: string[] = [];

      for (const email of emails) {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: fromEmail,
              to: [email],
              subject: `Weekly Update - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
              html: update.ai_detailed_html || '<p>No content</p>',
            }),
          });
          if (res.ok) {
            const data = await res.json();
            messageIds.push(data.id);
          } else {
            errors.push(`${email}: ${res.status}`);
          }
        } catch (e: any) {
          errors.push(`${email}: ${e.message}`);
        }
      }

      const { data } = await supabase
        .from('client_weekly_updates')
        .update({
          status: errors.length === emails.length ? 'failed' : 'sent',
          sent_at: new Date().toISOString(),
          sent_to_emails: emails,
          resend_message_ids: messageIds,
          error_message: errors.length > 0 ? errors.join('; ') : null,
        })
        .eq('id', params.updateId)
        .select()
        .single();

      return successResponse(data);
    }

    if (body._action === 'cancel') {
      const { data, error } = await supabase
        .from('client_weekly_updates')
        .update({ status: 'cancelled' })
        .eq('id', params.updateId)
        .select()
        .single();

      if (error) return errorResponse(error.message, 500);
      return successResponse(data);
    }

    // Regular field update (edit content)
    const updates: Record<string, unknown> = {};
    if (body.ai_summary !== undefined) updates.ai_summary = body.ai_summary;
    if (body.ai_detailed_html !== undefined) updates.ai_detailed_html = body.ai_detailed_html;

    if (Object.keys(updates).length === 0) {
      return errorResponse('No fields to update', 400);
    }

    const { data, error } = await supabase
      .from('client_weekly_updates')
      .update(updates)
      .eq('id', params.updateId)
      .select()
      .single();

    if (error) return errorResponse(error.message, 500);
    return successResponse(data);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}
