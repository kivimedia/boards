import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/meetings/[id]/email
 * Compose a meeting summary email draft for the matched client.
 * Creates a draft in client_emails table from the recording's AI summary.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const recordingId = params.id;

  // 1. Fetch the fathom recording
  const { data: recording, error: fetchError } = await supabase
    .from('fathom_recordings')
    .select('id, title, meeting_title, ai_summary, ai_action_items, share_url, matched_client_id, recorded_at')
    .eq('id', recordingId)
    .single();

  if (fetchError || !recording) {
    return errorResponse('Recording not found', 404);
  }

  // 2. Validate it has matched_client_id and ai_summary
  if (!recording.matched_client_id) {
    return errorResponse('Recording is not matched to a client', 400);
  }

  if (!recording.ai_summary) {
    return errorResponse('Recording has no AI summary - run analysis first', 400);
  }

  // 3. Fetch client info
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, name, email, contacts')
    .eq('id', recording.matched_client_id)
    .single();

  if (clientError || !client) {
    return errorResponse('Matched client not found', 404);
  }

  // 4. Build subject
  const meetingTitle = recording.title || recording.meeting_title || 'Meeting';
  const formattedDate = recording.recorded_at
    ? new Date(recording.recorded_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';
  const subject = `Meeting Summary - ${meetingTitle}${formattedDate ? ` (${formattedDate})` : ''}`;

  // 5. Build HTML body
  const summaryHtml = (recording.ai_summary as string).replace(/\n/g, '<br>');
  const actionItems = (recording.ai_action_items as Array<{ text: string; assignee?: string; due_date?: string; priority?: string }>) || [];

  let htmlBody = `<p>Hi,</p>`;
  htmlBody += `<p>Here is the summary from our meeting: <strong>${meetingTitle}</strong></p>`;
  htmlBody += `<div>${summaryHtml}</div>`;

  if (actionItems.length > 0) {
    htmlBody += `<p><strong>Action Items:</strong></p>`;
    htmlBody += `<ul>`;
    for (const item of actionItems) {
      let itemText = item.text;
      if (item.assignee) itemText += ` (${item.assignee})`;
      if (item.due_date) itemText += ` - Due: ${item.due_date}`;
      htmlBody += `<li>${itemText}</li>`;
    }
    htmlBody += `</ul>`;
  }

  if (recording.share_url) {
    htmlBody += `<p><a href="${recording.share_url}">Watch Recording</a></p>`;
  }

  htmlBody += `<p>Best regards,<br>KM Boards</p>`;

  // 6. Get recipients from client contacts or fallback to client.email
  let recipientEmails: string[] = [];
  if (client.contacts && Array.isArray(client.contacts)) {
    recipientEmails = client.contacts
      .map((c: { email?: string }) => c.email)
      .filter((e: string | undefined): e is string => !!e);
  }
  if (recipientEmails.length === 0 && client.email) {
    recipientEmails = [client.email];
  }

  // 7. Insert into client_emails table as a draft
  const { data, error } = await supabase
    .from('client_emails')
    .insert({
      client_id: recording.matched_client_id,
      subject,
      body: htmlBody,
      recipients: recipientEmails,
      cc: [],
      status: 'draft',
      drafted_by: userId,
      ai_generated: false,
    })
    .select()
    .single();

  if (error) {
    console.error('[meetings/email] Failed to create email draft:', error);
    return errorResponse('Failed to create email draft', 500);
  }

  // 8. Return the created email
  return NextResponse.json({ data });
}
