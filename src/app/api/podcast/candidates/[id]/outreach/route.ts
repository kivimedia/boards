import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { generateOutreachEmail, saveOutreachEmail } from '@/lib/ai/outreach-copywriter';
import { loadDossier } from '@/lib/ai/research-dossier';
import type { PGACandidate, PGAOutreachRun } from '@/lib/types';
import type { OutreachConfig } from '@/lib/ai/outreach-copywriter';

type Params = { params: { id: string } };

/**
 * GET /api/podcast/candidates/[id]/outreach
 * List all outreach emails for a candidate.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data: outreachRuns, error } = await supabase
    .from('pga_outreach_runs')
    .select('*')
    .eq('candidate_id', params.id)
    .order('touch_number', { ascending: true });

  if (error) {
    return errorResponse('Failed to load outreach data', 500);
  }

  return successResponse({ outreach_runs: outreachRuns || [] });
}

/**
 * POST /api/podcast/candidates/[id]/outreach
 * Generate a new outreach email for a candidate.
 * Requires a dossier to exist first.
 *
 * Body: {
 *   touch_number?: 1|2|3,
 *   config: OutreachConfig,
 *   run_id?: string
 * }
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Load candidate
  const { data: candidate, error: candidateError } = await supabase
    .from('pga_candidates')
    .select('*')
    .eq('id', params.id)
    .single();

  if (candidateError || !candidate) {
    return errorResponse('Candidate not found', 404);
  }

  const body = await request.json().catch(() => ({}));
  const { touch_number, config, run_id } = body as {
    touch_number?: number;
    config?: OutreachConfig;
    run_id?: string;
  };

  if (!config) {
    return errorResponse('config is required (sender_name, sender_title, podcast_name, booking_url, reply_to_email)');
  }

  // Load dossier
  const dossier = await loadDossier(supabase, params.id);
  if (!dossier) {
    return errorResponse(
      'No research dossier found for this candidate. Generate one first via POST /api/podcast/candidates/[id]/dossier',
      400
    );
  }

  // Determine touch number
  const { data: existingEmails } = await supabase
    .from('pga_outreach_runs')
    .select('touch_number, subject, body')
    .eq('candidate_id', params.id)
    .order('touch_number', { ascending: true });

  const currentTouch = touch_number ?? (existingEmails?.length ? existingEmails.length + 1 : 1);

  if (currentTouch > 3) {
    return errorResponse('Maximum 3 touches per candidate', 400);
  }

  // Generate email
  const email = await generateOutreachEmail(
    supabase,
    candidate as PGACandidate,
    dossier,
    config,
    {
      touchNumber: currentTouch,
      previousEmails: existingEmails?.map((e) => ({
        subject: e.subject || '',
        body: e.body || '',
        touch_number: e.touch_number,
      })),
      runId: run_id,
      userId,
    }
  );

  // Build a truncated version of the generation prompt for storage
  const promptSummary = `Touch ${currentTouch} for ${candidate.name}. Config: ${config.podcast_name}. Dossier elements: ${dossier.personalization_elements.length}`;

  // Save to database
  const outreachId = await saveOutreachEmail(
    supabase,
    params.id,
    null, // dossier_id from the dossiers table
    email,
    promptSummary,
    { runId: run_id, userId }
  );

  return successResponse({
    outreach_id: outreachId,
    subject: email.subject,
    body: email.body,
    touch_number: email.touch_number,
    validation: email.validation,
    tokens_used: email.tokens_used,
    cost_usd: email.cost_usd,
  });
}

/**
 * PATCH /api/podcast/candidates/[id]/outreach
 * Update an outreach email's status (approve, mark sent, record response).
 *
 * Body: {
 *   outreach_id: string,
 *   action: 'approve' | 'mark_sent' | 'record_response' | 'unsubscribe',
 *   response_type?: 'interested' | 'maybe_later' | 'declined' | 'question',
 *   resend_id?: string
 * }
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const body = await request.json().catch(() => ({}));
  const { outreach_id, action, response_type, resend_id } = body as {
    outreach_id: string;
    action: 'approve' | 'mark_sent' | 'record_response' | 'unsubscribe';
    response_type?: string;
    resend_id?: string;
  };

  if (!outreach_id || !action) {
    return errorResponse('outreach_id and action are required');
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  switch (action) {
    case 'approve':
      updates.send_status = 'approved';
      break;

    case 'mark_sent':
      updates.send_status = 'sent';
      updates.sent_at = new Date().toISOString();
      if (resend_id) updates.resend_id = resend_id;

      // Update candidate tracking
      await supabase
        .from('pga_candidates')
        .update({
          last_contacted_at: new Date().toISOString(),
          touch_count: (await supabase.from('pga_outreach_runs').select('id').eq('candidate_id', params.id).eq('send_status', 'sent')).data?.length ?? 0 + 1,
          status: 'outreach_active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.id);
      break;

    case 'record_response':
      updates.send_status = 'replied';
      updates.response_type = response_type || 'interested';
      updates.response_at = new Date().toISOString();

      // Update candidate status
      await supabase
        .from('pga_candidates')
        .update({ status: 'replied', updated_at: new Date().toISOString() })
        .eq('id', params.id);
      break;

    case 'unsubscribe':
      updates.send_status = 'unsubscribed';

      // Mark candidate as unsubscribed
      await supabase
        .from('pga_candidates')
        .update({ unsubscribed: true, updated_at: new Date().toISOString() })
        .eq('id', params.id);
      break;
  }

  const { error } = await supabase
    .from('pga_outreach_runs')
    .update(updates)
    .eq('id', outreach_id);

  if (error) {
    return errorResponse(`Failed to update outreach: ${error.message}`, 500);
  }

  return successResponse({ success: true, action });
}
