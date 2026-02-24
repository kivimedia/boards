'use client';

import { useState, useEffect } from 'react';
import { DidntBookReason, DidntBookSubReason } from '@/lib/types';

interface DidntBookPanelProps {
  cardId: string;
  reason: string | null;
  subReason: string | null;
  onUpdate: (updates: Record<string, unknown>) => void;
}

const REASONS: { value: DidntBookReason; label: string }[] = [
  { value: 'too_expensive', label: 'Too Expensive' },
  { value: 'went_with_competitor', label: 'Went With Competitor' },
  { value: 'event_cancelled', label: 'Event Cancelled' },
  { value: 'no_response', label: 'No Response' },
  { value: 'timing_issue', label: 'Timing Issue' },
  { value: 'out_of_service_area', label: 'Out of Service Area' },
  { value: 'other', label: 'Other' },
];

const SUB_REASONS: Record<DidntBookReason, { value: DidntBookSubReason; label: string }[]> = {
  too_expensive: [
    { value: 'budget_under_200', label: 'Budget Under $200' },
    { value: 'budget_200_500', label: '$200-$500 Range' },
    { value: 'wanted_discount', label: 'Wanted Discount' },
  ],
  went_with_competitor: [
    { value: 'found_cheaper', label: 'Found Cheaper Option' },
    { value: 'preferred_style', label: 'Preferred Their Style' },
  ],
  event_cancelled: [],
  no_response: [
    { value: 'ghosted_after_quote', label: 'Ghosted After Quote' },
    { value: 'ghosted_before_quote', label: 'Ghosted Before Quote' },
  ],
  timing_issue: [
    { value: 'too_last_minute', label: 'Too Last Minute' },
    { value: 'date_unavailable', label: 'Date Unavailable' },
  ],
  out_of_service_area: [],
  other: [],
};

export default function DidntBookPanel({ reason, subReason, onUpdate }: DidntBookPanelProps) {
  const [localReason, setLocalReason] = useState(reason ?? '');
  const [localSubReason, setLocalSubReason] = useState(subReason ?? '');

  useEffect(() => {
    setLocalReason(reason ?? '');
    setLocalSubReason(subReason ?? '');
  }, [reason, subReason]);

  const subOptions = localReason ? SUB_REASONS[localReason as DidntBookReason] ?? [] : [];

  const selectClass =
    'w-full px-2.5 py-1.5 rounded-lg bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-300/40 focus:border-red-400 transition-colors font-body appearance-none';
  const labelClass = 'text-[11px] font-medium text-navy/50 dark:text-slate-400 uppercase tracking-wide';

  return (
    <div className="space-y-3 p-3 rounded-xl bg-red-50/50 dark:bg-red-900/10 border border-red-200/50 dark:border-red-800/30">
      <h3 className="text-sm font-semibold text-red-500 dark:text-red-400 font-heading flex items-center gap-1.5">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        Didn&apos;t Book
      </h3>

      <div className="space-y-3">
        <div>
          <label className={labelClass}>Reason</label>
          <select
            value={localReason}
            onChange={(e) => {
              const val = e.target.value;
              setLocalReason(val);
              setLocalSubReason('');
              onUpdate({ didnt_book_reason: val || null, didnt_book_sub_reason: null });
            }}
            className={selectClass}
          >
            <option value="">Select reason...</option>
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {subOptions.length > 0 && (
          <div>
            <label className={labelClass}>Details</label>
            <select
              value={localSubReason}
              onChange={(e) => {
                setLocalSubReason(e.target.value);
                onUpdate({ didnt_book_sub_reason: e.target.value || null });
              }}
              className={selectClass}
            >
              <option value="">Select details...</option>
              {subOptions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
