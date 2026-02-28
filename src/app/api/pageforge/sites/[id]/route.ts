import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

/**
 * GET /api/pageforge/sites/[id]
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

  return NextResponse.json({ site: data });
}

/**
 * PATCH /api/pageforge/sites/[id]
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
