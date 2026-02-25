'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import remarkMentions from '@/lib/remark-mentions';
import { Comment } from '@/lib/types';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import CommentReactions from './CommentReactions';
import MentionInput from './MentionInput';
import { MarkdownToolbarUI } from './MarkdownToolbar';
import { useAutoResize } from '@/hooks/useAutoResize';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { useUndoRedoKeyboard } from '@/hooks/useUndoRedoKeyboard';

const URL_PATTERN = /(https?:\/\/[^\s<]+)/;
// Matches Trello/ClickUp smart-link format: [https://url.com "smartCard-inline"] or [https://url.com ""]
const SMART_LINK_PATTERN = /\[(https?:\/\/[^\s\]]+)\s+"[^"]*"\]/g;

function extractUrls(text: string): string[] {
  return text.match(new RegExp(URL_PATTERN.source, 'g')) || [];
}

function shortenUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    let path = parsed.pathname;
    if (path === '/') return host;
    // Truncate long paths
    if (path.length > 30) path = path.slice(0, 27) + '...';
    return host + path;
  } catch {
    // Fallback: just truncate the raw URL
    return url.length > 50 ? url.slice(0, 47) + '...' : url;
  }
}

/** Strip Trello/ClickUp smart-link wrappers before linkifying: [url "type"] → url */
function normalizeSmartLinks(text: string): string {
  return text.replace(SMART_LINK_PATTERN, '$1');
}

