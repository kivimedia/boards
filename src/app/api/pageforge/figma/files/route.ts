import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

interface FigmaFileEntry {
  key: string;
  name: string;
  thumbnail_url: string | null;
  last_modified: string;
  project_name: string;
}

// ---------------------------------------------------------------------------
// In-memory cache: siteProfileId -> { files, fetchedAt }
// Files rarely change, so caching 5 min is safe and eliminates rate limits.
// ---------------------------------------------------------------------------
const cache = new Map<string, { files: FigmaFileEntry[]; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch files for a single project SEQUENTIALLY with up to 3 retries.
 * Waits progressively longer on rate limits.
 */
async function fetchProjectFiles(
  projectId: string,
  projectName: string,
  headers: Record<string, string>,
): Promise<FigmaFileEntry[]> {
  const delays = [0, 1000, 2000]; // retry delays
  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      if (delays[attempt]) await new Promise((r) => setTimeout(r, delays[attempt]));
      const res = await fetch(`https://api.figma.com/v1/projects/${projectId}/files`, {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const wait = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000;
        await new Promise((r) => setTimeout(r, wait));
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
 * Query: ?siteProfileId=xxx&bust=1 (bust=1 forces cache refresh)
 * Returns: { files: FigmaFileEntry[], cached: boolean }
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const siteProfileId = url.searchParams.get('siteProfileId');
  const bustCache = url.searchParams.get('bust') === '1';

  if (!siteProfileId) {
    return errorResponse('siteProfileId is required');
  }

  // Check cache first (unless bust requested)
  if (!bustCache) {
    const cached = cache.get(siteProfileId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return NextResponse.json({ files: cached.files, cached: true });
    }
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

    // 2. Check if streaming progress was requested
    const stream = url.searchParams.get('stream') === '1';

    if (stream) {
      // Stream progress updates so the UI can show "Loading 3/12 projects..."
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const allFiles: FigmaFileEntry[] = [];
          for (let i = 0; i < projects.length; i++) {
            const project = projects[i];
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ progress: i + 1, total: projects.length })}\n\n`));
            const files = await fetchProjectFiles(project.id, project.name, headers);
            allFiles.push(...files);
            if (i < projects.length - 1) {
              await new Promise((r) => setTimeout(r, 150));
            }
          }
          allFiles.sort((a, b) => new Date(b.last_modified).getTime() - new Date(a.last_modified).getTime());
          cache.set(siteProfileId!, { files: allFiles, fetchedAt: Date.now() });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, files: allFiles })}\n\n`));
          controller.close();
        },
      });
      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    // Non-streaming: fetch all sequentially then return
    const allFiles: FigmaFileEntry[] = [];

    for (let i = 0; i < projects.length; i++) {
      const files = await fetchProjectFiles(projects[i].id, projects[i].name, headers);
      allFiles.push(...files);
      if (i < projects.length - 1) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    // Sort by last_modified descending (most recent first)
    allFiles.sort(
      (a, b) => new Date(b.last_modified).getTime() - new Date(a.last_modified).getTime(),
    );

    // Cache the result
    cache.set(siteProfileId, { files: allFiles, fetchedAt: Date.now() });

    return NextResponse.json({ files: allFiles, cached: false });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Figma API error', 500);
  }
}
