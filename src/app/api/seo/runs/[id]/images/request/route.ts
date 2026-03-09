import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { sendSlackMessage, getValidSlackToken } from '@/lib/integrations/slack-seo';

type Params = { params: Promise<{ id: string }> };

interface ImageRequest {
  code: string;
  description: string;
  index: number;
}

/**
 * POST /api/seo/runs/[id]/images/request
 * Send image requests to the team's Slack channel.
 * Called when the pipeline reaches awaiting_images status.
 */
export async function POST(
  _request: NextRequest,
  { params }: Params
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id } = await params;

  // Fetch the run with team config
  const { data: run, error: runErr } = await supabase
    .from('seo_pipeline_runs')
    .select('id, status, topic, artifacts, phase_results, team_config_id')
    .eq('id', id)
    .single();

  if (runErr || !run) return errorResponse('Run not found', 404);
  if (run.status !== 'awaiting_images') {
    return errorResponse('Run is not in awaiting_images status', 400);
  }

  // Get team config for Slack credentials
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
  if (!slackCreds?.channel_id || !slackCreds?.access_token_encrypted) {
    return errorResponse('No Slack credentials configured for this team. Configure them in SEO Settings.', 400);
  }

  // Check we have a valid token
  const token = await getValidSlackToken(supabase, run.team_config_id);
  if (!token) {
    return errorResponse('Could not obtain a valid Slack token. The token may have been revoked.', 400);
  }

  // Get image requests from artifacts
  const imageSourceData = run.artifacts?.image_sourcing as {
    requests: ImageRequest[];
    slack_message_sent: boolean;
  } | undefined;

  if (!imageSourceData?.requests?.length) {
    return errorResponse('No image requests found in this run', 400);
  }

  if (imageSourceData.slack_message_sent) {
    return errorResponse('Slack message already sent for this run. Use Collect Images to fetch uploaded images.', 400);
  }

  // Build the Slack message
  const siteName = teamConfig.site_name || 'Unknown Site';
  const topic = run.topic || 'Untitled';
  const requests = imageSourceData.requests;

  const lines = [
    `*Image Request for Blog Post*`,
    `Site: ${siteName}`,
    `Topic: _${topic}_`,
    ``,
    `The writing agent needs ${requests.length} image(s) for this post. Please upload images to this channel with the reference code in your message.`,
    ``,
  ];

  for (const req of requests) {
    lines.push(`*\`${req.code}\`* - ${req.description}`);
  }

  lines.push(
    ``,
    `When uploading, include the code (e.g. \`${requests[0]?.code || 'IMG-xxxx-1'}\`) in your message so we can match images to the right spots.`
  );

  const message = lines.join('\n');

  // Send the Slack message
  try {
    const result = await sendSlackMessage(
      supabase,
      run.team_config_id,
      slackCreds.channel_id,
      message
    );

    // Update artifacts to mark message as sent and store thread_ts
    const updatedArtifacts = {
      ...(run.artifacts || {}),
      image_sourcing: {
        ...imageSourceData,
        slack_message_sent: true,
        slack_thread_ts: result.ts,
        slack_channel_id: result.channel,
        sent_at: new Date().toISOString(),
      },
    };

    await supabase
      .from('seo_pipeline_runs')
      .update({
        artifacts: updatedArtifacts,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return successResponse({
      sent: true,
      thread_ts: result.ts,
      image_count: requests.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to send Slack message';
    return errorResponse(msg, 500);
  }
}
