import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getInstantlyConfig, sendSequenceToCandidate } from '@/lib/integrations/instantly';
import { sendSequenceDirect } from '@/lib/integrations/direct-email';

type Params = { params: { id: string } };

/**
 * POST /api/podcast/sequences/[id]/send
 * Send a draft email sequence.
 *
 * Supports two methods:
 * - "instantly" — via Instantly.io (campaign + warmup + tracking)
 * - "direct" — via Resend API (simple scheduled emails, assumes warm)
 *
 * Body: { method?: "instantly" | "direct", sender_email?: string }
 * If method is not specified, auto-detects: uses Instantly if configured, else direct.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const requestedMethod = body.method as 'instantly' | 'direct' | undefined;
  const senderEmail = body.sender_email as string | undefined;

  const { supabase } = auth.ctx;

  // Load sequence + candidate
  const { data: sequence, error: seqError } = await supabase
    .from('pga_email_sequences')
    .select('*, candidate:pga_candidates(*)')
    .eq('id', params.id)
    .single();

  if (seqError || !sequence) {
    return errorResponse('Sequence not found', 404);
  }

  if (sequence.status !== 'draft') {
    return errorResponse(`Sequence is ${sequence.status}, can only send 'draft' sequences`);
  }

  const candidate = sequence.candidate;
  if (!candidate?.email) {
    return errorResponse('Candidate has no email address. Discover email first.');
  }

  const emails = (sequence.emails ?? []) as Array<{
    step: number;
    day: number;
    subject: string;
    body: string;
  }>;

  if (emails.length === 0) {
    return errorResponse('Sequence has no emails');
  }

  // Determine send method
  let method = requestedMethod;
  if (!method) {
    const instantlyConfig = await getInstantlyConfig(supabase);
    method = instantlyConfig ? 'instantly' : 'direct';
  }

  if (method === 'instantly') {
    // === INSTANTLY.IO PATH ===
    const config = await getInstantlyConfig(supabase);
    if (!config) {
      return errorResponse(
        'Instantly.io is not configured. Go to Settings > Podcast Integrations, or use method: "direct" for Resend.'
      );
    }

    const campaignId = await sendSequenceToCandidate(
      config,
      { id: candidate.id, name: candidate.name, email: candidate.email },
      emails
    );

    if (!campaignId) {
      return errorResponse('Failed to create Instantly.io campaign.', 500);
    }

    await supabase
      .from('pga_email_sequences')
      .update({
        instantly_campaign_id: campaignId,
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id);

    await supabase
      .from('pga_candidates')
      .update({ status: 'outreach_active', updated_at: new Date().toISOString() })
      .eq('id', candidate.id);

    return successResponse({
      method: 'instantly',
      campaign_id: campaignId,
      emails_count: emails.length,
      candidate_name: candidate.name,
      candidate_email: candidate.email,
    });
  } else {
    // === DIRECT / RESEND PATH ===
    if (!process.env.RESEND_API_KEY) {
      return errorResponse('RESEND_API_KEY not configured in .env.local');
    }

    const result = await sendSequenceDirect(supabase, {
      sequenceId: params.id,
      candidateId: candidate.id,
      candidateEmail: candidate.email,
      candidateName: candidate.name,
      emails,
      senderEmail,
    });

    // Update candidate status
    if (result.sent > 0 || result.scheduled > 0) {
      await supabase
        .from('pga_candidates')
        .update({ status: 'outreach_active', updated_at: new Date().toISOString() })
        .eq('id', candidate.id);
    }

    return successResponse({
      method: 'direct',
      sent_immediately: result.sent,
      scheduled: result.scheduled,
      deferred_to_cron: result.deferred,
      errors: result.errors,
      emails_total: emails.length,
      candidate_name: candidate.name,
      candidate_email: candidate.email,
    });
  }
}
