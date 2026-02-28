import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/pageforge/figma/files
 * List recent Figma files for a site profile's team.
 * Query: ?siteProfileId=xxx
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const siteProfileId = url.searchParams.get('siteProfileId');

  if (!siteProfileId) {
    return errorResponse('siteProfileId is required');
  }

  const { data: site } = await auth.ctx.supabase
    .from('pageforge_site_profiles')
    .select('figma_personal_token, figma_team_id')
    .eq('id', siteProfileId)
    .single();

  if (!site?.figma_personal_token) {
    return errorResponse('Figma token not configured for this site');
  }

  try {
    const { createFigmaClient } = await import('@/lib/integrations/figma-client');
    const client = createFigmaClient(site.figma_personal_token);

    // Fetch team projects or recent files
    const teamId = site.figma_team_id;
    if (teamId) {
      const res = await fetch(`https://api.figma.com/v1/teams/${teamId}/projects`, {
        headers: client.headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({ projects: data.projects || [] });
      }
    }

    // Fallback: return empty if no team
    return NextResponse.json({ projects: [], message: 'Set figma_team_id for team file listing' });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Figma API error', 500);
  }
}
