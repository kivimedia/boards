import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * GET /api/seo/configs
 * List all SEO team configs for the authenticated user.
 * Joins with clients table to include client name.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('seo_team_configs')
    .select('*, client:clients(id, name)')
    .order('created_at', { ascending: false });

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface CreateConfigBody {
  client_id: string;
  site_url: string;
  site_name: string;
  wp_credentials?: Record<string, unknown>;
  slack_credentials?: Record<string, unknown>;
  google_credentials?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

/**
 * POST /api/seo/configs
 * Create or update an SEO team config.
 * If a config already exists for the given client_id, it will be updated (upsert).
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateConfigBody>(request);
  if (!body.ok) return body.response;

  const { client_id, site_url, site_name, wp_credentials, slack_credentials, google_credentials, config } = body.body;

  if (!client_id?.trim()) return errorResponse('client_id is required');
  if (!site_url?.trim()) return errorResponse('site_url is required');
  if (!site_name?.trim()) return errorResponse('site_name is required');

  const { supabase, userId } = auth.ctx;

  const { data, error } = await supabase
    .from('seo_team_configs')
    .upsert(
      {
        client_id: client_id.trim(),
        site_url: site_url.trim(),
        site_name: site_name.trim(),
        wp_credentials: wp_credentials || null,
        slack_credentials: slack_credentials || null,
        google_credentials: google_credentials || null,
        config: config || {},
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id' }
    )
    .select('*, client:clients(id, name)')
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
