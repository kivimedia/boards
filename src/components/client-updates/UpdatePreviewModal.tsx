'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import type { ClientWeeklyUpdate } from '@/lib/types';

interface Props {
  update: ClientWeeklyUpdate;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300',
  pending_approval: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  scheduled: 'bg-electric/10 text-electric',
  sent: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400',
};

export default function UpdatePreviewModal({ update, isOpen, onClose, onRefresh }: Props) {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(update.ai_summary || '');
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState('');

  async function handleAction(action: 'approve' | 'send' | 'cancel') {
    setActionLoading(action);
    try {
      const res = await fetch(`/api/client-updates/${update.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _action: action }),
      });
      if (res.ok) {
        onRefresh();
        if (action === 'cancel') onClose();
      }
    } catch {} finally {
      setActionLoading('');
    }
  }

  async function handleSaveEdit() {
    setSaving(true);
    try {
      await fetch(`/api/client-updates/${update.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_summary: summary }),
      });
      setEditing(false);
      onRefresh();
    } catch {} finally {
      setSaving(false);
    }
  }

  const canApprove = ['draft', 'pending_approval'].includes(update.status);
  const canSend = ['draft', 'pending_approval', 'approved', 'scheduled'].includes(update.status);
  const canCancel = ['scheduled', 'approved', 'pending_approval'].includes(update.status);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-navy dark:text-slate-100 font-heading">
              Weekly Update Preview
            </h2>
            <p className="text-xs text-navy/50 dark:text-slate-400 font-body mt-0.5">
              {new Date(update.period_start).toLocaleDateString()} — {new Date(update.period_end).toLocaleDateString()}
              {update.meeting_time && ` | Meeting: ${new Date(update.meeting_time).toLocaleString()}`}
            </p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[update.status] || ''}`}>
            {update.status.replace('_', ' ')}
          </span>
        </div>

        {/* TL;DR */}
        <div className="bg-cream-dark/30 dark:bg-slate-800/50 rounded-xl p-4 mb-4">
          <h3 className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase tracking-wide mb-2 font-heading">
            TL;DR
          </h3>
          {editing ? (
            <textarea
              value={summary}
              onChange={e => setSummary(e.target.value)}
              className="w-full p-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 font-body resize-none"
              rows={3}
            />
          ) : (
            <p className="text-sm text-navy dark:text-slate-200 font-body">
              {update.ai_summary || 'No summary generated'}
            </p>
          )}
        </div>

        {/* Detailed content */}
        <div className="border border-cream-dark dark:border-slate-700 rounded-xl p-4 mb-4 max-h-[400px] overflow-y-auto">
          {update.ai_detailed_html ? (
            <div
              className="prose prose-sm dark:prose-invert max-w-none font-body"
              dangerouslySetInnerHTML={{ __html: update.ai_detailed_html }}
            />
          ) : (
            <p className="text-sm text-navy/40 dark:text-slate-500 font-body">No detailed content</p>
          )}
        </div>

        {/* Recipients */}
        {update.sent_to_emails && update.sent_to_emails.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-navy/60 dark:text-slate-400 mb-1 font-body">
              Sent to:
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {update.sent_to_emails.map(email => (
                <span key={email} className="px-2 py-0.5 rounded-full bg-cream-dark/50 dark:bg-slate-700 text-xs text-navy/70 dark:text-slate-300 font-body">
                  {email}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-cream-dark dark:border-slate-700">
          {editing ? (
            <>
              <Button size="sm" onClick={handleSaveEdit} loading={saving}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setSummary(update.ai_summary || ''); }}>Cancel</Button>
            </>
          ) : (
            <>
              {canApprove && (
                <Button size="sm" onClick={() => handleAction('approve')} loading={actionLoading === 'approve'}>
                  Approve & Schedule
                </Button>
              )}
              {canSend && (
                <Button size="sm" variant="ghost" onClick={() => handleAction('send')} loading={actionLoading === 'send'}>
                  Send Now
                </Button>
              )}
              {update.status !== 'sent' && update.status !== 'cancelled' && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
              )}
              {canCancel && (
                <Button size="sm" variant="ghost" onClick={() => handleAction('cancel')} loading={actionLoading === 'cancel'}>
                  Cancel
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
