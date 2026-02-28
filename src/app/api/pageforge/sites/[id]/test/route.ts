import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { wpTestConnection } from '@/lib/integrations/wordpress-client';
import { wpCliTestConnection } from '@/lib/integrations/wp-cli-client';
import { figmaTestConnection } from '@/lib/integrations/figma-client';

interface Params {
  params: { id: string };
}

/**
 * POST /api/pageforge/sites/[id]/test
 * Test connections for a site profile (WP REST, SSH, Figma).
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { data: site, error } = await auth.ctx.supabase
    .from('pageforge_site_profiles')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !site) {
    return errorResponse('Site profile not found', 404);
  }

  const results: Record<string, { ok: boolean; message: string }> = {};

  // Test WordPress REST API
  if (site.wp_username && site.wp_app_password) {
    const wpResult = await wpTestConnection({
      restUrl: site.wp_rest_url,
      username: site.wp_username,
      appPassword: site.wp_app_password,
    });
    results.wordpress = {
      ok: wpResult.ok,
      message: wpResult.ok ? `Connected to ${wpResult.siteName}` : wpResult.error || 'Failed',
    };
  } else {
    results.wordpress = { ok: false, message: 'Credentials not configured' };
  }

  // Test SSH (if configured)
  if (site.wp_ssh_host && site.wp_ssh_user) {
    const sshResult = await wpCliTestConnection({
      host: site.wp_ssh_host,
      user: site.wp_ssh_user,
      keyPath: site.wp_ssh_key_path || undefined,
    });
    results.ssh = {
      ok: sshResult.ok,
      message: sshResult.ok ? `WP-CLI ${sshResult.wpCliVersion}` : sshResult.error || 'Failed',
    };
  }

  // Test Figma
  if (site.figma_personal_token) {
    const figmaResult = await figmaTestConnection(site.figma_personal_token);
    results.figma = {
      ok: figmaResult.ok,
      message: figmaResult.ok ? `Authenticated as ${figmaResult.email}` : figmaResult.error || 'Failed',
    };
  } else {
    results.figma = { ok: false, message: 'Token not configured' };
  }

  const allPassed = Object.values(results).every(r => r.ok);

  return NextResponse.json({ results, allPassed });
}
