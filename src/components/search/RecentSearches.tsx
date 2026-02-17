'use client';

import { getRecentSearches, clearRecentSearches } from '@/lib/search';

interface RecentSearchesProps {
  onSelect: (query: string) => void;
}

export default function RecentSearches({ onSelect }: RecentSearchesProps) {
  const recent = getRecentSearches();

  if (recent.length === 0) return null;

  return (
    <div className="px-4 py-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-navy/40 dark:text-white/40 uppercase tracking-wider">
          Recent Searches
        </span>
        <button
          onClick={clearRecentSearches}
          className="text-xs text-navy/30 dark:text-white/30 hover:text-navy/50 dark:hover:text-white/50 transition-colors"
        >
          Clear
        </button>
      </div>
      {recent.map((query) => (
        <button
          key={query}
          onClick={() => onSelect(query)}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm text-navy/60 dark:text-white/60 hover:bg-cream-dark dark:hover:bg-white/5 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {query}
        </button>
      ))}
    </div>
  );
}
