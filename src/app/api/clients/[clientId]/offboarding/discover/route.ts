import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { discoverClientCards, extractAssetLinks, buildSearchTerms } from '@/lib/offboarding';

interface Params {
  params: { clientId: string };
}

interface DiscoverBody {
  extraSearchTerms?: string[];
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  // Fetch client
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('*')
    .eq('id', params.clientId)
    .single();

  if (clientError || !client) return errorResponse('Client not found', 404);

  // Parse optional extra search terms
  let extraTerms: string[] = [];
  try {
    const body = await request.json();
    extraTerms = body?.extraSearchTerms || [];
  } catch {
    // No body or invalid JSON - that's fine
  }

  // Build search terms from client data
  const searchTerms = await buildSearchTerms(supabase, client, extraTerms);

  // Discover cards
  const cards = await discoverClientCards(supabase, params.clientId, searchTerms);

  // Extract asset links from discovered cards
  const { assets, fileAttachments } = await extractAssetLinks(supabase, cards);

  // Count credentials (don't decrypt yet - just count for preview)
  const { count: credentialCount } = await supabase
    .from('credential_entries')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', params.clientId);

  return successResponse({
    client,
    searchTerms,
    cards,
    assets,
    fileAttachments,
    credentialCount: credentialCount || 0,
    summary: {
      totalCards: cards.length,
      directCards: cards.filter(c => c.match_type === 'direct').length,
      heuristicCards: cards.filter(c => c.match_type === 'heuristic').length,
      figmaLinks: assets.figma.length,
      canvaLinks: assets.canva.length,
      dropboxLinks: assets.dropbox.length,
      driveLinks: assets.drive.length,
      otherLinks: assets.other.length,
      fileCount: fileAttachments.length,
      credentialCount: credentialCount || 0,
    },
  });
}
