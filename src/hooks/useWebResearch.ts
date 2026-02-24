import { useState, useCallback, useRef } from 'react';
import type { WebResearchTaskType } from '@/lib/types';

// ============================================================================
// WEB RESEARCH SSE HOOK
// ============================================================================

interface ToolCallInfo {
  name: string;
  input: Record<string, unknown>;
  result?: string;
  success?: boolean;
}

interface WebResearchCost {
  ai_tokens: number;
  browser_seconds: number;
  total_cost_usd: number;
}

export interface WebResearchState {
  sessionId: string | null;
  isRunning: boolean;
  text: string;
  toolCalls: ToolCallInfo[];
  screenshots: { url: string; screenshot_url: string }[];
  progress: { iteration: number; max: number };
  error: string | null;
  cost: WebResearchCost;
}

export function useWebResearch() {
  const [state, setState] = useState<WebResearchState>({
    sessionId: null,
    isRunning: false,
    text: '',
    toolCalls: [],
    screenshots: [],
    progress: { iteration: 0, max: 15 },
    error: null,
    cost: { ai_tokens: 0, browser_seconds: 0, total_cost_usd: 0 },
  });

  const abortRef = useRef<AbortController | null>(null);

  const startResearch = useCallback(async (params: {
    task_type: WebResearchTaskType;
    input_prompt: string;
    input_urls?: string[];
    domain_allowlist?: string[];
    board_id?: string;
    card_id?: string;
  }) => {
    // Reset state
    setState({
      sessionId: null,
      isRunning: true,
      text: '',
      toolCalls: [],
      screenshots: [],
      progress: { iteration: 0, max: 15 },
      error: null,
      cost: { ai_tokens: 0, browser_seconds: 0, total_cost_usd: 0 },
    });

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/web-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (currentEvent) {
                case 'session':
                  setState(prev => ({ ...prev, sessionId: data.session_id }));
                  break;
                case 'token':
                  if (data.text) {
                    accumulated += data.text;
                    setState(prev => ({ ...prev, text: accumulated }));
                  }
                  break;
                case 'progress':
                  setState(prev => ({ ...prev, progress: { iteration: data.iteration, max: data.max_iterations } }));
                  break;
                case 'tool_call':
                  setState(prev => ({
                    ...prev,
                    toolCalls: [...prev.toolCalls, { name: data.name, input: data.input }],
                  }));
                  break;
                case 'tool_result':
                  setState(prev => ({
                    ...prev,
                    toolCalls: prev.toolCalls.map((tc, i) =>
                      i === prev.toolCalls.length - 1 && tc.name === data.name
                        ? { ...tc, result: data.result, success: data.success }
                        : tc
                    ),
                  }));
                  break;
                case 'screenshot':
                  setState(prev => ({
                    ...prev,
                    screenshots: [...prev.screenshots, { url: data.url, screenshot_url: data.screenshot_url }],
                  }));
                  break;
                case 'complete':
                  setState(prev => ({ ...prev, isRunning: false }));
                  break;
                case 'error':
                  setState(prev => ({ ...prev, isRunning: false, error: data.error }));
                  break;
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setState(prev => ({ ...prev, isRunning: false, error: err.message }));
      }
    } finally {
      setState(prev => ({ ...prev, isRunning: false }));
    }
  }, []);

  const cancelResearch = useCallback(() => {
    abortRef.current?.abort();
    setState(prev => ({ ...prev, isRunning: false }));
  }, []);

  const importToCard = useCallback(async (boardId: string, listId: string, itemIndices?: number[]) => {
    if (!state.sessionId) return null;

    try {
      const res = await fetch(`/api/web-research/${state.sessionId}/to-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board_id: boardId, list_id: listId, item_indices: itemIndices }),
      });
      const json = await res.json();
      return json.data;
    } catch {
      return null;
    }
  }, [state.sessionId]);

  return {
    ...state,
    startResearch,
    cancelResearch,
    importToCard,
  };
}
