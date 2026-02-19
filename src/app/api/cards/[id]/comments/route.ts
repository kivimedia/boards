import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  // Fetch comments and profiles separately (no FK from comments→profiles)
  const [commentsRes, profilesRes] = await Promise.all([
    supabase
      .from('comments')
      .select('*')
      .eq('card_id', params.id)
      .order('created_at', { ascending: true }),
    supabase.from('profiles').select('*'),
  ]);

  if (commentsRes.error) return errorResponse(commentsRes.error.message, 500);

  const profilesMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));
  const commentsWithProfiles = (commentsRes.data || []).map((c: any) => ({
    ...c,
    profile: profilesMap.get(c.user_id) || null,
  }));

  return successResponse(commentsWithProfiles);
}

interface CreateCommentBody {
  content: string;
  parent_comment_id?: string | null;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateCommentBody>(request);
  if (!body.ok) return body.response;

  if (!body.body.content?.trim()) return errorResponse('Comment content is required');

  const { supabase, userId } = auth.ctx;

  const { data, error } = await supabase
    .from('comments')
    .insert({
      card_id: params.id,
      user_id: userId,
      content: body.body.content.trim(),
      parent_comment_id: body.body.parent_comment_id || null,
    })
    .select('*')
    .single();

  if (error) return errorResponse(error.message, 500);

  // Attach profile to the returned comment
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  return successResponse({ ...data, profile: profile || null }, 201);
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
