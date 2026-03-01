'use client';

import { useState, useCallback, useRef } from 'react';
import type { AiAssistantResponse, BoardChartData, CommandActionPlan, CommandExecutionResult } from '@/lib/types';

export type SearchMode = 'search' | 'ai' | 'command';

interface SearchResultItem {
  id: string;
  title: string;
  type: string; // 'card' | 'board' | 'person' | 'comment'
  list_name?: string;
  subtitle?: string;
}

interface SearchResults {
  cards?: SearchResultItem[];
  boards?: SearchResultItem[];
  people?: SearchResultItem[];
  comments?: SearchResultItem[];
}

const AI_QUESTION_WORDS = ['what', 'who', 'when', 'where', 'how', 'show', 'list', 'summarize', 'find', 'tell', 'why', 'which', 'describe', 'explain', 'count'];

const COMMAND_KEYWORDS = ['move', 'assign', 'set', 'change', 'archive', 'unarchive', 'label', 'mark', 'tag', 'prioritize', 'reassign'];

/**
 * Detects whether user input is a keyword search, AI query, or command.
 * Command mode is checked first (imperative verbs), then AI, then search.
 */
export function detectMode(input: string): SearchMode {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return 'search';

  const firstWord = trimmed.split(/\s+/)[0];
  const wordCount = trimmed.split(/\s+/).length;

  // Command mode: starts with imperative verb AND has 2+ words
  if (COMMAND_KEYWORDS.includes(firstWord) && wordCount >= 2) return 'command';

  // URLs (kmboards.co or /c/ deep links) -> AI
  if (trimmed.includes('/c/') || trimmed.includes('kmboards.co')) return 'ai';

  // Has question mark -> AI
  if (trimmed.includes('?')) return 'ai';

  // Starts with AI question words -> AI
  if (AI_QUESTION_WORDS.includes(firstWord)) return 'ai';

  // 4+ words -> AI (covers longer natural language)
  if (wordCount >= 4) return 'ai';

  return 'search';
}

