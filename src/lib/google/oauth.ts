/**
 * Google OAuth 2.0 utilities.
 *
 * Uses raw fetch (no npm dependency) against Google's OAuth endpoints.
 * Tokens are encrypted before storage via encryption.ts.
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/** Scopes we request for Gmail read/send + Calendar read */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'openid',
  'email',
  'profile',
];

function getClientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error('GOOGLE_CLIENT_ID not set');
  return id;
}

function getClientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error('GOOGLE_CLIENT_SECRET not set');
  return secret;
}

function getRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
  return `${base}/api/integrations/google/callback`;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
  id_token?: string;
}

/**
 * Build the authorization URL that sends the user to Google's consent screen.
 * `state` should include a CSRF token or user identifier.
 */
export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',    // ensures refresh_token is returned
    prompt: 'consent',         // force consent to always get refresh_token
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange the one-time authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }

  return res.json();
}

/**
 * Use a refresh token to get a fresh access token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} ${text}`);
  }

  return res.json();
}

/**
 * Revoke the user's token (access or refresh) so Google forgets the grant.
 */
export async function revokeToken(token: string): Promise<void> {
  const res = await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  // Google returns 200 on success; we don't throw on errors here since
  // the user may have already revoked access via Google's account settings.
  if (!res.ok) {
    console.warn('Google token revocation returned', res.status);
  }
}
