'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';

interface ClientSatisfactionProps {
  clientId: string;
  cardId?: string;
}

interface Toast {
  type: 'success' | 'error';
  message: string;
}

export default function ClientSatisfaction({ clientId, cardId }: ClientSatisfactionProps) {
  const [rating, setRating] = useState<number>(0);
  const [hoveredStar, setHoveredStar] = useState<number>(0);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      showToast('error', 'Please select a rating.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/satisfaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          feedback: feedback.trim() || null,
          card_id: cardId || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to submit rating');
      }

      setSubmitted(true);
      showToast('success', 'Thank you for your feedback!');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to submit rating.');
    } finally {
      setSubmitting(false);
    }
  };

  const ratingLabels: Record<number, string> = {
    1: 'Poor',
    2: 'Fair',
    3: 'Good',
    4: 'Very Good',
    5: 'Excellent',
  };

  if (submitted) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-2xl border border-cream-dark dark:border-slate-700 shadow-card p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-navy dark:text-slate-100 font-heading mb-1">Thank You!</h3>
        <p className="text-sm text-navy/50 dark:text-slate-400 font-body">
          Your feedback helps us improve our service.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-cream-dark dark:border-slate-700 shadow-card p-6">
      {/* Toast */}
      {toast && (
        <div
          className={`
            fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg font-body text-sm
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
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-5 h-5 text-electric" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-base font-semibold text-navy dark:text-slate-100 font-heading">How did we do?</h3>
      </div>

      <p className="text-sm text-navy/50 dark:text-slate-400 font-body mb-4">
        Rate your experience and share any feedback.
      </p>

      {/* Star Rating */}
      <div className="flex items-center gap-1 mb-2">
        {[1, 2, 3, 4, 5].map((star) => {
          const isActive = star <= (hoveredStar || rating);
          return (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoveredStar(star)}
              onMouseLeave={() => setHoveredStar(0)}
              className="p-1 transition-transform duration-150 hover:scale-110 focus:outline-none"
              aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
            >
              <svg
                className={`w-8 h-8 transition-colors duration-150 ${
                  isActive ? 'text-yellow-400' : 'text-cream-dark dark:text-slate-700'
                }`}
                fill={isActive ? 'currentColor' : 'none'}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                />
              </svg>
            </button>
          );
        })}
      </div>

      {/* Rating Label */}
      {(hoveredStar || rating) > 0 && (
        <p className="text-sm font-medium text-navy/60 dark:text-slate-400 font-body mb-4">
          {ratingLabels[hoveredStar || rating]}
        </p>
      )}

      {/* Feedback Textarea */}
      <div className="mt-4">
        <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
          Feedback (Optional)
        </label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Tell us more about your experience..."
          rows={3}
          className="
            w-full px-3 py-2.5 rounded-xl bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100
            placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30
            focus:border-electric font-body resize-none
          "
        />
      </div>

      {/* Submit */}
      <div className="mt-4">
        <Button
          size="md"
          onClick={handleSubmit}
          disabled={rating === 0}
          loading={submitting}
          className="w-full"
        >
          {submitting ? 'Submitting...' : 'Submit Feedback'}
        </Button>
      </div>
    </div>
  );
}
