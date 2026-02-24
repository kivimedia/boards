import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/google/oauth';
import { storeTokens } from '@/lib/google/token-manager';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (error) {
    return NextResponse.redirect(`${baseUrl}/settings?google_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/settings?google_error=missing_params`);
  }

  try {
    // Decode state to get the user ID
    const stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
    const userId = stateData.userId;
    if (!userId) throw new Error('Invalid state: no userId');

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Extract email from id_token if present
    let email: string | null = null;
    if (tokens.id_token) {
      try {
        const payload = JSON.parse(
          Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString(),
        );
        email = payload.email || null;
      } catch {
        // id_token decode failed; email stays null
      }
    }

    // Store encrypted tokens
    const supabase = createServerSupabaseClient();
    await storeTokens(supabase, userId, tokens, email);

    return NextResponse.redirect(`${baseUrl}/settings?google_connected=true`);
  } catch (err) {
    console.error('Google callback error:', err);
    return NextResponse.redirect(
      `${baseUrl}/settings?google_error=${encodeURIComponent((err as Error).message)}`,
    );
  }
}
