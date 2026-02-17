import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import type { ScoutConfig } from '@/lib/types';

/**
 * GET /api/podcast/scout/config
 * Load the saved scout configuration.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('pga_integration_configs')
    .select('config, is_active')
    .eq('service', 'scout_config')
    .maybeSingle();

  if (error) return errorResponse(error.message, 500);

  // Return default config if not found
  const defaultConfig: ScoutConfig = {
    default_query: 'vibe coding freelancer agency AI tools',
    default_location: 'US',
    custom_location: '',
    tool_focus: 'Cursor, Lovable, Bolt, Replit, v0, Windsurf',
    max_results: 10,
  };

  return successResponse({
    config: (data?.config as ScoutConfig) || defaultConfig,
    is_active: data?.is_active ?? true,
  });
}

/**
 * PUT /api/podcast/scout/config
 * Update the scout configuration.
 */
export async function PUT(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{ config: ScoutConfig }>(request);
  if (!body.ok) return body.response;

  const { config } = body.body;
  if (!config) return errorResponse('config is required');

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('pga_integration_configs')
    .upsert(
      {
        service: 'scout_config',
        config,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'service' }
    )
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
