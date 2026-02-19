import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

/**
 * GET /api/cards/[id]/details?boardId=xxx
 * Returns all data needed by CardModal in a single request:
 *   card, board info, placement, labels, board labels, assignees, profiles, comments, signed cover URL
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const boardId = request.nextUrl.searchParams.get('boardId');
  if (!boardId) return errorResponse('boardId query param is required');

  const [
    cardResult,
    boardResult,
    placementResult,
    cardLabelsResult,
    boardLabelsResult,
    assigneesResult,
    profilesResult,
    commentsResult,
  ] = await Promise.all([
    supabase.from('cards').select('*').eq('id', params.id).single(),
    supabase.from('boards').select('type, name').eq('id', boardId).single(),
    supabase.from('card_placements').select('list:lists(name)').eq('card_id', params.id).eq('is_mirror', false).single(),
    supabase.from('card_labels').select('label:labels(*)').eq('card_id', params.id),
    supabase.from('labels').select('*').eq('board_id', boardId),
    supabase.from('card_assignees').select('user:profiles(*)').eq('card_id', params.id),
    supabase.from('profiles').select('*'),
    supabase.from('comments').select('*, profile:profiles(*)').eq('card_id', params.id).order('created_at', { ascending: true }),
  ]);

  if (cardResult.error || !cardResult.data) {
    return errorResponse(cardResult.error?.message || 'Card not found', 404);
  }

  const card = cardResult.data;

  // Sign cover URL if needed
  let signedCoverUrl: string | null = card.cover_image_url || null;
  if (card.cover_image_url && !card.cover_image_url.startsWith('http')) {
    const { data: signedData } = await supabase.storage
      .from('card-attachments')
      .createSignedUrl(card.cover_image_url, 3600);
    signedCoverUrl = signedData?.signedUrl || card.cover_image_url;
  }

  return successResponse({
    card,
    boardType: boardResult.data?.type || null,
    boardName: boardResult.data?.name || '',
    listName: (placementResult.data?.list as any)?.name || '',
    labels: cardLabelsResult.data?.map((cl: any) => cl.label).filter(Boolean) || [],
    boardLabels: boardLabelsResult.data || [],
    assignees: assigneesResult.data?.map((a: any) => a.user).filter(Boolean) || [],
    profiles: profilesResult.data || [],
    comments: commentsResult.data || [],
    signedCoverUrl,
  });
}
