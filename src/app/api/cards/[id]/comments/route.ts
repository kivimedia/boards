import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const t0 = performance.now();
  const auth = await getAuthContext();
  const tAuth = performance.now() - t0;
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const tQuery0 = performance.now();
  const [commentsRes, profilesRes] = await Promise.all([
    supabase
      .from('comments')
      .select('*')
      .eq('card_id', params.id)
      .order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, display_name, avatar_url'),
  ]);
  const tQuery = performance.now() - tQuery0;

  if (commentsRes.error) return errorResponse(commentsRes.error.message, 500);

  const profilesMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));
  const commentsWithProfiles = (commentsRes.data || []).map((c: any) => ({
    ...c,
    profile: profilesMap.get(c.user_id) || null,
  }));

  const total = performance.now() - t0;
  const res = NextResponse.json({ data: commentsWithProfiles });
  res.headers.set('Server-Timing', `auth;dur=${tAuth.toFixed(0)}, query;dur=${tQuery.toFixed(0)}, total;dur=${total.toFixed(0)}`);
  return res;
}

interface CreateCommentBody {
  content: string;
  parent_comment_id?: string | null;
}

export async function POST(request: NextRequest, { params }: Params) {
  const t0 = performance.now();
  const auth = await getAuthContext();
  const tAuth = performance.now() - t0;
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateCommentBody>(request);
  if (!body.ok) return body.response;

  if (!body.body.content?.trim()) return errorResponse('Comment content is required');

  const { supabase, userId } = auth.ctx;

  // Insert comment and fetch profile in parallel
  const tQuery0 = performance.now();
  const [insertRes, profileRes] = await Promise.all([
    supabase
      .from('comments')
      .insert({
        card_id: params.id,
        user_id: userId,
        content: body.body.content.trim(),
        parent_comment_id: body.body.parent_comment_id || null,
      })
      .select('*')
      .single(),
    supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .eq('id', userId)
      .single(),
  ]);
  const tQuery = performance.now() - tQuery0;

  if (insertRes.error) return errorResponse(insertRes.error.message, 500);

  const total = performance.now() - t0;
  const res = NextResponse.json(
    { data: { ...insertRes.data, profile: profileRes.data || null } },
    { status: 201 }
  );
  res.headers.set('Server-Timing', `auth;dur=${tAuth.toFixed(0)}, query;dur=${tQuery.toFixed(0)}, total;dur=${total.toFixed(0)}`);
  return res;
}

interface DeleteCommentBody {
  commentId: string;
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<DeleteCommentBody>(request);
  if (!body.ok) return body.response;

  if (!body.body.commentId) return errorResponse('commentId is required');

  const { supabase, userId } = auth.ctx;

  // Only allow deleting own comments
  const { data: comment } = await supabase
    .from('comments')
    .select('user_id')
    .eq('id', body.body.commentId)
    .single();

  if (!comment) return errorResponse('Comment not found', 404);
  if (comment.user_id !== userId) return errorResponse('Cannot delete another user\'s comment', 403);

  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', body.body.commentId);

  if (error) return errorResponse(error.message, 500);
  return successResponse(null);
}
