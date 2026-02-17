'use client';

import { useState } from 'react';
import type { SurveyType } from '@/lib/types';

interface SurveyWidgetProps {
  clientId: string;
  cardId?: string;
  surveyType: SurveyType;
  onSubmitted?: () => void;
}

export default function SurveyWidget({ clientId, cardId, surveyType, onSubmitted }: SurveyWidgetProps) {
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          card_id: cardId,
          rating,
          feedback: feedback.trim() || undefined,
          survey_type: surveyType,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
        onSubmitted?.();
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-5 text-center">
        <div className="text-2xl mb-2">
          {rating >= 4 ? (
            <span className="text-green-500">Thank you!</span>
          ) : (
            <span className="text-navy/60 dark:text-slate-400">Thank you!</span>
          )}
        </div>
        <p className="text-sm text-navy/60 dark:text-slate-400 font-body">
          Your feedback has been recorded. We appreciate your input.
        </p>
      </div>
    );
  }

  const surveyTitle = () => {
    switch (surveyType) {
      case 'delivery': return 'How was this delivery?';
      case 'milestone': return 'Rate this milestone';
      case 'periodic': return 'How are we doing?';
      default: return 'Your feedback';
    }
  };

  return (
    <div className="rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5">
      <h4 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading mb-3">{surveyTitle()}</h4>

      {/* Star rating */}
      <div className="flex items-center gap-1 mb-4">
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = star <= (hoveredStar || rating);
          return (
            <button
              key={star}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoveredStar(star)}
              onMouseLeave={() => setHoveredStar(0)}
              className="p-0.5 transition-transform hover:scale-110"
              aria-label={`${star} star${star === 1 ? '' : 's'}`}
            >
              <svg
                className={`w-8 h-8 transition-colors ${
                  isFilled ? 'text-yellow-400' : 'text-cream-dark dark:text-slate-700'
                }`}
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </button>
          );
        })}
        {rating > 0 && (
          <span className="ml-2 text-sm text-navy/50 dark:text-slate-400 font-body">
            {rating === 1 && 'Poor'}
            {rating === 2 && 'Fair'}
            {rating === 3 && 'Good'}
            {rating === 4 && 'Great'}
            {rating === 5 && 'Excellent'}
          </span>
        )}
      </div>

      {/* Feedback textarea */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
          Additional feedback (optional)
        </label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 resize-none"
          placeholder="Tell us more about your experience..."
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting || rating === 0}
        className="w-full px-4 py-2.5 rounded-lg text-sm font-medium font-body bg-electric text-white hover:bg-electric/90 disabled:opacity-50 transition-colors"
      >
        {submitting ? 'Submitting...' : 'Submit Feedback'}
      </button>
    </div>
  );
}
