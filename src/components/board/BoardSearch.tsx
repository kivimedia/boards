'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface SearchResult {
  id: string;
  title: string;
  list_name?: string;
}

interface BoardSearchProps {
  boardId: string;
  onCardClick: (cardId: string) => void;
  isDark?: boolean;
}

export default function BoardSearch({ boardId, onCardClick, isDark }: BoardSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=cards&board_id=${boardId}`);
      if (res.ok) {
        const data = await res.json();
        setResults((data.data?.cards || data.cards || data.data || []).slice(0, 10));
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  const handleInputChange = (value: string) => {
    setQuery(value);
    setSelectedIndex(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleSelect = (cardId: string) => {
    onCardClick(cardId);
    setOpen(false);
    setQuery('');
    setResults([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex].id);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      setResults([]);
    }
  };

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
        setResults([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const btnClass = isDark
    ? 'text-white/70 hover:text-white hover:bg-white/10'
    : 'text-navy/40 dark:text-slate-400 hover:text-navy dark:hover:text-white hover:bg-cream-dark dark:hover:bg-slate-800';

  return (
    <div ref={containerRef} className="relative">
      {open ? (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search cards..."
            className="w-48 sm:w-56 px-3 py-1.5 rounded-lg text-sm bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
          />
          <button
            onClick={() => { setOpen(false); setQuery(''); setResults([]); }}
            className={`p-1.5 rounded-lg transition-colors ${btnClass}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          title="Search cards"
          className={`p-2 rounded-lg transition-colors ${btnClass}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>
      )}

      {/* Results dropdown */}
      {open && query.trim() && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-white dark:bg-dark-surface rounded-xl shadow-modal border border-cream-dark dark:border-slate-700 z-50 max-h-[300px] overflow-y-auto">
          {loading && (
            <div className="px-3 py-4 text-center text-sm text-navy/40 dark:text-slate-500">Searching...</div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-navy/40 dark:text-slate-500">No results found</div>
          )}
          {!loading && results.map((result, i) => (
            <button
              key={result.id}
              onClick={() => handleSelect(result.id)}
              className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-b border-cream-dark/30 dark:border-slate-700/30 last:border-b-0 ${
                i === selectedIndex
                  ? 'bg-electric/10 text-electric'
                  : 'text-navy dark:text-slate-100 hover:bg-cream-dark/50 dark:hover:bg-slate-700/50'
              }`}
            >
              <div className="font-medium truncate">{result.title}</div>
              {result.list_name && (
                <div className="text-[11px] text-navy/40 dark:text-slate-500 mt-0.5">in {result.list_name}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
