import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

function getAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

interface Params {
  params: { id: string };
}

/**
 * GET /api/cards/[id]/details?boardId=xxx
 * Returns all data needed by CardModal in a single request.
 * Server-Timing header shows per-phase durations for profiling.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const t0 = performance.now();

  const auth = await getAuthContext();
  const tAuth = performance.now() - t0;
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  // Use service role for tables blocked by RLS (card_assignees, profiles)
  const db = getAdminClient() ?? supabase;
  const boardId = request.nextUrl.searchParams.get('boardId');
  if (!boardId) return errorResponse('boardId query param is required');

  const tQuery0 = performance.now();
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
    db.from('card_assignees').select('*').eq('card_id', params.id),
    db.from('profiles').select('id, display_name, avatar_url, role'),
    supabase.from('comments').select('*').eq('card_id', params.id).order('created_at', { ascending: false }),
  ]);
  const tQuery = performance.now() - tQuery0;

  if (cardResult.error || !cardResult.data) {
    return errorResponse(cardResult.error?.message || 'Card not found', 404);
  }

  const card = cardResult.data;

  // Sign cover URL if needed
  let signedCoverUrl: string | null = card.cover_image_url || null;
  let tCover = 0;
  if (card.cover_image_url && !card.cover_image_url.startsWith('http')) {
    const tCover0 = performance.now();
    const { data: signedData } = await supabase.storage
      .from('card-attachments')
      .createSignedUrl(card.cover_image_url, 3600);
    signedCoverUrl = signedData?.signedUrl || card.cover_image_url;
    tCover = performance.now() - tCover0;
  }

  // Manually attach profiles to comments and assignees (no FK from these tables→profiles)
  const profilesMap = new Map((profilesResult.data || []).map((p: any) => [p.id, p]));
  const commentsWithProfiles = (commentsResult.data || []).map((c: any) => ({
    ...c,
    profile: profilesMap.get(c.user_id) || null,
  }));

  const total = performance.now() - t0;

  // Check if current user is admin (ziv@dailycookie.co)
  const currentProfile = profilesMap.get(auth.ctx.userId) as any;
  const { data: { session } } = await supabase.auth.getSession();
  const isAdmin = session?.user?.email === 'ziv@dailycookie.co';

  const responseData = {
    card,
    userId: auth.ctx.userId,
    isAdmin,
    boardType: boardResult.data?.type || null,
    boardName: boardResult.data?.name || '',
    listName: (placementResult.data?.list as any)?.name || '',
    labels: cardLabelsResult.data?.map((cl: any) => cl.label).filter(Boolean) || [],
    boardLabels: boardLabelsResult.data || [],
    assignees: (assigneesResult.data || []).map((a: any) => profilesMap.get(a.user_id)).filter(Boolean),
    profiles: profilesResult.data || [],
    comments: commentsWithProfiles,
    signedCoverUrl,
  };

  const res = NextResponse.json({ data: responseData });
  const timings = [`auth;dur=${tAuth.toFixed(0)}`, `queries;dur=${tQuery.toFixed(0)}`];
  if (tCover > 0) timings.push(`cover;dur=${tCover.toFixed(0)}`);
  timings.push(`total;dur=${total.toFixed(0)}`);
  res.headers.set('Server-Timing', timings.join(', '));
  return res;
}
