import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { storeSlackTokens } from '@/lib/integrations/slack-seo';

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
  slack_credentials?: {
    // Accept either plaintext tokens (for initial setup) or pre-encrypted
    access_token?: string;
    refresh_token?: string;
    access_token_encrypted?: string;
    refresh_token_encrypted?: string;
    channel_id: string;
    team_id?: string;
    scope?: string;
    token_expires_at?: string;
  };
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

  // Build row without slack_credentials (handled separately for encryption)
  const row: Record<string, unknown> = {
    client_id: client_id?.trim() || null,
    site_url: site_url.trim(),
    site_name: site_name.trim(),
    wp_credentials: wp_credentials || null,
    slack_credentials: null,
    google_credentials: google_credentials || null,
    config: config || {},
  };

  // If slack_credentials has pre-encrypted tokens, pass through as-is
  // If it has plaintext tokens, they'll be encrypted after insert via storeSlackTokens
  if (slack_credentials?.access_token_encrypted) {
    row.slack_credentials = slack_credentials;
  }

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

  // If plaintext Slack tokens were provided, encrypt and store them now
  const configId = data?.id;
  if (configId && slack_credentials?.access_token && slack_credentials?.refresh_token) {
    try {
      await storeSlackTokens(supabase, configId, {
        accessToken: slack_credentials.access_token,
        refreshToken: slack_credentials.refresh_token,
        channelId: slack_credentials.channel_id,
        teamId: slack_credentials.team_id,
        scope: slack_credentials.scope,
      });
    } catch (err: any) {
      console.error('Failed to encrypt Slack tokens:', err.message);
      // Don't fail the whole request - config was created, tokens can be re-added
    }
  }

  return successResponse(data, id ? 200 : 201);
}
