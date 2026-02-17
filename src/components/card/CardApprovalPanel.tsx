'use client';

import { useState, useEffect, useCallback } from 'react';
import { ApprovalStatus, Card } from '@/lib/types';
import Avatar from '@/components/ui/Avatar';

interface ApprovalHistoryEntry {
  id: string;
  card_id: string;
  from_status: ApprovalStatus | null;
  to_status: ApprovalStatus;
  changed_by: string;
  comment: string | null;
  created_at: string;
  changed_by_profile?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    email: string;
  };
}

interface CardApprovalPanelProps {
  cardId: string;
  currentStatus: ApprovalStatus | null;
  onStatusChange: () => void;
}

const STATUS_CONFIG: Record<ApprovalStatus, { label: string; color: string; bg: string; icon: string }> = {
  pending: {
    label: 'Pending Review',
    color: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    icon: '⏳',
  },
  approved: {
    label: 'Approved',
    color: 'text-green-700 dark:text-green-300',
    bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    icon: '✓',
  },
  rejected: {
    label: 'Rejected',
    color: 'text-red-700 dark:text-red-300',
    bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    icon: '✕',
  },
  revision_requested: {
    label: 'Revision Requested',
    color: 'text-orange-700 dark:text-orange-300',
    bg: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
    icon: '↻',
  },
};

const ACTION_BUTTONS: { status: ApprovalStatus; label: string; style: string }[] = [
  {
    status: 'pending',
    label: 'Request Review',
    style: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  {
    status: 'approved',
    label: 'Approve',
    style: 'bg-green-500 hover:bg-green-600 text-white',
  },
  {
    status: 'revision_requested',
    label: 'Request Revision',
    style: 'bg-orange-500 hover:bg-orange-600 text-white',
  },
  {
    status: 'rejected',
    label: 'Reject',
    style: 'bg-red-500 hover:bg-red-600 text-white',
  },
];

export default function CardApprovalPanel({ cardId, currentStatus, onStatusChange }: CardApprovalPanelProps) {
  const [history, setHistory] = useState<ApprovalHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<ApprovalStatus | null>(null);
  const [comment, setComment] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/cards/${cardId}/approval`);
      if (res.ok) {
        const json = await res.json();
        setHistory(json.data ?? []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleAction = async (status: ApprovalStatus) => {
    setSubmitting(status);
    try {
      const res = await fetch(`/api/cards/${cardId}/approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, comment: comment.trim() || undefined }),
      });

      if (res.ok) {
        setComment('');
        await fetchHistory();
        onStatusChange();
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to update approval status');
      }
    } catch (err) {
      console.error('Approval action failed:', err);
    } finally {
      setSubmitting(null);
    }
  };

  const statusConfig = currentStatus ? STATUS_CONFIG[currentStatus] : null;

  return (
    <div className="space-y-4">
      {/* Current Status */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 font-heading uppercase tracking-wider">
          Approval Status
        </h3>

        {statusConfig ? (
          <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border ${statusConfig.bg}`}>
            <span className="text-lg">{statusConfig.icon}</span>
            <span className={`text-sm font-semibold ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
            <span className="text-lg opacity-40">—</span>
            <span className="text-sm text-navy/40 dark:text-slate-500">
              No approval status set
            </span>
          </div>
        )}
      </div>

      {/* Comment Field */}
      <div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment (optional)..."
          rows={2}
          className="w-full p-2.5 rounded-xl bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric resize-none font-body"
        />
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2">
        {ACTION_BUTTONS.filter((btn) => btn.status !== currentStatus).map((btn) => (
          <button
            key={btn.status}
            onClick={() => handleAction(btn.status)}
            disabled={submitting !== null}
            className={`
              px-3 py-2 rounded-lg text-xs font-semibold transition-all
              disabled:opacity-50 disabled:cursor-not-allowed
              ${btn.style}
            `}
          >
            {submitting === btn.status ? (
              <span className="inline-flex items-center gap-1.5">
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Updating...
              </span>
            ) : (
              btn.label
            )}
          </button>
        ))}
      </div>

      {/* History Toggle */}
      {history.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 text-xs font-medium text-navy/40 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-300 transition-colors"
          >
            <svg
              className={`w-3 h-3 transition-transform ${showHistory ? 'rotate-90' : ''}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
            Approval History ({history.length})
          </button>

          {showHistory && (
            <div className="mt-3 space-y-2">
              {history.map((entry) => (
                <ApprovalHistoryItem key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-4">
          <div className="w-5 h-5 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

function ApprovalHistoryItem({ entry }: { entry: ApprovalHistoryEntry }) {
  const toConfig = STATUS_CONFIG[entry.to_status];
  const profile = entry.changed_by_profile;
  const date = new Date(entry.created_at);
  const timeAgo = getTimeAgo(date);

  return (
    <div className="flex gap-2.5 p-2.5 rounded-lg bg-cream/50 dark:bg-navy/50 border border-cream-dark/50 dark:border-slate-700/50">
      <div className="shrink-0 mt-0.5">
        {profile ? (
          <Avatar
            src={profile.avatar_url}
            name={profile.full_name || profile.email}
            size="sm"
          />
        ) : (
          <div className="w-5 h-5 rounded-full bg-navy/10 dark:bg-slate-700" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-navy dark:text-slate-200">
            {profile?.full_name || profile?.email || 'Unknown'}
          </span>
          <span className="text-[10px] text-navy/30 dark:text-slate-500">→</span>
          <span className={`text-xs font-semibold ${toConfig.color}`}>
            {toConfig.icon} {toConfig.label}
          </span>
          <span className="text-[10px] text-navy/30 dark:text-slate-500 ml-auto shrink-0" title={date.toLocaleString()}>
            {timeAgo}
          </span>
        </div>
        {entry.comment && (
          <p className="text-xs text-navy/60 dark:text-slate-400 mt-1 font-body">
            &ldquo;{entry.comment}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}
