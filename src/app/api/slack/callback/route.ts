import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { storeSlackTokens } from '@/lib/integrations/slack-seo';

// All configs that should receive Slack tokens
const ALL_CONFIGS = [
  { id: '6a2ce915-2e6b-4a46-af33-9d72c2854861', table: 'seo_team_configs' },
  { id: '2f3a9ae4-e166-4392-9f15-ff00a178f534', table: 'historian_configs' },
];

/**
 * GET /api/slack/callback
 * OAuth2 callback for Slack. Exchanges the authorization code for tokens,
 * encrypts and stores them.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Parse redirect path from state (format: mode::::redirectPath)
  const parts = (state || '').split('::::');
  const redirectPath = parts[1] || '/settings/seo';

  if (error) {
    return NextResponse.redirect(
      new URL(`${redirectPath}?slack_error=${encodeURIComponent(error)}`, request.url),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${redirectPath}?slack_error=missing_code_or_state`, request.url),
    );
  }

  const clientId = process.env.SLACK_SEO_CLIENT_ID;
  const clientSecret = process.env.SLACK_SEO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL(`${redirectPath}?slack_error=missing_slack_env_vars`, request.url),
    );
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${request.nextUrl.origin}/api/slack/callback`,
    }),
  });

  const tokenData = await tokenRes.json();

  if (!tokenData.ok) {
    const msg = tokenData.error || 'token_exchange_failed';
    return NextResponse.redirect(
      new URL(`${redirectPath}?slack_error=${encodeURIComponent(msg)}`, request.url),
    );
  }

  // Extract tokens - handle both bot and user token responses
  const accessToken = tokenData.authed_user?.access_token || tokenData.access_token;
  const refreshToken = tokenData.authed_user?.refresh_token || tokenData.refresh_token || '';
  const teamId = tokenData.team?.id || '';
  const scope = tokenData.authed_user?.scope || tokenData.scope || '';
  const expiresIn = tokenData.authed_user?.expires_in || tokenData.expires_in || 43200;

  if (!accessToken) {
    return NextResponse.redirect(
      new URL(`${redirectPath}?slack_error=no_access_token_returned`, request.url),
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const mode = parts[0] || '';
  const tokenParams = {
    accessToken,
    refreshToken,
    channelId: '',
    teamId,
    scope,
    expiresInSeconds: expiresIn,
  };

  try {
    if (mode === 'both') {
      // Store to all configs at once
      await Promise.all(
        ALL_CONFIGS.map(c => storeSlackTokens(supabase, c.id, tokenParams, c.table))
      );
    } else {
      // Single config mode: state = configId:channelId:table::::redirectPath
      const configId = mode;
      const channelId = '';
      const table = parts.length > 1 ? 'seo_team_configs' : 'seo_team_configs';
      tokenParams.channelId = channelId;
      await storeSlackTokens(supabase, configId, tokenParams, table);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'store_failed';
    return NextResponse.redirect(
      new URL(`${redirectPath}?slack_error=${encodeURIComponent(msg)}`, request.url),
    );
  }

  return NextResponse.redirect(
    new URL(`${redirectPath}?slack_success=true`, request.url),
  );
}
