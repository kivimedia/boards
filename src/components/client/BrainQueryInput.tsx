'use client';

import { useState, useCallback, KeyboardEvent } from 'react';

interface BrainQueryInputProps {
  onQuery: (query: string) => void;
  isLoading: boolean;
}

export default function BrainQueryInput({ onQuery, isLoading }: BrainQueryInputProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed || isLoading) return;
    onQuery(trimmed);
    setQuery('');
  }, [query, isLoading, onQuery]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1 relative">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this client..."
          rows={2}
          disabled={isLoading}
          className="
            w-full px-3 py-2.5 rounded-xl bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100
            placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30
            focus:border-electric font-body resize-none
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        />
      </div>
      <button
        onClick={handleSubmit}
        disabled={!query.trim() || isLoading}
        className="
          shrink-0 w-10 h-10 rounded-xl bg-electric text-white
          hover:bg-electric-bright active:scale-[0.98]
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-200 ease-out
          flex items-center justify-center
        "
        title="Send query"
      >
        {isLoading ? (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
