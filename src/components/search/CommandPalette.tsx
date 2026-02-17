'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { SearchResult, addRecentSearch } from '@/lib/search';
import SearchResultItem from './SearchResultItem';
import RecentSearches from './RecentSearches';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const debounce = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        setResults(json.data || []);
        setSelectedIndex(0);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 200);

    return () => clearTimeout(debounce);
  }, [query]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      addRecentSearch(query);
      onClose();
      router.push(result.url);
    },
    [query, onClose, router]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] sm:pt-[20vh]">
      <div className="fixed inset-0 bg-navy/60 dark:bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl mx-2 sm:mx-0 bg-white dark:bg-navy-light rounded-2xl shadow-modal overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-cream-dark dark:border-slate-700">
          <svg className="w-5 h-5 text-navy/30 dark:text-white/30 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search cards, boards, people..."
            className="flex-1 bg-transparent text-sm text-navy dark:text-white placeholder:text-navy/30 dark:placeholder:text-white/30 outline-none font-body"
          />
          {loading && (
            <svg className="animate-spin w-4 h-4 text-electric" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          <kbd className="hidden sm:inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono text-navy/30 dark:text-white/30 bg-cream-dark dark:bg-white/10">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {!query.trim() && <RecentSearches onSelect={(q) => setQuery(q)} />}
          {query.trim() && results.length === 0 && !loading && (
            <div className="px-4 py-8 text-center text-sm text-navy/40 dark:text-white/40">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}
          {results.map((result, index) => (
            <SearchResultItem
              key={`${result.type}-${result.id}`}
              result={result}
              isSelected={index === selectedIndex}
              onClick={() => handleSelect(result)}
            />
          ))}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-cream-dark dark:border-slate-700 flex items-center gap-4 text-[10px] text-navy/30 dark:text-white/30">
            <span><kbd className="font-mono">↑↓</kbd> Navigate</span>
            <span><kbd className="font-mono">↵</kbd> Select</span>
            <span><kbd className="font-mono">ESC</kbd> Close</span>
          </div>
        )}
      </div>
    </div>
  );
}
