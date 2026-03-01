import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  verifyWebhookSignature,
  getTranscript,
  getSummary,
  calcDuration,
  listMeetings,
  type FathomWebhookPayload,
  type FathomMeeting,
} from '@/lib/integrations/fathom';
import { matchParticipantsToClients } from '@/lib/integrations/fathom-matching';
import { analyzeMeetingTranscript } from '@/lib/integrations/fathom-analysis';
import { evaluateRoutingRules } from '@/lib/integrations/fathom-routing';
import { postMeetingSummaryToCard, createActionItemCards } from '@/lib/integrations/fathom-actions';
import { indexTranscriptEmbeddings } from '@/lib/integrations/fathom-embeddings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/webhooks/fathom
 * Receives Fathom webhook when meeting content is ready.
 * Returns 200 immediately, then processes async.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  // Verify webhook signature (skip in dev if no secret set)
  const webhookSecret = process.env.FATHOM_WEBHOOK_SECRET;
  if (webhookSecret) {
    const headers = {
      'webhook-id': request.headers.get('webhook-id') || undefined,
      'webhook-timestamp': request.headers.get('webhook-timestamp') || undefined,
      'webhook-signature': request.headers.get('webhook-signature') || undefined,
    };

    if (!verifyWebhookSignature(rawBody, headers)) {
      console.error('[fathom-webhook] Signature verification failed');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  let payload: FathomWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (payload.type !== 'meeting_content_ready') {
    return NextResponse.json({ message: `Ignored event type: ${payload.type}` });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Idempotency: check if we already have this recording
  const { data: existing } = await supabase
    .from('fathom_recordings')
    .select('id, processing_status')
    .eq('fathom_recording_id', payload.recording_id)
    .single();

  if (existing && ['matched', 'analyzed'].includes(existing.processing_status)) {
    return NextResponse.json({ message: 'Already processed', id: existing.id });
  }

  // Process the meeting
  try {
    const result = await processFathomMeeting(supabase, payload);
    return NextResponse.json({ message: 'Processed', ...result });
  } catch (err: any) {
    console.error('[fathom-webhook] Processing error:', err);

    // Store the raw payload even on error so we can retry later
    if (!existing) {
      await supabase.from('fathom_recordings').insert({
        fathom_recording_id: payload.recording_id,
        fathom_url: payload.url,
        share_url: payload.share_url,
        processing_status: 'error',
        error_message: err.message,
        raw_payload: payload,
      });
    }

    return NextResponse.json({ message: 'Stored with error', error: err.message });
  }
}

async function processFathomMeeting(
  supabase: any,
  payload: FathomWebhookPayload
) {
  const recordingId = payload.recording_id;

  // Fetch meeting details from Fathom API (includes transcript, summary, action items, invitees)
  const meetingsRes = await listMeetings({
    includeTranscript: true,
    includeSummary: true,
    includeActionItems: true,
  });

  // Find this specific meeting in the list
  let meeting: FathomMeeting | undefined = meetingsRes.items.find(
    m => m.recording_id === recordingId
  );

  // If not in the first page, fetch transcript and summary separately
  let transcript = meeting?.transcript;
  let summary = meeting?.default_summary;
  let actionItems = meeting?.action_items;

  if (!transcript) {
    try {
      transcript = await getTranscript(recordingId);
    } catch (err) {
      console.warn('[fathom-webhook] Could not fetch transcript:', err);
    }
  }

  if (!summary) {
    try {
      summary = await getSummary(recordingId);
    } catch (err) {
      console.warn('[fathom-webhook] Could not fetch summary:', err);
    }
  }

  const duration = calcDuration(
    meeting?.recording_start_time,
    meeting?.recording_end_time
  );

  // Upsert the recording
  const recordData = {
    fathom_recording_id: recordingId,
    title: meeting?.title || null,
    meeting_title: meeting?.meeting_title || null,
    share_url: payload.share_url,
    fathom_url: payload.url,
    duration_seconds: duration,
    recorded_at: meeting?.created_at || new Date().toISOString(),
    recording_start_time: meeting?.recording_start_time || null,
    recording_end_time: meeting?.recording_end_time || null,
    transcript_language: meeting?.transcript_language || null,
    transcript: transcript || null,
    fathom_summary: summary?.markdown_formatted || null,
    fathom_action_items: actionItems || null,
    calendar_invitees: meeting?.calendar_invitees || null,
    recorded_by: meeting?.recorded_by || null,
    processing_status: 'processing',
    raw_payload: payload,
    updated_at: new Date().toISOString(),
  };

  const { data: recording, error: upsertError } = await supabase
    .from('fathom_recordings')
    .upsert(recordData, { onConflict: 'fathom_recording_id' })
    .select('id')
    .single();

  if (upsertError) throw new Error(`Upsert failed: ${upsertError.message}`);

  // Match participants to clients
  const matchResult = await matchParticipantsToClients(
    supabase,
    recording.id,
    meeting?.calendar_invitees || [],
    transcript || []
  );

  let clientId = matchResult.clientId;
  let matchedBy = matchResult.matchedBy;
  let cardId: string | null = null;

  // If email matching failed, try routing rules
  if (!clientId) {
    try {
      const routingResult = await evaluateRoutingRules({
        title: meeting?.title || meeting?.meeting_title || null,
        transcript: transcript || null,
        participants: (meeting?.calendar_invitees || []).map(inv => ({
          email: inv.email,
          name: inv.name,
          is_external: inv.is_external,
        })),
        recordedAt: meeting?.created_at || null,
        supabase,
      });
      if (routingResult.clientId) {
        clientId = routingResult.clientId;
        matchedBy = `rule:${routingResult.matchedBy}`;
        cardId = routingResult.cardId;
      }
    } catch (err) {
      console.warn('[fathom-webhook] Routing rules evaluation failed:', err);
    }
  }

  // Update recording with match result
  const updateData: Record<string, any> = {
    processing_status: clientId ? 'matched' : 'needs_review',
    updated_at: new Date().toISOString(),
  };
  if (clientId) {
    updateData.matched_client_id = clientId;
    updateData.matched_by = matchedBy;
  }
  if (cardId) {
    updateData.matched_card_id = cardId;
  }

  await supabase
    .from('fathom_recordings')
    .update(updateData)
    .eq('id', recording.id);

  // Phase 2: AI Analysis (if transcript available)
  let analysisResult = null;
  if (transcript && transcript.length > 0) {
    try {
      analysisResult = await analyzeMeetingTranscript({
        recordingId: recording.id,
        transcript,
        fathomSummary: summary?.markdown_formatted || null,
        clientId,
        supabase,
      });
      console.log(`[fathom-webhook] AI analysis complete for ${recording.id}`);
    } catch (err) {
      console.warn('[fathom-webhook] AI analysis failed (non-blocking):', err);
    }
  }

  // Phase 2: Auto-actions (post summary to card, create action item cards)
  if (analysisResult) {
    const meetingTitle = meeting?.title || meeting?.meeting_title || 'Untitled Meeting';

    // Post summary to matched card
    if (cardId) {
      try {
        await postMeetingSummaryToCard({
          recordingId: recording.id,
          cardId,
          title: meetingTitle,
          summary: analysisResult.ai_summary,
          actionItems: analysisResult.ai_action_items,
          shareUrl: payload.share_url,
          supabase,
          systemUserId: '00000000-0000-0000-0000-000000000000',
        });
      } catch (err) {
        console.warn('[fathom-webhook] Failed to post summary to card:', err);
      }
    }

    // Create action item cards if client matched and there are action items
    if (clientId && analysisResult.ai_action_items.length > 0) {
      try {
        const { created } = await createActionItemCards({
          recordingId: recording.id,
          clientId,
          meetingTitle: meetingTitle,
          actionItems: analysisResult.ai_action_items,
          shareUrl: payload.share_url,
          supabase,
          createdBy: '00000000-0000-0000-0000-000000000000',
        });
        if (created > 0) {
          console.log(`[fathom-webhook] Created ${created} action item cards`);
        }
      } catch (err) {
        console.warn('[fathom-webhook] Failed to create action item cards:', err);
      }
    }
  }

  // Phase 4: Index transcript embeddings for semantic search
  if (transcript && transcript.length > 0) {
    try {
      const { chunksIndexed } = await indexTranscriptEmbeddings({
        recordingId: recording.id,
        transcript,
        title: meeting?.title || meeting?.meeting_title || 'Meeting',
        supabase,
      });
      if (chunksIndexed > 0) {
        console.log(`[fathom-webhook] Indexed ${chunksIndexed} transcript chunks`);
      }
    } catch (err) {
      console.warn('[fathom-webhook] Embedding indexing failed (non-blocking):', err);
    }
  }

  return {
    id: recording.id,
    status: analysisResult ? 'analyzed' : updateData.processing_status,
    matched_client: matchResult.clientName || null,
    participants_found: matchResult.participantsCreated,
    ai_analyzed: !!analysisResult,
    action_items_count: analysisResult?.ai_action_items.length || 0,
  };
}
