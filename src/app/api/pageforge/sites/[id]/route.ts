import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { encryptToHex, decryptFromHex } from '@/lib/encryption';

interface Params {
  params: { id: string };
}

/** Decrypt credentials, preferring _encrypted columns, falling back to plaintext. */
function decryptSiteCredentials(site: Record<string, unknown>): Record<string, unknown> {
  site.wp_app_password = site.wp_app_password_encrypted
    ? decryptFromHex(site.wp_app_password_encrypted as string)
    : site.wp_app_password;
  site.figma_personal_token = site.figma_personal_token_encrypted
    ? decryptFromHex(site.figma_personal_token_encrypted as string)
    : site.figma_personal_token;
  site.wp_ssh_key_path = site.wp_ssh_key_path_encrypted
    ? decryptFromHex(site.wp_ssh_key_path_encrypted as string)
    : site.wp_ssh_key_path;
  // Strip encrypted hex from response
  delete site.wp_app_password_encrypted;
  delete site.figma_personal_token_encrypted;
  delete site.wp_ssh_key_path_encrypted;
  return site;
}

/**
 * GET /api/pageforge/sites/[id]
 * Returns decrypted credentials (for edit form and internal use).
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.ctx.supabase
    .from('pageforge_site_profiles')
    .select('*, client:clients(id, name)')
    .eq('id', params.id)
    .single();

  if (error || !data) {
    return errorResponse('Site profile not found', 404);
  }

  return NextResponse.json({ site: decryptSiteCredentials(data) });
}

/**
 * PATCH /api/pageforge/sites/[id]
 * Encrypts sensitive fields before storing.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await request.json();

  // Map camelCase to snake_case
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const fieldMap: Record<string, string> = {
    siteName: 'site_name',
    siteUrl: 'site_url',
    wpRestUrl: 'wp_rest_url',
    wpUsername: 'wp_username',
    wpAppPassword: 'wp_app_password',
    wpSshHost: 'wp_ssh_host',
    wpSshUser: 'wp_ssh_user',
    wpSshKeyPath: 'wp_ssh_key_path',
    figmaPersonalToken: 'figma_personal_token',
    figmaTeamId: 'figma_team_id',
    pageBuilder: 'page_builder',
    themeName: 'theme_name',
    themeCssUrl: 'theme_css_url',
    globalCss: 'global_css',
    yoastEnabled: 'yoast_enabled',
    vqaPassThreshold: 'vqa_pass_threshold',
    lighthouseMinScore: 'lighthouse_min_score',
    maxVqaFixLoops: 'max_vqa_fix_loops',
    clientId: 'client_id',
  };

  for (const [camel, snake] of Object.entries(fieldMap)) {
    if (body[camel] !== undefined) {
      updates[snake] = body[camel];
    }
  }

  // Encrypt sensitive fields
  if (updates.wp_app_password !== undefined) {
    const val = updates.wp_app_password as string | null;
    updates.wp_app_password_encrypted = val ? encryptToHex(val) : null;
    updates.wp_app_password = null;
  }
  if (updates.figma_personal_token !== undefined) {
    const val = updates.figma_personal_token as string | null;
    updates.figma_personal_token_encrypted = val ? encryptToHex(val) : null;
    updates.figma_personal_token = null;
  }
  if (updates.wp_ssh_key_path !== undefined) {
    const val = updates.wp_ssh_key_path as string | null;
    updates.wp_ssh_key_path_encrypted = val ? encryptToHex(val) : null;
    updates.wp_ssh_key_path = null;
  }

  // Auto-update credentials_updated_at when sensitive fields change
  const SENSITIVE_ENCRYPTED = ['wp_app_password_encrypted', 'figma_personal_token_encrypted', 'wp_ssh_key_path_encrypted'];
  if (SENSITIVE_ENCRYPTED.some(k => k in updates)) {
    updates.credentials_updated_at = new Date().toISOString();
  }

  const { data, error } = await auth.ctx.supabase
    .from('pageforge_site_profiles')
    .update(updates)
    .eq('id', params.id)
    .select('*')
    .single();

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ site: data });
}

/**
 * DELETE /api/pageforge/sites/[id]
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { error } = await auth.ctx.supabase
    .from('pageforge_site_profiles')
    .delete()
    .eq('id', params.id);

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ deleted: true });
}
