/**
 * Manages encrypted Google OAuth tokens stored in the `google_integrations` table.
 *
 * Tokens are AES-256-GCM encrypted via encryption.ts before hitting the DB.
 * Automatically refreshes expired access tokens.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { encryptToHex, decryptFromHex } from '@/lib/encryption';
import { refreshAccessToken, GoogleTokens } from './oauth';

export interface StoredGoogleIntegration {
  id: string;
  user_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string;
  scopes: string;
  connected_email: string | null;
  selected_calendars: string[] | null;
  created_at: string;
  updated_at: string;
}

/**
 * Store tokens after initial OAuth exchange.
 */
export async function storeTokens(
  supabase: SupabaseClient,
  userId: string,
  tokens: GoogleTokens,
  email: string | null,
): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const row = {
    user_id: userId,
    access_token_encrypted: encryptToHex(tokens.access_token),
    refresh_token_encrypted: tokens.refresh_token
      ? encryptToHex(tokens.refresh_token)
      : undefined,
    token_expires_at: expiresAt,
    scopes: tokens.scope,
    connected_email: email,
  };

  // Upsert — one integration row per user
  const { error } = await supabase
    .from('google_integrations')
    .upsert(row, { onConflict: 'user_id' });

  if (error) throw new Error(`Failed to store Google tokens: ${error.message}`);
}

/**
 * Retrieve a valid access token for the user.
 * Transparently refreshes if the current token has expired (or will in <60s).
 * Returns null if the user has no integration.
 */
export async function getValidAccessToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('google_integrations')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;

  const row = data as StoredGoogleIntegration;
  const expiresAt = new Date(row.token_expires_at).getTime();
  const bufferMs = 60_000; // refresh 60s before actual expiry

  if (Date.now() < expiresAt - bufferMs) {
    // Token still valid
    return decryptFromHex(row.access_token_encrypted);
  }

  // Need to refresh
  const refreshToken = decryptFromHex(row.refresh_token_encrypted);
  const newTokens = await refreshAccessToken(refreshToken);

  const newExpiry = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();

  await supabase
    .from('google_integrations')
    .update({
      access_token_encrypted: encryptToHex(newTokens.access_token),
      token_expires_at: newExpiry,
      // Google sometimes rotates the refresh token
      ...(newTokens.refresh_token
        ? { refresh_token_encrypted: encryptToHex(newTokens.refresh_token) }
        : {}),
    })
    .eq('user_id', userId);

  return newTokens.access_token;
}

/**
 * Fetch the integration row (without decrypting tokens) for display purposes.
 */
export async function getIntegrationStatus(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ connected: boolean; email: string | null; selectedCalendars: string[] | null }> {
  const { data } = await supabase
    .from('google_integrations')
    .select('connected_email, selected_calendars')
    .eq('user_id', userId)
    .single();

  if (!data) return { connected: false, email: null, selectedCalendars: null };
  return {
    connected: true,
    email: data.connected_email,
    selectedCalendars: data.selected_calendars,
  };
}

/**
 * Remove the user's Google integration (tokens deleted from DB).
 */
export async function removeTokens(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('google_integrations')
    .delete()
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to remove Google tokens: ${error.message}`);
}

/**
 * Update selected calendars for the user.
 */
export async function updateSelectedCalendars(
  supabase: SupabaseClient,
  userId: string,
  calendarIds: string[],
): Promise<void> {
  const { error } = await supabase
    .from('google_integrations')
    .update({ selected_calendars: calendarIds })
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to update calendar selection: ${error.message}`);
}
