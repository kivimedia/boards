'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, Comment } from '@/lib/types';
import ReactMarkdown from 'react-markdown';

interface ClientCardModalProps {
  cardId: string;
  onClose: () => void;
  onRefresh: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  in_progress: 'In Progress',
  ready_for_review: 'Ready for Review',
  approved: 'Approved',
  delivered: 'Delivered',
  revision_requested: 'Revision Requested',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500/20 text-red-400',
  high: 'bg-orange-500/20 text-orange-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  low: 'bg-blue-500/20 text-blue-400',
  none: 'bg-white/5 text-muted',
};

const APPROVAL_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  approved: 'bg-green-500/20 text-green-400',
  rejected: 'bg-red-500/20 text-red-400',
  revision_requested: 'bg-orange-500/20 text-orange-400',
};

export default function ClientCardModal({ cardId, onClose, onRefresh }: ClientCardModalProps) {
  const [card, setCard] = useState<Card | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const { profile } = useAuth();

  const fetchCard = useCallback(async () => {
    const res = await fetch(`/api/cards/${cardId}`);
    if (res.ok) {
      const json = await res.json();
      setCard(json.data);
    }
  }, [cardId]);

  const fetchComments = useCallback(async () => {
    const res = await fetch(`/api/cards/${cardId}/comments`);
    if (res.ok) {
      const json = await res.json();
      setComments(json.data || []);
    }
  }, [cardId]);

  const fetchAttachments = useCallback(async () => {
    const res = await fetch(`/api/cards/${cardId}/attachments`);
    if (res.ok) {
      const json = await res.json();
      setAttachments(json.data || []);
    }
  }, [cardId]);

  useEffect(() => {
    Promise.all([fetchCard(), fetchComments(), fetchAttachments()]).then(() =>
      setLoading(false)
    );
  }, [fetchCard, fetchComments, fetchAttachments]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;

    setSubmitting(true);
    const res = await fetch(`/api/cards/${cardId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newComment.trim() }),
    });

    if (res.ok) {
      const json = await res.json();
      setComments((prev) => [json.data, ...prev]);
      setNewComment('');
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-electric" />
      </div>
    );
  }

  if (!card) {
    onClose();
    return null;
  }

  // Sort comments: newest first, separate top-level from replies
  const topLevelComments = comments
    .filter((c) => !c.parent_comment_id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4 pt-12">
      <div
        className="bg-surface rounded-xl max-w-2xl w-full shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-surface-border">
          <div className="flex-1 pr-4">
            <h2 className="text-lg font-heading font-semibold text-white">{card.title}</h2>
            <div className="flex flex-wrap gap-2 mt-2">
              {card.priority && card.priority !== 'none' && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[card.priority]}`}>
                  {card.priority}
                </span>
              )}
              {card.client_status && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-electric/20 text-electric">
                  {STATUS_LABELS[card.client_status] || card.client_status}
                </span>
              )}
              {card.approval_status && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${APPROVAL_COLORS[card.approval_status]}`}>
                  {card.approval_status.replace('_', ' ')}
                </span>
              )}
              {card.due_date && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-muted">
                  Due: {new Date(card.due_date).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-white transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Description */}
        {card.description && (
          <div className="px-6 py-4 border-b border-surface-border">
            <h3 className="text-sm font-medium text-muted mb-2">Description</h3>
            <div className="prose prose-invert prose-sm max-w-none text-white/80">
              <ReactMarkdown>{card.description}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="px-6 py-4 border-b border-surface-border">
            <h3 className="text-sm font-medium text-muted mb-2">
              Attachments ({attachments.length})
            </h3>
            <div className="space-y-2">
              {attachments.map((att: any) => (
                <a
                  key={att.id}
                  href={att.url || att.storage_path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm"
                >
                  <svg className="w-4 h-4 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <span className="text-white/80 truncate">{att.file_name}</span>
                  <span className="text-muted text-xs ml-auto shrink-0">
                    {(att.file_size / 1024).toFixed(0)} KB
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Comments */}
        <div className="px-6 py-4">
          <h3 className="text-sm font-medium text-muted mb-3">
            Comments ({topLevelComments.length})
          </h3>

          {/* New comment form */}
          <form onSubmit={handleSubmitComment} className="mb-4">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-muted resize-none focus:outline-none focus:border-electric transition-colors"
              rows={3}
            />
            <div className="flex justify-end mt-2">
              <button
                type="submit"
                disabled={!newComment.trim() || submitting}
                className="px-4 py-1.5 bg-electric hover:bg-electric-bright disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {submitting ? 'Posting...' : 'Comment'}
              </button>
            </div>
          </form>

          {/* Comment list */}
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {topLevelComments.map((comment) => (
              <div key={comment.id} className="bg-white/5 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-white">
                    {comment.profile?.display_name || 'Unknown'}
                  </span>
                  <span className="text-xs text-muted">
                    {new Date(comment.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm text-white/80 whitespace-pre-wrap">
                  {comment.content}
                </div>
              </div>
            ))}
            {topLevelComments.length === 0 && (
              <p className="text-sm text-muted text-center py-4">No comments yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
