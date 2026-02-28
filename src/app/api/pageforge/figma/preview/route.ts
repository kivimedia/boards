import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/pageforge/figma/preview
 * Get a thumbnail/preview of a Figma frame.
 * Query: ?siteProfileId=xxx&fileKey=xxx&nodeId=xxx
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const siteProfileId = url.searchParams.get('siteProfileId');
  const fileKey = url.searchParams.get('fileKey');
  const nodeId = url.searchParams.get('nodeId');

  if (!siteProfileId || !fileKey) {
    return errorResponse('siteProfileId and fileKey are required');
  }

  const { data: site } = await auth.ctx.supabase
    .from('pageforge_site_profiles')
    .select('figma_personal_token')
    .eq('id', siteProfileId)
    .single();

  if (!site?.figma_personal_token) {
    return errorResponse('Figma token not configured');
  }

  try {
    const { createFigmaClient, figmaGetImages } = await import('@/lib/integrations/figma-client');
    const client = createFigmaClient(site.figma_personal_token);

    const nodeIds = nodeId ? [nodeId] : [];

    if (nodeIds.length === 0) {
      // Get file thumbnail
      const res = await fetch(`https://api.figma.com/v1/files/${fileKey}?depth=1`, {
        headers: client.headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({
          name: data.name,
          thumbnailUrl: data.thumbnailUrl,
          lastModified: data.lastModified,
        });
      }
      return errorResponse('Could not fetch file info', 500);
    }

    // Get node images
    const images = await figmaGetImages(client, fileKey, nodeIds, { format: 'png', scale: 1 });
    return NextResponse.json({ images: images.images });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Figma API error', 500);
  }
}