export function useSmartSearch(boardId: string) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('search');
  const [modeOverride, setModeOverride] = useState<SearchMode | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResults>({});
  const [aiResponse, setAiResponse] = useState('');
  const [aiMeta, setAiMeta] = useState<Omit<AiAssistantResponse, 'response' | 'thinking'> | null>(null);
  const [aiChartData, setAiChartData] = useState<BoardChartData | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStreaming, setAiStreaming] = useState(false);

  // Command mode state
  const [commandPlan, setCommandPlan] = useState<CommandActionPlan | null>(null);
  const [commandLoading, setCommandLoading] = useState(false);
  const [commandExecuting, setCommandExecuting] = useState(false);
  const [commandResults, setCommandResults] = useState<CommandExecutionResult[] | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController | null>(null);

  const doKeywordSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults({});
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&board_id=${boardId}`);
      if (res.ok) {
        const json = await res.json();
        const raw = json.data || json;

        // API returns a flat SearchResult[] array — group by type
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
    } catch {
      // silent
    }
    setLoading(false);
  }, [boardId]);

  const doAiQuery = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setAiLoading(true);
    setAiStreaming(true);
    setAiResponse('');
    setAiMeta(null);
    setAiChartData(null);

    // Abort previous AI request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/board-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, board_id: boardId }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setAiResponse(`Error: ${err.error || err.message || 'Failed to get AI response'}`);
        setAiLoading(false);
        setAiStreaming(false);
        return;
      }

      // Consume SSE stream
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

        // Process complete SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);

              if (eventType === 'token') {
                rawTokens += data.text;
                // Extract response field from streaming JSON for live display
                const displayText = extractResponseFromPartialJson(rawTokens);
                setAiResponse(displayText);
                setAiLoading(false); // Stop showing skeleton once tokens arrive
              } else if (eventType === 'done') {
                // Final structured response
                setAiResponse(data.response || rawTokens);
                setAiMeta({
                  user_mood: data.user_mood || 'neutral',
                  suggested_questions: data.suggested_questions || [],
                  matched_categories: data.matched_categories || ['general'],
                  redirect_to_owner: data.redirect_to_owner || { should_redirect: false },
                });
                setAiChartData(data.chart_data || null);
                setAiStreaming(false);
              } else if (eventType === 'error') {
                setAiResponse(`Error: ${data.error || 'AI assistant error'}`);
                setAiStreaming(false);
              }
            } catch {
              // Ignore malformed JSON in stream
            }
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
  }, [boardId]);

  const effectiveMode = modeOverride ?? mode;

  const handleInput = useCallback((value: string) => {
    setQuery(value);
    const detectedMode = detectMode(value);
    setMode(detectedMode);

    // Determine effective mode (override takes precedence)
    const effective = modeOverride ?? detectedMode;

    // Clear previous debounce
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (effective === 'search') {
      setAiResponse('');
      setAiMeta(null);
      setCommandPlan(null);
      setCommandResults(null);
      debounceRef.current = setTimeout(() => doKeywordSearch(value), 300);
    }
    // AI mode and command mode: don't auto-trigger, wait for Enter
  }, [doKeywordSearch, modeOverride]);

  const submitAi = useCallback(() => {
    if (effectiveMode === 'ai' && query.trim()) {
      doAiQuery(query);
    }
  }, [effectiveMode, query, doAiQuery]);

  const submitCommand = useCallback(async (cmd?: string) => {
    const commandText = cmd || query;
    if (!commandText.trim()) return;

    setCommandLoading(true);
    setCommandPlan(null);
    setCommandResults(null);

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/board-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: commandText, board_id: boardId }),
        signal: controller.signal,
      });

      const json = await res.json();
      if (!res.ok) {
        setCommandPlan({
          actions: [],
          summary: `Error: ${json.error || 'Failed to parse command'}`,
        });
      } else {
        setCommandPlan(json.data?.plan || json.plan || { actions: [], summary: 'No actions parsed' });
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setCommandPlan({
          actions: [],
          summary: 'Failed to connect to command service',
        });
      }
    }
    setCommandLoading(false);
  }, [query, boardId]);

  const executeCommand = useCallback(async (actions: CommandActionPlan['actions']) => {
    if (actions.length === 0) return;

    setCommandExecuting(true);
    setCommandResults(null);

    try {
      const res = await fetch('/api/board-command/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board_id: boardId, actions }),
      });

      const json = await res.json();
      if (res.ok) {
        setCommandResults(json.data?.results || json.results || []);
      } else {
        setCommandResults([{
          action_index: 0,
          success: false,
          affected_count: 0,
          error: json.error || 'Execution failed',
        }]);
      }
    } catch {
      setCommandResults([{
        action_index: 0,
        success: false,
        affected_count: 0,
        error: 'Failed to connect to execution service',
      }]);
    }
    setCommandExecuting(false);
  }, [boardId]);

  const clearCommand = useCallback(() => {
    setCommandPlan(null);
    setCommandResults(null);
    setCommandLoading(false);
    setCommandExecuting(false);
  }, []);

  const cycleMode = useCallback(() => {
    const modes: SearchMode[] = ['search', 'ai', 'command'];
    const currentIdx = modes.indexOf(effectiveMode);
    const newMode = modes[(currentIdx + 1) % modes.length];
    setModeOverride(newMode);

    // Clear state for non-active modes
    if (newMode === 'search') {
      setAiResponse('');
      setAiMeta(null);
      setCommandPlan(null);
      setCommandResults(null);
      if (query.trim()) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doKeywordSearch(query), 300);
      }
    } else if (newMode === 'ai') {
      setSearchResults({});
      setCommandPlan(null);
      setCommandResults(null);
    } else {
      setSearchResults({});
      setAiResponse('');
      setAiMeta(null);
    }
  }, [effectiveMode, query, doKeywordSearch]);

  // Keep toggleMode for backward compatibility (now cycles 3 modes)
  const toggleMode = cycleMode;

  const clear = useCallback(() => {
    setQuery('');
    setMode('search');
    setModeOverride(null);
    setSearchResults({});
    setAiResponse('');
    setAiMeta(null);
    setAiChartData(null);
    setLoading(false);
    setAiLoading(false);
    setAiStreaming(false);
    setCommandPlan(null);
    setCommandLoading(false);
    setCommandExecuting(false);
    setCommandResults(null);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  return {
    query,
    mode: effectiveMode,
    modeOverride,
    searchResults,
    aiResponse,
    aiMeta,
    aiChartData,
    loading,
    aiLoading,
    aiStreaming,
    // Command mode
    commandPlan,
    commandLoading,
    commandExecuting,
    commandResults,
    // Actions
    handleInput,
    submitAi,
    submitCommand,
    executeCommand,
    clearCommand,
    toggleMode,
    cycleMode,
    clear,
    setQuery,
  };
}

/**
 * Extracts the "response" field value from a partial JSON stream.
 * The stream builds up a JSON object like: `"response": "Some text...", "thinking": ...`
 * We want to show the response text as it streams in.
 */
function extractResponseFromPartialJson(partial: string): string {
  // Look for "response": " ... pattern
  const marker = '"response"';
  const idx = partial.indexOf(marker);
  if (idx === -1) return '';

  // Find the opening quote of the value
  const afterMarker = partial.slice(idx + marker.length);
  const colonIdx = afterMarker.indexOf(':');
  if (colonIdx === -1) return '';

  const afterColon = afterMarker.slice(colonIdx + 1).trimStart();
  if (!afterColon.startsWith('"')) return '';

  // Extract string value, handling escapes
  let result = '';
  let i = 1; // skip opening quote
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
      break; // End of string
    } else {
      result += ch;
      i++;
    }
  }

  return result;
}
