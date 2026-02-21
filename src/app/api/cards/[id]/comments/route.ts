import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { notifyWatchers } from '@/lib/card-watchers';

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
  mentioned_user_ids?: string[];
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

  const commentId = insertRes.data.id;
  const mentionedUserIds = body.body.mentioned_user_ids || [];

  // Save mentions + send notifications (non-blocking)
  if (mentionedUserIds.length > 0) {
    const mentionRows = mentionedUserIds.map((uid: string) => ({
      comment_id: commentId,
      user_id: uid,
    }));
    supabase.from('mentions').insert(mentionRows).then(() => {});

    // Create in-app notifications for mentioned users
    const authorName = profileRes.data?.display_name || 'Someone';
    const notifRows = mentionedUserIds
      .filter((uid: string) => uid !== userId)
      .map((uid: string) => ({
        user_id: uid,
        type: 'mention' as const,
        title: `${authorName} mentioned you in a comment`,
        body: insertRes.data.content?.slice(0, 120) || '',
        card_id: params.id,
        metadata: { comment_id: commentId },
      }));
    if (notifRows.length > 0) {
      supabase.from('notifications').insert(notifRows).then(() => {});
    }

    // Send email notifications via Resend (non-blocking)
    sendMentionEmails(supabase, mentionedUserIds, userId, authorName, insertRes.data.content, params.id).catch(() => {});
  }

  // Notify card watchers about the new comment (non-blocking)
  const authorName2 = profileRes.data?.display_name || 'Someone';
  notifyWatchers(
    supabase,
    params.id,
    `${authorName2} commented on a card`,
    insertRes.data.content?.slice(0, 120) || '',
    userId
  ).catch(() => {});

  const total = performance.now() - t0;
  const res = NextResponse.json(
    { data: { ...insertRes.data, profile: profileRes.data || null } },
    { status: 201 }
  );
  res.headers.set('Server-Timing', `auth;dur=${tAuth.toFixed(0)}, query;dur=${tQuery.toFixed(0)}, total;dur=${total.toFixed(0)}`);
  return res;
}

async function sendMentionEmails(
  supabase: any,
  mentionedUserIds: string[],
  authorId: string,
  authorName: string,
  commentContent: string,
  cardId: string
) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  // Get emails for mentioned users (excluding author)
  const targetIds = mentionedUserIds.filter(id => id !== authorId);
  if (targetIds.length === 0) return;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', targetIds);

  if (!profiles?.length) return;

  const emailMap = new Map<string, string>();
  for (const p of profiles) {
    if (p.email) emailMap.set(p.id, p.email);
  }

  // Get card title
  const { data: card } = await supabase.from('cards').select('title').eq('id', cardId).single();
  const cardTitle = card?.title || 'a card';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://kmboards.co';
  const cardUrl = `${siteUrl}/card/${cardId}`;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@dailycookie.co';

  for (const email of Array.from(emailMap.values())) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: `${authorName} mentioned you on "${cardTitle}" - KM Boards`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px 0;">
              <div style="background: #1a1f36; border-radius: 12px; padding: 16px 20px; margin-bottom: 20px;">
                <h1 style="color: #fff; font-size: 16px; margin: 0;">KM Boards</h1>
              </div>
              <p style="color: #333; font-size: 14px; line-height: 1.6;">
                <strong>${authorName}</strong> mentioned you in a comment on <strong>${cardTitle}</strong>:
              </p>
              <div style="background: #f5f5f5; border-left: 3px solid #4F6BFF; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 16px 0;">
                <p style="color: #555; font-size: 13px; line-height: 1.5; margin: 0; white-space: pre-wrap;">${commentContent.slice(0, 300)}${commentContent.length > 300 ? '...' : ''}</p>
              </div>
              <div style="text-align: center; margin: 24px 0;">
                <a href="${cardUrl}" style="display: inline-block; background: #4F6BFF; color: #fff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; font-size: 13px;">View Card</a>
              </div>
            </div>
          `,
        }),
      });
    } catch {
      // Silently fail per-email
    }
  }
}

interface UpdateCommentBody {
  commentId: string;
  content: string;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateCommentBody>(request);
  if (!body.ok) return body.response;

  if (!body.body.commentId) return errorResponse('commentId is required');
  if (!body.body.content?.trim()) return errorResponse('content is required');

  const { supabase, userId } = auth.ctx;

  // Check if current user is admin
  const { data: { session } } = await supabase.auth.getSession();
  const isAdmin = session?.user?.email === 'ziv@dailycookie.co';

  // Only allow editing own comments (or any comment if admin)
  const { data: comment } = await supabase
    .from('comments')
    .select('user_id')
    .eq('id', body.body.commentId)
    .single();

  if (!comment) return errorResponse('Comment not found', 404);
  if (comment.user_id !== userId && !isAdmin) return errorResponse('Cannot edit another user\'s comment', 403);

  const { data: updated, error } = await supabase
    .from('comments')
    .update({
      content: body.body.content.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.body.commentId)
    .select('*')
    .single();

  if (error) return errorResponse(error.message, 500);

  // Fetch profile for the response
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .eq('id', userId)
    .single();

  return successResponse({ ...updated, profile: profile || null });
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
