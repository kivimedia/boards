'use client';

import { SearchResult } from '@/lib/search';

interface SearchResultItemProps {
  result: SearchResult;
  isSelected: boolean;
  onClick: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  card: '🗂️',
  board: '📋',
  comment: '💬',
  person: '👤',
};

export default function SearchResultItem({ result, isSelected, onClick }: SearchResultItemProps) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
        ${isSelected
          ? 'bg-electric/10 dark:bg-electric/20'
          : 'hover:bg-cream-dark dark:hover:bg-white/5'
        }
      `}
    >
      <span className="text-lg shrink-0">{TYPE_ICONS[result.type] || '📄'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-navy dark:text-white truncate">{result.title}</p>
        {result.subtitle && (
          <p className="text-xs text-navy/40 dark:text-white/40 truncate">{result.subtitle}</p>
        )}
      </div>
      <span className="text-[10px] text-navy/30 dark:text-white/30 uppercase font-medium shrink-0">
        {result.type}
      </span>
    </button>
  );
}
