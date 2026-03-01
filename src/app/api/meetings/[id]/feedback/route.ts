import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/meetings/[id]/feedback
 * Fetch the current user's feedback and aggregate counts for a recording.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const recordingId = params.id;

  // Fetch user's own feedback
  const { data: userFeedback, error: userError } = await supabase
    .from('ai_summary_feedback')
    .select('*')
    .eq('recording_id', recordingId)
    .eq('user_id', userId)
    .maybeSingle();

  if (userError) {
    console.error('[meetings/feedback] Error fetching user feedback:', userError);
    return errorResponse('Failed to fetch feedback', 500);
  }

  // Fetch aggregate counts
  const { data: allFeedback, error: countError } = await supabase
    .from('ai_summary_feedback')
    .select('is_positive')
    .eq('recording_id', recordingId);

  if (countError) {
    console.error('[meetings/feedback] Error fetching aggregate feedback:', countError);
    return errorResponse('Failed to fetch feedback counts', 500);
  }

  const positiveCount = (allFeedback || []).filter((f: { is_positive: boolean }) => f.is_positive).length;
  const negativeCount = (allFeedback || []).filter((f: { is_positive: boolean }) => !f.is_positive).length;

  return NextResponse.json({
    user_feedback: userFeedback || null,
    positive_count: positiveCount,
    negative_count: negativeCount,
  });
}

/**
 * POST /api/meetings/[id]/feedback
 * Submit or update thumbs up/down feedback for a recording's AI summary.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const recordingId = params.id;

  let body: { is_positive: boolean; comment?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (typeof body.is_positive !== 'boolean') {
    return errorResponse('is_positive (boolean) is required', 400);
  }

  // Upsert feedback (one per user per recording)
  const { data, error } = await supabase
    .from('ai_summary_feedback')
    .upsert(
      {
        recording_id: recordingId,
        user_id: userId,
        is_positive: body.is_positive,
        comment: body.comment || null,
      },
      { onConflict: 'recording_id,user_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('[meetings/feedback] Error upserting feedback:', error);
    return errorResponse('Failed to save feedback', 500);
  }

  return NextResponse.json({ data });
}
