import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { storeSlackTokens } from '@/lib/integrations/slack-seo';

/**
 * GET /api/slack/callback
 * OAuth2 callback for Slack. Exchanges the authorization code for tokens,
 * encrypts and stores them in the SEO team config.
 *
 * Query params from Slack:
 *   code   - authorization code
 *   state  - our config_id (passed through the authorize URL)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // config_id
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/seo?slack_error=${encodeURIComponent(error)}`, request.url),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/settings/seo?slack_error=missing_code_or_state', request.url),
    );
  }

  const clientId = process.env.SLACK_SEO_CLIENT_ID;
  const clientSecret = process.env.SLACK_SEO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL('/settings/seo?slack_error=missing_slack_env_vars', request.url),
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
      new URL(`/settings/seo?slack_error=${encodeURIComponent(msg)}`, request.url),
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
      new URL('/settings/seo?slack_error=no_access_token_returned', request.url),
    );
  }

  // The state param contains: configId:channelId (or just configId)
  const [configId, channelId] = state.split(':');

  if (!configId) {
    return NextResponse.redirect(
      new URL('/settings/seo?slack_error=invalid_state', request.url),
    );
  }

  // Store encrypted tokens
  const supabase = createServerSupabaseClient();

  try {
    await storeSlackTokens(supabase, configId, {
      accessToken,
      refreshToken,
      channelId: channelId || '',
      teamId,
      scope,
      expiresInSeconds: expiresIn,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'store_failed';
    return NextResponse.redirect(
      new URL(`/settings/seo?slack_error=${encodeURIComponent(msg)}`, request.url),
    );
  }

  return NextResponse.redirect(
    new URL(`/settings/seo?slack_success=true&config_id=${configId}`, request.url),
  );
}
