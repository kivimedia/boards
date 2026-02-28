import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * GET /api/seo/configs
 * List all SEO team configs. Optionally filter by client_id.
 * Joins with clients table to include client name.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');

  let query = supabase
    .from('seo_team_configs')
    .select('*, client:clients(id, name)')
    .order('created_at', { ascending: false });

  if (clientId) query = query.eq('client_id', clientId);

  const { data, error } = await query;

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface CreateConfigBody {
  id?: string;
  client_id?: string;
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
 * If `id` is provided, updates that config. Otherwise, inserts a new one.
 * Supports multiple configs per client (no unique constraint on client_id).
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateConfigBody>(request);
  if (!body.ok) return body.response;

  const { id, client_id, site_url, site_name, wp_credentials, slack_credentials, google_credentials, config } = body.body;

  if (!site_url?.trim()) return errorResponse('site_url is required');
  if (!site_name?.trim()) return errorResponse('site_name is required');

  const { supabase, userId } = auth.ctx;

  const row = {
    client_id: client_id?.trim() || null,
    site_url: site_url.trim(),
    site_name: site_name.trim(),
    wp_credentials: wp_credentials || null,
    slack_credentials: slack_credentials || null,
    google_credentials: google_credentials || null,
    config: config || {},
  };

  let data, error;

  if (id) {
    // Update existing config
    ({ data, error } = await supabase
      .from('seo_team_configs')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, client:clients(id, name)')
      .single());
  } else {
    // Insert new config
    ({ data, error } = await supabase
      .from('seo_team_configs')
      .insert({ ...row, created_by: userId })
      .select('*, client:clients(id, name)')
      .single());
  }

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, id ? 200 : 201);
}
