import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { analyzeMeetingTranscript } from '@/lib/integrations/fathom-analysis';
import { postMeetingSummaryToCard } from '@/lib/integrations/fathom-actions';

export const dynamic = 'force-dynamic';

/**
 * POST /api/meetings/[id]/analyze
 * Manually trigger AI analysis on a Fathom recording.
 * Re-runs analysis even if already analyzed (useful for retries or rule changes).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const recordingId = params.id;

  // Fetch the recording
  const { data: recording, error: fetchError } = await supabase
    .from('fathom_recordings')
    .select('id, transcript, fathom_summary, matched_client_id, matched_card_id, title, share_url')
    .eq('id', recordingId)
    .single();

  if (fetchError || !recording) {
    return errorResponse('Recording not found', 404);
  }

  if (!recording.transcript) {
    return errorResponse('No transcript available', 400);
  }

  try {
    // Run AI analysis
    const result = await analyzeMeetingTranscript({
      recordingId: recording.id,
      transcript: recording.transcript,
      fathomSummary: recording.fathom_summary,
      clientId: recording.matched_client_id,
      supabase,
    });

    // If recording is matched to a card, post summary as a comment
    if (recording.matched_card_id) {
      try {
        await postMeetingSummaryToCard({
          recordingId: recording.id,
          cardId: recording.matched_card_id,
          title: recording.title || 'Untitled Meeting',
          summary: result.ai_summary,
          actionItems: result.ai_action_items,
          shareUrl: recording.share_url,
          supabase,
          systemUserId: userId,
        });
      } catch (postError) {
        console.error('[meetings/analyze] Failed to post summary to card:', postError);
        // Non-blocking - still return success for the analysis itself
      }
    }

    return NextResponse.json({
      success: true,
      ai_summary: result.ai_summary,
      action_items_count: result.ai_action_items.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[meetings/analyze] Analysis failed:', message);
    return errorResponse(`Analysis failed: ${message}`, 500);
  }
}
