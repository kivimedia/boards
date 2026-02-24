import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exchangeCodeForTokens } from '@/lib/integrations/google-calendar';
import { encryptToHex } from '@/lib/encryption';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    return Response.redirect(new URL('/settings/integrations?gcal=error&reason=' + error, url.origin));
  }

  if (!code) {
    return Response.redirect(new URL('/settings/integrations?gcal=error&reason=no_code', url.origin));
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const redirectUri = `${url.origin}/api/google-calendar/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    // Deactivate any existing connection
    await supabase
      .from('google_calendar_connection')
      .update({ is_active: false })
      .eq('is_active', true);

    // Get the current user from cookies (best-effort, callback may not have session)
    // Use service role to insert since callback is a redirect from Google
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);
    const userId = profiles?.[0]?.id; // Fallback: first user (agency owner)

    // Insert new connection
    await supabase.from('google_calendar_connection').insert({
      user_id: userId,
      google_email: tokens.email,
      refresh_token_encrypted: encryptToHex(tokens.refresh_token),
      access_token_encrypted: encryptToHex(tokens.access_token),
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      is_active: true,
    });

    return Response.redirect(new URL('/settings/integrations?gcal=connected', url.origin));
  } catch (err: any) {
    console.error('[GoogleCalendar] Callback error:', err);
    return Response.redirect(new URL('/settings/integrations?gcal=error&reason=token_exchange_failed', url.origin));
  }
}
