'use client';

import { useState, useMemo, useCallback } from 'react';
import { Comment } from '@/lib/types';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import CommentReactions from './CommentReactions';

const URL_PATTERN = /(https?:\/\/[^\s<]+)/;

function extractUrls(text: string): string[] {
  return text.match(new RegExp(URL_PATTERN.source, 'g')) || [];
}

function linkifyContent(text: string) {
  const parts = text.split(URL_PATTERN);
  return parts.map((part, i) =>
    URL_PATTERN.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-electric hover:underline break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

interface CardCommentsProps {
  cardId: string;
  comments: Comment[];
  onRefresh: () => void;
  boardId?: string;
  currentUserId?: string | null;
}

export default function CardComments({ cardId, comments, onRefresh, currentUserId }: CardCommentsProps) {
  const [newComment, setNewComment] = useState('');
  const [replyText, setReplyText] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());

  // Group comments into threads
  const { topLevel, repliesByParent } = useMemo(() => {
    const top: Comment[] = [];
    const replies: Map<string, Comment[]> = new Map();
    for (const c of comments) {
      if (c.parent_comment_id) {
        const arr = replies.get(c.parent_comment_id) || [];
        arr.push(c);
        replies.set(c.parent_comment_id, arr);
      } else {
        top.push(c);
      }
    }
    return { topLevel: top, repliesByParent: replies };
  }, [comments]);

  const handleAddComment = async (parentId?: string) => {
    const text = parentId ? replyText : newComment;
    if (!text.trim()) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/cards/${cardId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text.trim(),
          parent_comment_id: parentId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('Failed to save comment:', data.error || res.statusText);
        setLoading(false);
        return;
      }

      if (parentId) {
        setReplyText('');
        setReplyingTo(null);
        setExpandedThreads((prev) => new Set(prev).add(parentId));
      } else {
        setNewComment('');
      }
      onRefresh();
    } catch (err) {
      console.error('Failed to save comment:', err);
    }
    setLoading(false);
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      const res = await fetch(`/api/cards/${cardId}/comments`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('Failed to delete comment:', data.error || res.statusText);
      }
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
    onRefresh();
  };

  const handleAddLinkAsAttachment = useCallback(async (comment: Comment) => {
    const urls = extractUrls(comment.content);
    if (urls.length === 0) return;
    for (const url of urls) {
      let name = url;
      try {
        const parsed = new URL(url);
        name = parsed.hostname + parsed.pathname;
        if (name.length > 60) name = name.slice(0, 60) + '...';
      } catch { /* use raw url */ }
      await fetch(`/api/cards/${cardId}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: name,
          file_size: 0,
          mime_type: 'text/x-uri',
          storage_path: url,
        }),
      });
    }
    onRefresh();
  }, [cardId, onRefresh]);

  const toggleThread = (commentId: string) => {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  };

  const renderComment = (comment: Comment, isReply = false) => {
    const replies = repliesByParent.get(comment.id) || [];
    const hasReplies = replies.length > 0;
    const isExpanded = expandedThreads.has(comment.id);

    return (
      <div key={comment.id} className={isReply ? 'ml-8 mt-2' : ''}>
        <div className="flex gap-2.5 group">
          <Avatar
            name={(comment as any).profile?.display_name || 'User'}
            src={(comment as any).profile?.avatar_url}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-navy dark:text-slate-100 font-heading">
                {(comment as any).profile?.display_name || 'User'}
              </span>
              <span className="text-[11px] text-navy/30 dark:text-slate-500 font-body">
                {new Date(comment.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              {currentUserId === comment.user_id && (
                <button
                  onClick={() => handleDeleteComment(comment.id)}
                  className="opacity-0 group-hover:opacity-100 text-navy/30 dark:text-slate-500 hover:text-danger text-xs transition-all ml-auto"
                >
                  Delete
                </button>
              )}
            </div>
            <p className="text-sm text-navy/70 dark:text-slate-300 mt-0.5 font-body whitespace-pre-wrap">
              {linkifyContent(comment.content)}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <CommentReactions commentId={comment.id} cardId={cardId} />
              {!isReply && (
                <button
                  onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                  className="text-[11px] text-navy/40 dark:text-slate-500 hover:text-electric transition-colors font-medium"
                >
                  Reply
                </button>
              )}
              {extractUrls(comment.content).length > 0 && (
                <button
                  onClick={() => handleAddLinkAsAttachment(comment)}
                  className="text-[11px] text-navy/40 dark:text-slate-500 hover:text-electric transition-colors font-medium"
                >
                  Add link as attachment
                </button>
              )}
              {hasReplies && !isReply && (
                <button
                  onClick={() => toggleThread(comment.id)}
                  className="text-[11px] text-electric/70 hover:text-electric transition-colors font-medium"
                >
                  {isExpanded ? 'Hide' : 'Show'} {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Reply input */}
        {replyingTo === comment.id && (
          <div className="ml-8 mt-2">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply..."
              className="w-full p-2.5 rounded-lg bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric resize-none font-body"
              rows={2}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleAddComment(comment.id);
                }
                if (e.key === 'Escape') {
                  setReplyingTo(null);
                  setReplyText('');
                }
              }}
            />
            {replyText.trim() && (
              <div className="flex items-center gap-2 mt-1.5">
                <Button size="sm" onClick={() => handleAddComment(comment.id)} loading={loading}>
                  Reply
                </Button>
                <button
                  onClick={() => { setReplyingTo(null); setReplyText(''); }}
                  className="text-xs text-navy/40 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Replies */}
        {hasReplies && (isExpanded || isReply) && (
          <div className="border-l-2 border-cream-dark dark:border-slate-700 ml-4 pl-0">
            {replies.map((reply) => renderComment(reply, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 mb-3 font-heading">
        Comments and activity
        <span className="ml-1.5 text-navy/30 dark:text-slate-500 font-normal">({comments.length})</span>
      </h3>

      {/* Add comment — top of column like Trello */}
      <div className="mb-4">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Write a comment..."
          className="w-full p-2.5 rounded-xl bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric resize-none font-body transition-all"
          rows={newComment ? 3 : 1}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              handleAddComment();
            }
          }}
        />
        {newComment.trim() && (
          <div className="flex justify-end mt-1.5">
            <Button size="sm" onClick={() => handleAddComment()} loading={loading}>
              Comment
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {topLevel.map((comment) => renderComment(comment))}
      </div>
    </div>
  );
}
