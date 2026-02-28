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
 * Fetch files for a single project with one retry on failure.
 */
async function fetchProjectFiles(
  projectId: string,
  projectName: string,
  headers: Record<string, string>,
): Promise<FigmaFileEntry[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 500));
      const res = await fetch(`https://api.figma.com/v1/projects/${projectId}/files`, {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 429) {
        // Rate limited - wait and retry
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      if (!res.ok) continue;
      const data = await res.json();
      return (data.files || []).map((f: any) => ({
        key: f.key,
        name: f.name,
        thumbnail_url: f.thumbnail_url || null,
        last_modified: f.last_modified,
        project_name: projectName,
      }));
    } catch {
      // timeout or network error - retry
    }
  }
  return [];
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

    // 2. Fetch files in batches of 5 with retry to avoid Figma rate limits
    const BATCH_SIZE = 5;
    const allFiles: FigmaFileEntry[] = [];

    for (let i = 0; i < projects.length; i += BATCH_SIZE) {
      const batch = projects.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((project) => fetchProjectFiles(project.id, project.name, headers)),
      );

      for (const files of batchResults) {
        allFiles.push(...files);
      }

      // Delay between batches to respect rate limits
      if (i + BATCH_SIZE < projects.length) {
        await new Promise((r) => setTimeout(r, 300));
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