function linkifyContent(text: string, showFullLinks = false) {
  const normalized = normalizeSmartLinks(text);
  const parts = normalized.split(URL_PATTERN);
  return parts.map((part, i) =>
    URL_PATTERN.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-electric hover:underline break-all"
        onClick={(e) => e.stopPropagation()}
        title={showFullLinks ? undefined : part}
      >
        {showFullLinks ? part : shortenUrl(part)}
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
  onCommentAdded?: (comment: Comment) => void;
  boardId?: string;
  currentUserId?: string | null;
  isAdmin?: boolean;
}

export default function CardComments({ cardId, comments, onRefresh, onCommentAdded, boardId, currentUserId, isAdmin }: CardCommentsProps) {
  // Undo/Redo for new comment
  const newCommentUndo = useUndoRedo('');
  const [replyText, setReplyText] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  // Undo/Redo for edit text
  const editTextUndo = useUndoRedo('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const mainTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  useAutoResize(editTextareaRef, editTextUndo.value);
  useAutoResize(replyTextareaRef, replyText);
  const [showFullLinks, setShowFullLinks] = useState(false);

  // Attach keyboard shortcuts for undo/redo
  useUndoRedoKeyboard(mainTextareaRef, newCommentUndo.undo, newCommentUndo.redo);
  useUndoRedoKeyboard(editTextareaRef, editTextUndo.undo, editTextUndo.redo);

  // Group comments into threads
  // Detect when comments are unexpectedly cleared (e.g., on tab switch) and refetch
  useEffect(() => {
    // If we're editing a comment and comments suddenly become empty, that's suspicious
    if (editingCommentId && comments.length === 0) {
      // Refetch after a short delay to let any pending operations complete
      const timer = setTimeout(() => {
        onRefresh();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [comments.length, editingCommentId, onRefresh]);

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
    // Most recent comments at the top
    top.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    // Replies stay oldest-first within each thread
    replies.forEach((arr) => arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
    return { topLevel: top, repliesByParent: replies };
  }, [comments]);

  const handleAddComment = async (parentId?: string, mentionedUserIds?: string[], directContent?: string) => {
    const text = directContent || (parentId ? replyText : newCommentUndo.value);
    if (!text.trim()) return;
    setLoading(true);
    setCommentError(null);

    try {
      const res = await fetch(`/api/cards/${cardId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text.trim(),
          parent_comment_id: parentId || null,
          ...(mentionedUserIds?.length ? { mentioned_user_ids: mentionedUserIds } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data.error || `Error ${res.status}`;
        console.error('Failed to save comment:', msg);
        setCommentError(msg);
        setLoading(false);
        return;
      }

      // Parse the saved comment from the response for instant rendering
      const responseData = await res.json().catch(() => null);
      const savedComment = responseData?.data as Comment | undefined;

      if (parentId) {
        setReplyText('');
        setReplyingTo(null);
        setExpandedThreads((prev) => new Set(prev).add(parentId));
      } else {
        newCommentUndo.clearHistory();
      }

      // Immediately show the new comment from POST response (no full refresh needed)
      if (savedComment && onCommentAdded) {
        onCommentAdded(savedComment);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      console.error('Failed to save comment:', msg);
      setCommentError(msg);
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

  const handleEditComment = async (commentId: string) => {
    if (!editTextUndo.value.trim()) return;
    setEditLoading(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/cards/${cardId}/comments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId, content: editTextUndo.value.trim() }),
      });
      if (res.ok) {
        setEditingCommentId(null);
        editTextUndo.clearHistory();
        setEditError(null);
        onRefresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setEditError(data?.error || `Save failed (${res.status}). Please try again.`);
      }
    } catch (err) {
      console.error('Failed to edit comment:', err);
      setEditError('Network error — please check your connection and try again.');
    } finally {
      setEditLoading(false);
    }
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
              {(currentUserId === comment.user_id || isAdmin) && (
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all ml-auto">
                  <button
                    onClick={() => { setEditingCommentId(comment.id); editTextUndo.setValue(comment.content); }}
                    className="text-navy/30 dark:text-slate-500 hover:text-electric text-xs"
                  >
                    Edit
                  </button>
                  {currentUserId === comment.user_id && (
                    <button
                      onClick={() => handleDeleteComment(comment.id)}
                      className="text-navy/30 dark:text-slate-500 hover:text-danger text-xs"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
            {editingCommentId === comment.id ? (
              <div className="mt-1">
                <MarkdownToolbarUI
                  textareaRef={editTextareaRef}
                  value={editTextUndo.value}
                  onChange={editTextUndo.setValue}
                />
                <textarea
                  ref={editTextareaRef}
                  value={editTextUndo.value}
                  onChange={(e) => editTextUndo.setValue(e.target.value)}
                  className="w-full p-2.5 rounded-b-lg rounded-t-none bg-cream dark:bg-navy border border-electric/30 border-t-0 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 resize-none overflow-hidden font-body min-h-[76px]"
                  rows={1}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { handleEditComment(comment.id); return; }
                    if (e.key === 'Escape') { setEditingCommentId(null); editTextUndo.clearHistory(); return; }
                    const ta = editTextareaRef.current;
                    if (ta && e.key === 'b' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      const s = ta.selectionStart, en = ta.selectionEnd;
                      const sel = editTextUndo.value.slice(s, en) || 'bold text';
                      editTextUndo.setValue(editTextUndo.value.slice(0, s) + '**' + sel + '**' + editTextUndo.value.slice(en));
                      requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + 2, s + 2 + sel.length); });
                    } else if (ta && e.key === 'i' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      const s = ta.selectionStart, en = ta.selectionEnd;
                      const sel = editTextUndo.value.slice(s, en) || 'italic text';
                      editTextUndo.setValue(editTextUndo.value.slice(0, s) + '*' + sel + '*' + editTextUndo.value.slice(en));
                      requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + 1, s + 1 + sel.length); });
                    }
                  }}
                />
                {editError && (
                  <p className="text-xs text-danger mt-1 font-body">{editError}</p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  <Button size="sm" onClick={() => handleEditComment(comment.id)} loading={editLoading}>Save</Button>
                  <button onClick={() => { setEditingCommentId(null); editTextUndo.clearHistory(); setEditError(null); }} className="text-xs text-navy/40 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-300">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-navy/70 dark:text-slate-300 mt-0.5 font-body prose prose-sm dark:prose-invert max-w-full prose-p:my-0.5 prose-p:font-body prose-a:text-electric prose-a:no-underline hover:prose-a:underline prose-code:text-electric prose-code:bg-electric/10 prose-code:px-1 prose-code:rounded prose-ul:my-2 prose-ul:list-disc prose-ul:ml-5 prose-ol:my-2 prose-ol:list-decimal prose-ol:ml-5 prose-li:my-1.5 prose-li:ml-0 [overflow-wrap:break-word] [word-break:break-word]">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMentions]}
                  rehypePlugins={[rehypeRaw]}
                  components={{
                    a: ({ href, children }) => (
                      <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                        {showFullLinks ? href : children}
                      </a>
                    ),
                  }}
                >
                  {normalizeSmartLinks(comment.content)}
                </ReactMarkdown>
                {comment.updated_at && comment.updated_at !== comment.created_at && (
                  <span className="text-[10px] text-navy/25 dark:text-slate-600 ml-1.5">(edited)</span>
                )}
              </div>
            )}
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
              ref={replyTextareaRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply..."
              className="w-full p-2.5 rounded-lg bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric resize-none overflow-hidden font-body min-h-[60px]"
              rows={1}
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
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 font-heading">
          Comments and activity
          <span className="ml-1.5 text-navy/30 dark:text-slate-500 font-normal">({comments.length})</span>
        </h3>
        <button
          onClick={() => setShowFullLinks(!showFullLinks)}
          className="text-[10px] text-navy/35 dark:text-slate-500 hover:text-electric transition-colors font-body flex items-center gap-1"
          title={showFullLinks ? 'Show shortened links' : 'Show full links'}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
          {showFullLinks ? 'Shorten links' : 'Full links'}
        </button>
      </div>

      {/* Add comment — top of column like Trello */}
      <div className="mb-4">
        <MentionInput
          cardId={cardId}
          boardId={boardId}
          onSubmit={(content, mentionedUserIds) => {
            handleAddComment(undefined, mentionedUserIds, content);
          }}
        />
        {commentError && (
          <p className="text-xs text-danger mt-1 font-body">{commentError}</p>
        )}
      </div>

      <div className="space-y-3">
        {topLevel.map((comment) => renderComment(comment))}
      </div>
    </div>
  );
}
