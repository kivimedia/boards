import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { findShiftByTimestamp, getAccessToken, type HumanityConfig } from '@/lib/integrations/humanity';

/**
 * POST /api/integrations/humanity/match
 * Find the nearest Humanity shift for a given timestamp.
 *
 * Body: {
 *   config_id: string,
 *   config_type: 'seo' | 'historian',
 *   timestamp: string,       // ISO date or Slack ts (unix seconds as string)
 *   window_hours?: number    // default 24
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  let body: { config_id: string; config_type: 'seo' | 'historian'; timestamp: string; window_hours?: number };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.config_id || !body.config_type || !body.timestamp) {
    return errorResponse('config_id, config_type, and timestamp are required', 400);
  }

  // Load config
  const table = body.config_type === 'seo' ? 'seo_team_configs' : 'historian_configs';
  const { data: config, error: configErr } = await supabase
    .from(table)
    .select('humanity_config')
    .eq('id', body.config_id)
    .single();

  if (configErr || !config) {
    return errorResponse(`Config not found: ${configErr?.message || 'unknown'}`, 404);
  }

  const humanityConfig = config.humanity_config as HumanityConfig | null;
  if (!humanityConfig?.enabled || !humanityConfig?.access_token_encrypted) {
    return errorResponse('Humanity integration is not enabled for this config', 400);
  }

  // Parse timestamp - could be ISO date or Slack ts (unix seconds as string)
  let ts: Date;
  const numericTs = parseFloat(body.timestamp);
  if (!isNaN(numericTs) && numericTs > 1_000_000_000 && numericTs < 10_000_000_000) {
    // Slack timestamp (seconds since epoch)
    ts = new Date(numericTs * 1000);
  } else {
    ts = new Date(body.timestamp);
  }

  if (isNaN(ts.getTime())) {
    return errorResponse('Invalid timestamp format', 400);
  }

  const accessToken = getAccessToken(humanityConfig);
  const result = await findShiftByTimestamp(accessToken, ts, body.window_hours ?? 24);

  return successResponse(result);
}
