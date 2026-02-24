'use client';

import { useState, useEffect, useCallback } from 'react';
import { Attachment, AIChangeRequest } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';

interface AIReviewSubmitProps {
  cardId: string;
  onReviewComplete: () => void;
  onCancel: () => void;
}

interface Toast {
  type: 'success' | 'error';
  message: string;
}

export default function AIReviewSubmit({ cardId, onReviewComplete, onCancel }: AIReviewSubmitProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string>('');
  const [previousAttachmentId, setPreviousAttachmentId] = useState<string>('');
  const [changeRequests, setChangeRequests] = useState<AIChangeRequest[]>([]);
  const [briefSummary, setBriefSummary] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingAttachments, setLoadingAttachments] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);

  const supabase = createClient();

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchAttachments = useCallback(async () => {
    setLoadingAttachments(true);
    try {
      const { data } = await supabase
        .from('attachments')
        .select('*')
        .eq('card_id', cardId)
        .order('created_at', { ascending: false });

      const all = data || [];
      setAttachments(all);
    } catch {
      showToast('error', 'Failed to load attachments.');
    } finally {
      setLoadingAttachments(false);
    }
  }, [cardId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const imageAttachments = attachments.filter(
    (a) => a.mime_type.startsWith('image/')
  );

  const handleExtractRequests = async () => {
    if (!selectedAttachmentId) {
      showToast('error', 'Please select an image to review.');
      return;
    }

    setExtracting(true);
    try {
      const body: Record<string, string> = {
        attachment_id: selectedAttachmentId,
      };
      if (previousAttachmentId) {
        body.previous_attachment_id = previousAttachmentId;
      }

      const res = await fetch(`/api/cards/${cardId}/review/extract-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to extract change requests');
      }

      const json = await res.json();
      const extracted: AIChangeRequest[] = json.data?.change_requests || [];
      setChangeRequests(extracted);
      setBriefSummary(json.data?.summary || '');
      setStep(3);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to extract change requests.');
    } finally {
      setExtracting(false);
    }
  };

  const handleAddRequest = () => {
    const nextIndex = changeRequests.length > 0
      ? Math.max(...changeRequests.map((cr) => cr.index)) + 1
      : 0;
    setChangeRequests([...changeRequests, { index: nextIndex, text: '' }]);
  };

  const handleUpdateRequest = (index: number, text: string) => {
    setChangeRequests(
      changeRequests.map((cr) => (cr.index === index ? { ...cr, text } : cr))
    );
  };

  const handleRemoveRequest = (index: number) => {
    setChangeRequests(changeRequests.filter((cr) => cr.index !== index));
  };

  const handleSubmitReview = async () => {
    const validRequests = changeRequests.filter((cr) => cr.text.trim());
    if (validRequests.length === 0) {
      showToast('error', 'Add at least one change request to review against.');
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        attachment_id: selectedAttachmentId,
        change_requests: validRequests,
      };
      if (previousAttachmentId) {
        body.previous_attachment_id = previousAttachmentId;
      }
      if (briefSummary.trim()) {
        body.brief_summary = briefSummary.trim();
      }

      const res = await fetch(`/api/cards/${cardId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Review failed');
      }

      showToast('success', 'AI review completed successfully.');
      onReviewComplete();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'AI review failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedAttachment = imageAttachments.find((a) => a.id === selectedAttachmentId);
  const otherImageAttachments = imageAttachments.filter((a) => a.id !== selectedAttachmentId);

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div
          className={`
            fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg font-body text-sm
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
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Submit AI Review</h3>
        <button
          onClick={onCancel}
          className="p-1.5 rounded-lg text-navy/40 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-300 hover:bg-cream-dark dark:hover:bg-slate-800 transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`
                w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all
                ${step >= s
                  ? 'bg-electric text-white'
                  : 'bg-cream-dark dark:bg-slate-700 text-navy/30 dark:text-slate-500'
                }
              `}
            >
              {step > s ? (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                s
              )}
            </div>
            {s < 3 && (
              <div className={`w-8 h-0.5 ${step > s ? 'bg-electric' : 'bg-cream-dark'}`} />
            )}
          </div>
        ))}
        <span className="ml-2 text-xs text-navy/40 font-body">
          {step === 1 && 'Select image'}
          {step === 2 && 'Compare version'}
          {step === 3 && 'Review requests'}
        </span>
      </div>

      {/* Step 1: Select image attachment */}
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-navy/60 dark:text-slate-400 font-body">
            Select the design image you want the AI to review.
          </p>

          {loadingAttachments ? (
            <div className="flex items-center justify-center py-8">
              <svg className="animate-spin h-5 w-5 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : imageAttachments.length === 0 ? (
            <div className="p-6 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-center">
              <svg className="w-10 h-10 text-navy/20 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm text-navy/40 dark:text-slate-500 font-body">
                No image attachments found. Upload an image in the Attachments tab first.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {imageAttachments.map((att) => (
                <button
                  key={att.id}
                  onClick={() => setSelectedAttachmentId(att.id)}
                  className={`
                    w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left
                    ${selectedAttachmentId === att.id
                      ? 'border-electric bg-electric/5 ring-2 ring-electric/20'
                      : 'border-cream-dark dark:border-slate-700 bg-cream dark:bg-dark-bg hover:border-navy/10 dark:hover:border-slate-600'
                    }
                  `}
                >
                  <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-navy dark:text-slate-100 truncate font-body">{att.file_name}</p>
                    <p className="text-[11px] text-navy/30 dark:text-slate-500 font-body">
                      v{att.version} &middot; {new Date(att.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  {selectedAttachmentId === att.id && (
                    <svg className="w-5 h-5 text-electric shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!selectedAttachmentId}
              onClick={() => setStep(2)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Select previous version for comparison (optional) */}
      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm text-navy/60 dark:text-slate-400 font-body">
            Optionally select a previous version to compare against. This helps the AI detect what changed.
          </p>

          {selectedAttachment && (
            <div className="p-3 rounded-xl bg-electric/5 border border-electric/20">
              <p className="text-xs text-navy/40 dark:text-slate-500 font-body mb-1">Reviewing:</p>
              <p className="text-sm font-medium text-navy dark:text-slate-100 font-body">{selectedAttachment.file_name}</p>
            </div>
          )}

          <div className="space-y-2">
            <button
              onClick={() => setPreviousAttachmentId('')}
              className={`
                w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left
                ${previousAttachmentId === ''
                  ? 'border-electric bg-electric/5 ring-2 ring-electric/20'
                  : 'border-cream-dark dark:border-slate-700 bg-cream dark:bg-dark-bg hover:border-navy/10 dark:hover:border-slate-600'
                }
              `}
            >
              <div className="w-8 h-8 rounded-lg bg-cream-dark flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-navy/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-navy dark:text-slate-100 font-body">No comparison</p>
                <p className="text-[11px] text-navy/30 dark:text-slate-500 font-body">Review the design on its own</p>
              </div>
              {previousAttachmentId === '' && (
                <svg className="w-5 h-5 text-electric shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            {otherImageAttachments.map((att) => (
              <button
                key={att.id}
                onClick={() => setPreviousAttachmentId(att.id)}
                className={`
                  w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left
                  ${previousAttachmentId === att.id
                    ? 'border-electric bg-electric/5 ring-2 ring-electric/20'
                    : 'border-cream-dark dark:border-slate-700 bg-cream dark:bg-dark-bg hover:border-navy/10 dark:hover:border-slate-600'
                  }
                `}
              >
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy dark:text-slate-100 truncate font-body">{att.file_name}</p>
                  <p className="text-[11px] text-navy/30 dark:text-slate-500 font-body">
                    v{att.version} &middot; {new Date(att.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                {previousAttachmentId === att.id && (
                  <svg className="w-5 h-5 text-electric shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button size="sm" onClick={handleExtractRequests} loading={extracting}>
              {extracting ? 'Extracting...' : 'Extract Requests'}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Review change requests and submit */}
      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-navy/60 dark:text-slate-400 font-body">
            Review the extracted change requests below. You can edit, add, or remove items before running the AI review.
          </p>

          {/* Brief summary */}
          <div>
            <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
              Brief Summary (optional)
            </label>
            <textarea
              value={briefSummary}
              onChange={(e) => setBriefSummary(e.target.value)}
              placeholder="Provide context for the AI reviewer..."
              rows={2}
              className="
                w-full p-3 rounded-xl bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100
                placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30
                focus:border-electric resize-none font-body
              "
            />
          </div>

          {/* Change requests list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">
                Change Requests ({changeRequests.length})
              </label>
              <button
                onClick={handleAddRequest}
                className="inline-flex items-center gap-1 text-xs font-medium text-electric hover:text-electric-bright transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add request
              </button>
            </div>

            {changeRequests.length === 0 ? (
              <div className="p-4 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-center">
                <p className="text-sm text-navy/40 dark:text-slate-500 font-body">
                  No change requests yet. Add items the AI should check against.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {changeRequests.map((cr) => (
                  <div
                    key={cr.index}
                    className="flex items-start gap-2 p-3 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 group"
                  >
                    <span className="mt-1.5 w-5 h-5 rounded-full bg-electric/10 text-electric text-[10px] font-bold flex items-center justify-center shrink-0">
                      {cr.index + 1}
                    </span>
                    <textarea
                      value={cr.text}
                      onChange={(e) => handleUpdateRequest(cr.index, e.target.value)}
                      placeholder="Describe the change request..."
                      rows={1}
                      className="
                        flex-1 bg-transparent text-sm text-navy dark:text-slate-100 resize-none font-body
                        placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none min-h-[24px]
                      "
                    />
                    <button
                      onClick={() => handleRemoveRequest(cr.index)}
                      className="mt-0.5 p-1 rounded text-navy/20 hover:text-danger hover:bg-danger/10 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex justify-between pt-2 border-t border-cream-dark dark:border-slate-700">
            <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
              Back
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSubmitReview}
                loading={submitting}
                disabled={changeRequests.filter((cr) => cr.text.trim()).length === 0}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Reviewing...
                  </span>
                ) : (
                  'Run AI Review'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
