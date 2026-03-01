import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/pageforge/sites
 * List all site profiles.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.ctx.supabase
    .from('pageforge_site_profiles')
    .select('*, client:clients(id, name)')
    .order('created_at', { ascending: false });

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ sites: data || [] });
}

/**
 * POST /api/pageforge/sites
 * Create a new site profile.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { siteName, siteUrl, wpRestUrl, wpUsername, wpAppPassword, pageBuilder, ...rest } = body;

  if (!siteName || !siteUrl || !wpRestUrl) {
    return errorResponse('siteName, siteUrl, and wpRestUrl are required');
  }

  const { data, error } = await auth.ctx.supabase
    .from('pageforge_site_profiles')
    .insert({
      site_name: siteName,
      site_url: siteUrl,
      wp_rest_url: wpRestUrl,
      wp_username: wpUsername || null,
      wp_app_password: wpAppPassword || null,
      page_builder: pageBuilder || 'gutenberg',
      client_id: rest.clientId || null,
      wp_ssh_host: rest.wpSshHost || null,
      wp_ssh_user: rest.wpSshUser || null,
      wp_ssh_key_path: rest.wpSshKeyPath || null,
      figma_personal_token: rest.figmaPersonalToken || null,
      figma_team_id: rest.figmaTeamId || null,
      theme_name: rest.themeName || null,
      theme_css_url: rest.themeCssUrl || null,
      global_css: rest.globalCss || null,
      yoast_enabled: rest.yoastEnabled ?? true,
      vqa_pass_threshold: rest.vqaPassThreshold ?? 80,
      lighthouse_min_score: rest.lighthouseMinScore ?? 80,
      max_vqa_fix_loops: rest.maxVqaFixLoops ?? 15,
      created_by: auth.ctx.userId,
    })
    .select('*')
    .single();

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ site: data }, { status: 201 });
}
