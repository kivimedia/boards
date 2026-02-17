'use client';

import { useState } from 'react';
import { AIReviewResult, AIReviewVerdict } from '@/lib/types';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

interface AIReviewOverrideProps {
  review: AIReviewResult;
  cardId: string;
  onClose: () => void;
  onOverrideComplete: () => void;
}

type OverrideVerdict = 'overridden_approved' | 'overridden_rejected';

const ORIGINAL_VERDICT_LABELS: Record<AIReviewVerdict, string> = {
  pending: 'Pending',
  approved: 'Approved',
  revisions_needed: 'Revisions Needed',
  overridden_approved: 'Overridden (Approved)',
  overridden_rejected: 'Overridden (Rejected)',
};

interface Toast {
  type: 'success' | 'error';
  message: string;
}

export default function AIReviewOverride({ review, cardId, onClose, onOverrideComplete }: AIReviewOverrideProps) {
  const [overrideVerdict, setOverrideVerdict] = useState<OverrideVerdict>('overridden_approved');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSubmit = async () => {
    if (!reason.trim()) {
      showToast('error', 'A reason is required to override the AI verdict.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/cards/${cardId}/review/${review.id}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          override_verdict: overrideVerdict,
          override_reason: reason.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to override review');
      }

      showToast('success', 'Override applied successfully.');
      onOverrideComplete();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to apply override.');
    } finally {
      setSubmitting(false);
    }
  };

  const passCount = review.verdicts.filter((v) => v.verdict === 'PASS').length;
  const failCount = review.verdicts.filter((v) => v.verdict === 'FAIL').length;

  return (
    <Modal isOpen={true} onClose={onClose} size="md">
      <div className="p-6">
        {/* Toast */}
        {toast && (
          <div
            className={`
              fixed top-4 right-4 z-[60] px-4 py-3 rounded-xl shadow-lg font-body text-sm
              animate-in fade-in slide-in-from-top-2 duration-200
              ${toast.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
              }
            `}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'success' ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              )}
              <span>{toast.message}</span>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-navy dark:text-slate-100 font-heading">Override AI Review</h2>
            <p className="text-sm text-navy/50 dark:text-slate-400 font-body">Manually override the automated verdict</p>
          </div>
        </div>

        {/* Original verdict context */}
        <div className="p-3 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 mb-4">
          <p className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-2 font-heading">
            Original AI Verdict
          </p>
          <div className="flex items-center gap-3">
            <span
              className={`
                inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border
                ${review.overall_verdict === 'approved'
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : review.overall_verdict === 'revisions_needed'
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-yellow-50 border-yellow-200 text-yellow-800'
                }
              `}
            >
              {ORIGINAL_VERDICT_LABELS[review.overall_verdict]}
            </span>
            <span className="text-xs text-navy/40 dark:text-slate-500 font-body">
              {passCount} passed, {failCount} failed
            </span>
          </div>
          {review.summary && (
            <p className="text-sm text-navy/60 dark:text-slate-400 font-body mt-2">{review.summary}</p>
          )}
        </div>

        {/* Override verdict selection */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider mb-2 font-heading">
            Override Decision
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setOverrideVerdict('overridden_approved')}
              className={`
                p-3 rounded-xl border-2 text-center transition-all
                ${overrideVerdict === 'overridden_approved'
                  ? 'border-green-400 bg-green-50'
                  : 'border-cream-dark hover:border-green-200 bg-cream'
                }
              `}
            >
              <svg
                className={`w-6 h-6 mx-auto mb-1 ${overrideVerdict === 'overridden_approved' ? 'text-green-600' : 'text-navy/30'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className={`text-sm font-semibold ${overrideVerdict === 'overridden_approved' ? 'text-green-700' : 'text-navy/50'}`}>
                Approve Override
              </span>
              <p className="text-[11px] text-navy/30 dark:text-slate-500 font-body mt-0.5">
                Force approve the design
              </p>
            </button>

            <button
              onClick={() => setOverrideVerdict('overridden_rejected')}
              className={`
                p-3 rounded-xl border-2 text-center transition-all
                ${overrideVerdict === 'overridden_rejected'
                  ? 'border-red-400 bg-red-50'
                  : 'border-cream-dark hover:border-red-200 bg-cream'
                }
              `}
            >
              <svg
                className={`w-6 h-6 mx-auto mb-1 ${overrideVerdict === 'overridden_rejected' ? 'text-red-600' : 'text-navy/30'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className={`text-sm font-semibold ${overrideVerdict === 'overridden_rejected' ? 'text-red-700' : 'text-navy/50'}`}>
                Reject Override
              </span>
              <p className="text-[11px] text-navy/30 dark:text-slate-500 font-body mt-0.5">
                Force reject the design
              </p>
            </button>
          </div>
        </div>

        {/* Reason textarea */}
        <div className="mb-5">
          <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider mb-1.5 font-heading">
            Reason <span className="text-danger">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why you are overriding the AI verdict..."
            rows={3}
            className="
              w-full p-3 rounded-xl bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100
              placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30
              focus:border-electric resize-none font-body
            "
          />
          <p className="text-[11px] text-navy/30 dark:text-slate-500 font-body mt-1">
            This reason will be logged for audit purposes.
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="md"
            onClick={handleSubmit}
            loading={submitting}
            disabled={!reason.trim()}
            className={
              overrideVerdict === 'overridden_approved'
                ? '!bg-green-600 hover:!bg-green-700'
                : '!bg-red-600 hover:!bg-red-700'
            }
          >
            {submitting ? 'Applying...' : 'Confirm Override'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
