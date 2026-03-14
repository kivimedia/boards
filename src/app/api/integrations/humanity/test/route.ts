import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { fetchShifts, fetchLocations, getAccessToken, type HumanityConfig } from '@/lib/integrations/humanity';

/**
 * POST /api/integrations/humanity/test
 * Test Humanity API connectivity and return summary stats.
 *
 * Body: {
 *   config_id: string,
 *   config_type: 'seo' | 'historian'
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  let body: { config_id: string; config_type: 'seo' | 'historian' };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.config_id || !body.config_type) {
    return errorResponse('config_id and config_type are required', 400);
  }

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
  if (!humanityConfig?.access_token_encrypted) {
    return errorResponse('No Humanity access token configured', 400);
  }

  try {
    const accessToken = getAccessToken(humanityConfig);

    // Test: fetch today's shifts and locations
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const [shifts, locations] = await Promise.all([
      fetchShifts(accessToken, today, nextWeek),
      fetchLocations(accessToken),
    ]);

    return successResponse({
      status: 'connected',
      shifts_next_7_days: shifts.length,
      locations_count: locations.size,
      sample_shift: shifts[0] ? {
        title: shifts[0].title,
        date: shifts[0].start_date,
        crew: shifts[0].schedule_name,
      } : null,
    });
  } catch (err) {
    return errorResponse(
      `Humanity API connection failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      502,
    );
  }
}
