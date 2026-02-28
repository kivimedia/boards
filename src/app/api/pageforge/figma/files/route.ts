import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

interface FigmaFileEntry {
  key: string;
  name: string;
  thumbnail_url: string | null;
  last_modified: string;
  project_name: string;
}

/**
 * GET /api/pageforge/figma/files
 * List Figma files from the site profile's team projects.
 * Query: ?siteProfileId=xxx
 * Returns: { files: FigmaFileEntry[] }
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

  const headers = { 'X-Figma-Token': site.figma_personal_token };

  try {
    const teamId = site.figma_team_id;
    if (!teamId) {
      return NextResponse.json({
        files: [],
        message: 'Set figma_team_id on the site profile to list team files',
      });
    }

    // 1. Fetch team projects
    const projRes = await fetch(`https://api.figma.com/v1/teams/${teamId}/projects`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!projRes.ok) {
      return errorResponse(`Figma team projects failed: ${projRes.status}`, 502);
    }

    const projData = await projRes.json();
    const projects: Array<{ id: string; name: string }> = projData.projects || [];

    // 2. Fetch files in batches of 10 to avoid Figma rate limits
    const BATCH_SIZE = 10;
    const allFiles: FigmaFileEntry[] = [];

    for (let i = 0; i < projects.length; i += BATCH_SIZE) {
      const batch = projects.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (project) => {
          const res = await fetch(`https://api.figma.com/v1/projects/${project.id}/files`, {
            headers,
            signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) return [];
          const data = await res.json();
          return (data.files || []).map((f: any) => ({
            key: f.key,
            name: f.name,
            thumbnail_url: f.thumbnail_url || null,
            last_modified: f.last_modified,
            project_name: project.name,
          }));
        }),
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          allFiles.push(...result.value);
        }
      }

      // Small delay between batches to respect rate limits
      if (i + BATCH_SIZE < projects.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // Sort by last_modified descending (most recent first)
    allFiles.sort(
      (a, b) => new Date(b.last_modified).getTime() - new Date(a.last_modified).getTime(),
    );

    return NextResponse.json({ files: allFiles });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Figma API error', 500);
  }
}
