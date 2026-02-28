import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

type Params = { params: Promise<{ id: string }> };

interface FeedbackBody {
  phase: string;
  decision: 'approve' | 'revise' | 'scrap';
  feedback_text?: string;
  attachment_ids?: string[];
}

/**
 * GET /api/seo/runs/[id]/feedback
 * Return all feedback for this run, with attachments.
 */
export async function GET(
  _request: NextRequest,
  { params }: Params
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id } = await params;

  const { data: feedback, error } = await supabase
    .from('seo_phase_feedback')
    .select('*, attachments:seo_review_attachments(*)')
    .eq('run_id', id)
    .order('created_at', { ascending: true });

  if (error) return errorResponse(error.message, 500);

  // Generate signed URLs for attachments
  if (feedback) {
    for (const fb of feedback) {
      if (fb.attachments) {
        for (const att of fb.attachments) {
          const { data: urlData } = await supabase.storage
            .from('seo-review-attachments')
            .createSignedUrl(att.storage_path, 3600);
          att.url = urlData?.signedUrl || null;
        }
      }
    }
  }

  return successResponse(feedback || []);
}

/**
 * POST /api/seo/runs/[id]/feedback
 * Submit a phase feedback decision (approve, revise, scrap).
 */
export async function POST(
  request: NextRequest,
  { params }: Params
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<FeedbackBody>(request);
  if (!body.ok) return body.response;

  const { supabase, userId } = auth.ctx;
  const { id } = await params;
  const { phase, decision, feedback_text, attachment_ids } = body.body;

  if (!['approve', 'revise', 'scrap'].includes(decision)) {
    return errorResponse('decision must be "approve", "revise", or "scrap"');
  }

  // Verify the run exists
  const { data: run, error: runErr } = await supabase
    .from('seo_pipeline_runs')
    .select('id, status, plan_review_round, team_config_id')
    .eq('id', id)
    .single();

  if (runErr || !run) return errorResponse('Run not found', 404);

  // Determine the round number
  const { count } = await supabase
    .from('seo_phase_feedback')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', id)
    .eq('phase', phase);

  const round = (count ?? 0) + 1;

  // Insert feedback record
  const { data: fb, error: fbErr } = await supabase
    .from('seo_phase_feedback')
    .insert({
      run_id: id,
      phase,
      round,
      feedback_text: feedback_text || null,
      decision,
      decided_by: userId,
    })
    .select()
    .single();

  if (fbErr) return errorResponse(fbErr.message, 500);

  // Link any uploaded attachments to this feedback
  if (attachment_ids?.length && fb) {
    await supabase
      .from('seo_review_attachments')
      .update({ feedback_id: fb.id })
      .in('id', attachment_ids)
      .eq('run_id', id);
  }

  // Handle status transitions based on phase + decision
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };

  if (phase === 'plan_review') {
    if (decision === 'approve') {
      updates.status = 'writing';
      updates.plan_review_decision = 'approve';
      updates.plan_review_feedback = feedback_text || null;

      // Create VPS job to resume pipeline from writing phase
      const { data: job } = await supabase
        .from('vps_jobs')
        .insert({
          job_type: 'pipeline:seo',
          status: 'pending',
          user_id: userId,
          payload: {
            team_config_id: run.team_config_id,
            pipeline_run_id: id,
            resume_from_phase: 2, // writing is index 2 (after planning + plan_review)
          },
        })
        .select('id')
        .single();

      if (job) updates.vps_job_id = job.id;

    } else if (decision === 'revise') {
      updates.status = 'planning';
      updates.plan_review_round = (run.plan_review_round || 0) + 1;
      updates.plan_review_decision = 'revise';
      updates.plan_review_feedback = feedback_text || null;

      // Get signed URLs for any attachments to pass to the VPS worker
      let imageUrls: string[] = [];
      if (attachment_ids?.length) {
        const { data: atts } = await supabase
          .from('seo_review_attachments')
          .select('storage_path')
          .in('id', attachment_ids);
        if (atts) {
          for (const att of atts) {
            const { data: urlData } = await supabase.storage
              .from('seo-review-attachments')
              .createSignedUrl(att.storage_path, 7200); // 2 hour TTL for VPS
            if (urlData?.signedUrl) imageUrls.push(urlData.signedUrl);
          }
        }
      }

      // Create VPS job to re-run planning with feedback
      await supabase
        .from('vps_jobs')
        .insert({
          job_type: 'pipeline:seo',
          status: 'pending',
          user_id: userId,
          payload: {
            team_config_id: run.team_config_id,
            pipeline_run_id: id,
            resume_from_phase: 0, // re-run from planning
            feedback: feedback_text || null,
            reference_image_urls: imageUrls.length ? imageUrls : undefined,
            regenerate: true,
          },
        });

    } else {
      updates.status = 'scrapped';
    }
  } else if (phase === 'gate1') {
    // Delegate to existing gate logic pattern
    if (decision === 'approve') {
      updates.status = 'publishing';
      updates.gate1_decision = 'approve';
      updates.gate1_feedback = feedback_text || null;
      updates.gate1_decided_by = userId;
      updates.gate1_decided_at = now;
    } else if (decision === 'revise') {
      updates.status = 'writing';
      updates.gate1_decision = 'revise';
      updates.gate1_feedback = feedback_text || null;
      updates.gate1_decided_by = userId;
      updates.gate1_decided_at = now;
    } else {
      updates.status = 'scrapped';
      updates.gate1_decision = 'scrap';
      updates.gate1_decided_by = userId;
      updates.gate1_decided_at = now;
    }
  } else if (phase === 'gate2') {
    if (decision === 'approve') {
      updates.status = 'published';
      updates.published_at = now;
      updates.gate2_decision = 'approve';
      updates.gate2_feedback = feedback_text || null;
      updates.gate2_decided_by = userId;
      updates.gate2_decided_at = now;
    } else if (decision === 'revise') {
      updates.status = 'visual_qa';
      updates.gate2_decision = 'revise';
      updates.gate2_feedback = feedback_text || null;
      updates.gate2_decided_by = userId;
      updates.gate2_decided_at = now;
    } else {
      updates.status = 'scrapped';
      updates.gate2_decision = 'scrap';
      updates.gate2_decided_by = userId;
      updates.gate2_decided_at = now;
    }
  }

  const { data: updated, error: updateErr } = await supabase
    .from('seo_pipeline_runs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (updateErr) return errorResponse(updateErr.message, 500);

  return successResponse({ feedback: fb, run: updated });
}
