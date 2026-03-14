import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { fetchSlackChannelImages, getValidSlackToken } from '@/lib/integrations/slack-seo';

type Params = { params: Promise<{ id: string }> };

interface ImageRequest {
  code: string;
  description: string;
  index: number;
}

interface CollectedImage {
  code: string;
  description: string;
  url: string;
  filename: string;
  slack_ts: string;
}

/**
 * POST /api/seo/runs/[id]/images/collect
 * Fetch images from Slack, match them to reference codes, and resume the pipeline.
 */
export async function POST(
  _request: NextRequest,
  { params }: Params
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { id } = await params;

  // Fetch the run
  const { data: run, error: runErr } = await supabase
    .from('seo_pipeline_runs')
    .select('id, status, topic, artifacts, phase_results, team_config_id, final_content, humanized_content')
    .eq('id', id)
    .single();

  if (runErr || !run) return errorResponse('Run not found', 404);
  if (run.status !== 'awaiting_images') {
    return errorResponse('Run is not in awaiting_images status', 400);
  }

  if (!run.team_config_id) {
    return errorResponse('Run has no team config', 400);
  }

  const { data: teamConfig } = await supabase
    .from('seo_team_configs')
    .select('*')
    .eq('id', run.team_config_id)
    .single();

  if (!teamConfig) return errorResponse('Team config not found', 404);

  const slackCreds = teamConfig.slack_credentials;
  if (!slackCreds?.channel_id) {
    return errorResponse('No Slack channel configured', 400);
  }

  // Get image sourcing data from artifacts
  const imageSourceData = run.artifacts?.image_sourcing as {
    requests: ImageRequest[];
    slack_message_sent: boolean;
    slack_thread_ts?: string;
    sent_at?: string;
  } | undefined;

  if (!imageSourceData?.requests?.length) {
    return errorResponse('No image requests found', 400);
  }

  // Verify we have a valid Slack token
  const token = await getValidSlackToken(supabase, run.team_config_id);
  if (!token) {
    return errorResponse('Could not obtain a valid Slack token', 400);
  }

  // Fetch recent images from the Slack channel
  // Use the sent_at timestamp to only get images after the request was sent
  const oldest = imageSourceData.sent_at
    ? String(new Date(imageSourceData.sent_at).getTime() / 1000)
    : undefined;

  let slackImages;
  try {
    slackImages = await fetchSlackChannelImages(
      supabase,
      run.team_config_id,
      slackCreds.channel_id,
      { limit: 50, oldest }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch Slack images';
    return errorResponse(msg, 500);
  }

  // Match images to reference codes
  const requests = imageSourceData.requests;
  const collected: CollectedImage[] = [];
  const unmatched: Array<{ url: string; filename: string; message: string }> = [];

  for (const img of slackImages) {
    let matched = false;
    for (const req of requests) {
      // Check if the message text contains the reference code
      if (img.messageText && img.messageText.toUpperCase().includes(req.code.toUpperCase())) {
        collected.push({
          code: req.code,
          description: req.description,
          url: img.url,
          filename: img.filename,
          slack_ts: img.timestamp,
        });
        matched = true;
        break;
      }
    }
    if (!matched) {
      unmatched.push({
        url: img.url,
        filename: img.filename,
        message: img.messageText || '',
      });
    }
  }

  // Optional: Enrich collected images with Humanity shift data
  let humanityMatches: Record<string, any> = {};
  if (teamConfig.humanity_config?.enabled && teamConfig.humanity_config?.access_token_encrypted) {
    try {
      const { findShiftByTimestamp, getAccessToken } = await import('@/lib/integrations/humanity');
      const accessToken = getAccessToken(teamConfig.humanity_config);

      for (const img of collected) {
        if (!img.slack_ts) continue;
        try {
          const ts = new Date(parseFloat(img.slack_ts) * 1000);
          const match = await findShiftByTimestamp(accessToken, ts);
          if (match.matched) {
            humanityMatches[img.code] = match;
          }
        } catch {
          // Non-fatal - continue without enrichment for this image
        }
      }
    } catch {
      // Humanity integration not available - continue without enrichment
    }
  }

  // Update artifacts with collected images
  const updatedImageSource = {
    ...imageSourceData,
    collected: true,
    collected_at: new Date().toISOString(),
    collected_images: collected,
    unmatched_images: unmatched,
    total_found: slackImages.length,
    matched_count: collected.length,
    ...(Object.keys(humanityMatches).length > 0 ? { humanity_matches: humanityMatches } : {}),
  };

  const updatedArtifacts = {
    ...(run.artifacts || {}),
    image_sourcing: updatedImageSource,
  };

  // Build image reference map for content injection
  // Replace [IMAGE: description] with markdown image references
  let updatedContent = run.final_content || '';
  for (const img of collected) {
    // Replace the first matching [IMAGE: ...] that corresponds to this code's description
    const escapedDesc = img.description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\[IMAGE:\\s*${escapedDesc}\\s*\\]`, 'i');
    updatedContent = updatedContent.replace(
      regex,
      `![${img.description}](${img.url})`
    );
  }

  // Create VPS job to resume pipeline from the next phase after image_sourcing (qc)
  const PHASE_ORDER = [
    'planning', 'plan_review', 'writing', 'image_sourcing', 'qc', 'humanizing', 'scoring',
    'gate1', 'publishing', 'visual_qa', 'gate2',
  ];
  const imagePhaseIndex = PHASE_ORDER.indexOf('image_sourcing');
  const nextPhaseIndex = imagePhaseIndex + 1; // qc

  const { data: job } = await supabase
    .from('vps_jobs')
    .insert({
      job_type: 'seo',
      status: 'pending',
      user_id: userId,
      payload: {
        team_config_id: run.team_config_id,
        pipeline_run_id: id,
        resume_from_phase: nextPhaseIndex,
      },
    })
    .select('id')
    .single();

  // Update the run - set content with images and advance status
  await supabase
    .from('seo_pipeline_runs')
    .update({
      artifacts: updatedArtifacts,
      final_content: updatedContent,
      status: 'scoring', // qc phase status
      current_phase: nextPhaseIndex,
      vps_job_id: job?.id || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  return successResponse({
    collected_count: collected.length,
    unmatched_count: unmatched.length,
    total_slack_images: slackImages.length,
    collected_images: collected.map(c => ({ code: c.code, filename: c.filename })),
    resumed: !!job,
    next_phase: 'qc',
  });
}
