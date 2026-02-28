import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  listMeetings,
  getTranscript,
  getSummary,
  calcDuration,
  type FathomMeeting,
} from '@/lib/integrations/fathom';
import { matchParticipantsToClients } from '@/lib/integrations/fathom-matching';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/admin/fathom-backfill
 * Fetches historical Fathom recordings and processes them.
 * Auth: CRON_SECRET bearer token OR admin session.
 */
export async function POST(request: Request) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const hasCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!hasCronAuth) {
    const userSupabase = createServerSupabaseClient();
    const { data: { session } } = await userSupabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: profile } = await userSupabase
      .from('profiles')
      .select('user_role')
      .eq('id', session.user.id)
      .single();
    if (profile?.user_role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const startTime = Date.now();
  const HARD_STOP = 250_000;
  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let cursor: string | undefined;

  try {
    while (Date.now() - startTime < HARD_STOP) {
      // Fetch a page of meetings with full data
      const page = await listMeetings({
        cursor,
        includeTranscript: true,
        includeSummary: true,
        includeActionItems: true,
      });

      if (page.items.length === 0) break;

      for (const meeting of page.items) {
        if (Date.now() - startTime > HARD_STOP) break;

        // Skip if already exists
        const { data: existing } = await supabase
          .from('fathom_recordings')
          .select('id')
          .eq('fathom_recording_id', meeting.recording_id)
          .single();

        if (existing) {
          totalSkipped++;
          continue;
        }

        try {
          await processBackfillMeeting(supabase, meeting);
          totalProcessed++;
        } catch (err: any) {
          console.error(`[fathom-backfill] Error processing ${meeting.recording_id}:`, err.message);
          totalErrors++;
        }
      }

      cursor = page.next_cursor || undefined;
      if (!cursor) break;
    }

    return NextResponse.json({
      message: cursor ? 'Time limit reached, run again for more' : 'Backfill complete',
      processed: totalProcessed,
      skipped: totalSkipped,
      errors: totalErrors,
      has_more: !!cursor,
      duration_ms: Date.now() - startTime,
    });
  } catch (err: any) {
    console.error('[fathom-backfill] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function processBackfillMeeting(
  supabase: any,
  meeting: FathomMeeting
) {
  let transcript = meeting.transcript;
  let summary = meeting.default_summary;

  // Fetch transcript separately if not included
  if (!transcript) {
    try {
      transcript = await getTranscript(meeting.recording_id);
    } catch { /* ok */ }
  }

  if (!summary) {
    try {
      summary = await getSummary(meeting.recording_id);
    } catch { /* ok */ }
  }

  const duration = calcDuration(meeting.recording_start_time, meeting.recording_end_time);

  const { data: recording, error } = await supabase
    .from('fathom_recordings')
    .insert({
      fathom_recording_id: meeting.recording_id,
      title: meeting.title,
      meeting_title: meeting.meeting_title,
      share_url: meeting.share_url,
      fathom_url: meeting.url,
      duration_seconds: duration,
      recorded_at: meeting.created_at,
      recording_start_time: meeting.recording_start_time || null,
      recording_end_time: meeting.recording_end_time || null,
      transcript_language: meeting.transcript_language || null,
      transcript,
      fathom_summary: summary?.markdown_formatted || null,
      fathom_action_items: meeting.action_items || null,
      calendar_invitees: meeting.calendar_invitees || null,
      recorded_by: meeting.recorded_by || null,
      processing_status: 'processing',
    })
    .select('id')
    .single();

  if (error) throw error;

  // Match participants
  const matchResult = await matchParticipantsToClients(
    supabase,
    recording.id,
    meeting.calendar_invitees || [],
    transcript || []
  );

  await supabase
    .from('fathom_recordings')
    .update({
      processing_status: matchResult.clientId ? 'matched' : 'needs_review',
      matched_client_id: matchResult.clientId,
      matched_by: matchResult.matchedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', recording.id);
}
