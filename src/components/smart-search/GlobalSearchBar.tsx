'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { detectMode, type SearchMode } from '@/hooks/useSmartSearch';
import SearchResults from './SearchResults';
import AiBotResponse from './AiBotResponse';
import type { AiAssistantResponse } from '@/lib/types';

const PLACEHOLDERS = [
  'Search or ask AI...',
  'What are my overdue tasks?',
  'Show workload across boards',
  'Who is assigned most cards?',
  'Search cards, boards...',
];

interface SearchResultItem {
  id: string;
  title: string;
  type?: string;
  url?: string;
  list_name?: string;
  subtitle?: string;
}

interface SearchResults {
  cards?: SearchResultItem[];
  boards?: SearchResultItem[];
  people?: SearchResultItem[];
  comments?: SearchResultItem[];
}

export default function GlobalSearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('search');
  const [modeOverride, setModeOverride] = useState<SearchMode | null>(null);
  const [focused, setFocused] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  // Search state
  const [searchResults, setSearchResults] = useState<SearchResults>({});
  const [loading, setLoading] = useState(false);

  // AI state
  const [aiResponse, setAiResponse] = useState('');
  const [aiMeta, setAiMeta] = useState<Omit<AiAssistantResponse, 'response' | 'thinking'> | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStreaming, setAiStreaming] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController | null>(null);

  const effectiveMode = modeOverride ?? mode;

  // Cycle placeholder text
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Cmd/Ctrl+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setFocused(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!focused) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [focused]);

  const doKeywordSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults({});
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const json = await res.json();
        const raw = json.data || json;
        let grouped: SearchResults;
        if (Array.isArray(raw)) {
          const cards: SearchResultItem[] = [];
          const boards: SearchResultItem[] = [];
          const people: SearchResultItem[] = [];
          const comments: SearchResultItem[] = [];
          for (const item of raw) {
            switch (item.type) {
              case 'card': cards.push(item); break;
              case 'board': boards.push(item); break;
              case 'person': people.push(item); break;
              case 'comment': comments.push(item); break;
            }
          }
          grouped = { cards, boards, people, comments };
        } else {
          grouped = raw;
        }
        setSearchResults({
          cards: (grouped.cards || []).slice(0, 8),
          boards: (grouped.boards || []).slice(0, 4),
          people: (grouped.people || []).slice(0, 4),
          comments: (grouped.comments || []).slice(0, 4),
        });
      }
    } catch {}
    setLoading(false);
  }, []);

  const doAiQuery = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setAiLoading(true);
    setAiStreaming(true);
    setAiResponse('');
    setAiMeta(null);

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/global-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setAiResponse(`Error: ${err.error || 'Failed to get AI response'}`);
        setAiLoading(false);
        setAiStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setAiResponse('Failed to connect to AI assistant');
        setAiLoading(false);
        setAiStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let rawTokens = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (eventType === 'token') {
                rawTokens += data.text;
                setAiResponse(extractResponseFromPartialJson(rawTokens));
                setAiLoading(false);
              } else if (eventType === 'done') {
                setAiResponse(data.response || rawTokens);
                setAiMeta({
                  user_mood: data.user_mood || 'neutral',
                  suggested_questions: data.suggested_questions || [],
                  matched_categories: data.matched_categories || ['general'],
                  redirect_to_owner: data.redirect_to_owner || { should_redirect: false },
                });
                setAiStreaming(false);
              } else if (eventType === 'error') {
                setAiResponse(`Error: ${data.error || 'AI assistant error'}`);
                setAiStreaming(false);
              }
            } catch {}
            eventType = '';
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setAiResponse('Failed to connect to AI assistant');
      }
    }
    setAiLoading(false);
    setAiStreaming(false);
  }, []);

  const handleInput = useCallback((value: string) => {
    setQuery(value);
    const detected = detectMode(value);
    // Only use search or ai for global (no command)
    const safeMode = detected === 'command' ? 'search' : detected;
    setMode(safeMode);

    const effective = modeOverride ?? safeMode;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (effective === 'search') {
      setAiResponse('');
      setAiMeta(null);
      debounceRef.current = setTimeout(() => doKeywordSearch(value), 300);
    }
  }, [doKeywordSearch, modeOverride]);

  const submitAi = useCallback(() => {
    if (effectiveMode === 'ai' && query.trim()) {
      doAiQuery(query);
    }
  }, [effectiveMode, query, doAiQuery]);

  const toggleMode = useCallback(() => {
    const modes: SearchMode[] = ['search', 'ai'];
    const currentIdx = modes.indexOf(effectiveMode === 'command' ? 'search' : effectiveMode);
    const newMode = modes[(currentIdx + 1) % modes.length];
    setModeOverride(newMode);

    if (newMode === 'search') {
      setAiResponse('');
      setAiMeta(null);
      if (query.trim()) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doKeywordSearch(query), 300);
      }
    } else {
      setSearchResults({});
    }
  }, [effectiveMode, query, doKeywordSearch]);

  const clear = useCallback(() => {
    setQuery('');
    setMode('search');
    setModeOverride(null);
    setSearchResults({});
    setAiResponse('');
    setAiMeta(null);
    setLoading(false);
    setAiLoading(false);
    setAiStreaming(false);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  const handleClose = useCallback(() => {
    setFocused(false);
    clear();
  }, [clear]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (effectiveMode === 'ai') {
        submitAi();
      } else if (effectiveMode === 'search' && query.trim()) {
        // Trigger search immediately on Enter
        doKeywordSearch(query.trim());
      }
    } else if (e.key === 'Escape') {
      setFocused(false);
      clear();
      inputRef.current?.blur();
    }
  };

  const handleCardClick = useCallback((cardId: string) => {
    // Navigate to card — SearchResults items have a `url` field like `/card/ID`
    router.push(`/card/${cardId}`);
    handleClose();
  }, [router, handleClose]);

  const handleSuggestedQuestion = useCallback((question: string) => {
    setQuery(question);
    handleInput(question);
    setTimeout(() => doAiQuery(question), 50);
  }, [handleInput, doAiQuery]);

  const hasContent = query.trim().length > 0;
  const showDropdown = focused && (hasContent || aiResponse);

  const modeConfig = {
    search: { label: 'Search', color: 'text-navy/40 dark:text-slate-400 bg-cream-dark/50 dark:bg-slate-800/50 hover:bg-cream-dark dark:hover:bg-slate-700' },
    ai: { label: 'AI', color: 'text-electric bg-electric/10 hover:bg-electric/20' },
  };

  const currentMode = effectiveMode === 'command' ? 'search' : effectiveMode;
  const currentModeConfig = modeConfig[currentMode];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveMode === 'ai') {
      submitAi();
    } else if (effectiveMode === 'search' && query.trim()) {
      doKeywordSearch(query.trim());
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={handleSubmit} className={`
        flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all w-full
        ${focused
          ? 'bg-white dark:bg-dark-surface border-electric/40 shadow-sm ring-2 ring-electric/10'
          : 'bg-white/80 dark:bg-dark-surface/80 border-cream-dark dark:border-slate-700 hover:border-electric/30'
        }
      `}>
        <svg className="w-4 h-4 text-navy/30 dark:text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35" />
        </svg>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder={PLACEHOLDERS[placeholderIdx]}
          className="flex-1 text-sm bg-transparent text-navy dark:text-white placeholder:text-navy/30 dark:placeholder:text-slate-500 outline-none font-body"
        />

        {(hasContent || focused) && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={toggleMode}
              title={`Switch mode (currently: ${currentMode})`}
              className={`flex items-center gap-1 text-[10px] font-body px-1.5 py-0.5 rounded-full transition-colors ${currentModeConfig.color}`}
            >
              {currentMode === 'ai' && (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
              {currentModeConfig.label}
            </button>

            {hasContent && (
              <button
                onClick={handleClose}
                className="p-0.5 rounded text-navy/30 dark:text-slate-500 hover:text-navy dark:hover:text-white"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}

        {!focused && !hasContent && (
          <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] text-navy/20 dark:text-slate-600 bg-cream-dark/50 dark:bg-slate-800/50 px-1.5 py-0.5 rounded font-body">
            <span className="text-[9px]">&#8984;</span>K
          </kbd>
        )}
      </form>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 rounded-xl shadow-modal z-[999] overflow-hidden max-h-[60vh] overflow-y-auto">
          {currentMode === 'search' && (
            <SearchResults
              results={searchResults}
              loading={loading}
              onCardClick={handleCardClick}
              onClose={handleClose}
            />
          )}
          {currentMode === 'ai' && (
            <>
              {!aiResponse && !aiLoading && (
                <div className="px-4 py-4 text-center">
                  <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
                    Press <kbd className="px-1.5 py-0.5 bg-cream-dark dark:bg-slate-800 rounded text-[10px] font-body">Enter</kbd> to ask the AI assistant
                  </p>
                </div>
              )}
              <AiBotResponse
                response={aiResponse}
                loading={aiLoading}
                streaming={aiStreaming}
                query={query}
                meta={aiMeta}
                onSuggestedQuestion={handleSuggestedQuestion}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Extract the "response" field from a partial JSON stream.
 */
function extractResponseFromPartialJson(partial: string): string {
  const marker = '"response"';
  const idx = partial.indexOf(marker);
  if (idx === -1) return '';

  const afterMarker = partial.slice(idx + marker.length);
  const colonIdx = afterMarker.indexOf(':');
  if (colonIdx === -1) return '';

  const afterColon = afterMarker.slice(colonIdx + 1).trimStart();
  if (!afterColon.startsWith('"')) return '';

  let result = '';
  let i = 1;
  while (i < afterColon.length) {
    const ch = afterColon[i];
    if (ch === '\\' && i + 1 < afterColon.length) {
      const next = afterColon[i + 1];
      if (next === '"') { result += '"'; i += 2; }
      else if (next === 'n') { result += '\n'; i += 2; }
      else if (next === 't') { result += '\t'; i += 2; }
      else if (next === '\\') { result += '\\'; i += 2; }
      else if (next === '/') { result += '/'; i += 2; }
      else { result += ch; i++; }
    } else if (ch === '"') {
      break;
    } else {
      result += ch;
      i++;
    }
  }

  return result;
}
