'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface ToolCallEvent {
  name: string;
  input: Record<string, unknown>;
  result?: string;
  success?: boolean;
  status: 'running' | 'completed' | 'failed';
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallEvent[];
}

interface AgentSessionPanelProps {
  sessionId: string;
  initialMessages?: ChatMessage[];
  /** If set, auto-send this as the first message on mount */
  initialPrompt?: string;
  onInitialPromptConsumed?: () => void;
  onStatusChange: (status: 'idle' | 'running' | 'cancelled' | 'error') => void;
}

export default function AgentSessionPanel({ sessionId, initialMessages, initialPrompt, onInitialPromptConsumed, onStatusChange }: AgentSessionPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages || []);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!!initialMessages);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialPromptSentRef = useRef(false);

  // Load session history from DB on mount (only if no initialMessages and no initialPrompt)
  useEffect(() => {
    if (initialMessages || initialPrompt) {
      setLoaded(true);
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/agents/sessions');
        if (!res.ok) return;
        const { data } = await res.json();
        const session = data?.find((s: any) => s.id === sessionId);
        if (session?.message_history?.length) {
          const parsed = parseMessageHistory(session.message_history);
          setMessages(parsed);
        }
      } catch {}
      setLoaded(true);
    })();
  }, [sessionId, initialMessages, initialPrompt]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  const readSSEStream = useCallback(async (res: Response) => {
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response stream');

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';
    let accumulated = '';
    const currentToolCalls: ToolCallEvent[] = [];

    // Add placeholder assistant message
    setMessages(prev => [...prev, { role: 'assistant', content: '', toolCalls: [] }]);

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
            if (currentEvent === 'token' && data.text) {
              accumulated += data.text;
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') last.content = accumulated;
                return updated;
              });
              scrollToBottom();
            } else if (currentEvent === 'tool_call') {
              currentToolCalls.push({ name: data.name, input: data.input, status: 'running' });
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') last.toolCalls = [...currentToolCalls];
                return updated;
              });
            } else if (currentEvent === 'tool_result') {
              const idx = currentToolCalls.findIndex(tc => tc.name === data.name && tc.status === 'running');
              if (idx >= 0) {
                currentToolCalls[idx] = { ...currentToolCalls[idx], result: data.result, success: data.success, status: data.success ? 'completed' : 'failed' };
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === 'assistant') last.toolCalls = [...currentToolCalls];
                  return updated;
                });
              }
            } else if (currentEvent === 'error' && data.error) {
              setError(data.error);
            }
          } catch {}
        }
      }
    }
  }, [scrollToBottom]);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || streaming) return;

    setInput('');
    setError(null);
    setStreaming(true);
    onStatusChange('running');

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    scrollToBottom();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/agents/sessions/${sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      await readSSEStream(res);
      onStatusChange('idle');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Failed to get response');
        onStatusChange('error');
        // Remove empty assistant placeholder on error
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && !last.content) return prev.slice(0, -1);
          return prev;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      scrollToBottom();
    }
  }, [input, streaming, sessionId, onStatusChange, readSSEStream, scrollToBottom]);

  const handleKill = useCallback(async () => {
    abortRef.current?.abort();
    try {
      await fetch(`/api/agents/sessions/${sessionId}/kill`, { method: 'POST' });
    } catch {}
    setStreaming(false);
    onStatusChange('cancelled');
  }, [sessionId, onStatusChange]);

  // Auto-send initial prompt on mount (for newly launched sessions)
  useEffect(() => {
    if (!loaded || !initialPrompt || initialPromptSentRef.current) return;
    initialPromptSentRef.current = true;
    onInitialPromptConsumed?.();
    // Small delay to ensure component is fully rendered
    setTimeout(() => sendMessage(initialPrompt), 100);
  }, [loaded, initialPrompt, sendMessage, onInitialPromptConsumed]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-12 text-navy/30 dark:text-slate-500">
            <p className="text-sm">Send a message to start the conversation.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={msg.role === 'user' ? 'ml-12' : 'mr-8'}>
            {/* User message */}
            {msg.role === 'user' && (
              <div className="bg-electric/10 dark:bg-electric/15 rounded-lg px-3 py-2">
                <p className="text-sm text-navy dark:text-slate-100 whitespace-pre-wrap">{msg.content}</p>
              </div>
            )}

            {/* Assistant message */}
            {msg.role === 'assistant' && (
              <div>
                {/* Tool calls */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {msg.toolCalls.map((tc, j) => (
                      <div
                        key={j}
                        className={`px-2.5 py-1.5 rounded text-xs flex items-center gap-2 ${
                          tc.status === 'running' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' :
                          tc.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' :
                          'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                        }`}
                      >
                        {tc.status === 'running' && <span className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                        <span className="font-mono font-semibold">{tc.name}</span>
                        {tc.result && <span className="text-navy/40 dark:text-slate-500 truncate flex-1">{tc.result.slice(0, 80)}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Text content */}
                {msg.content && (
                  <div className="bg-cream dark:bg-slate-900 rounded-lg px-3 py-2">
                    <p className="text-sm text-navy/80 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                )}

                {/* Streaming indicator */}
                {!msg.content && streaming && i === messages.length - 1 && (
                  <div className="bg-cream dark:bg-slate-900 rounded-lg px-3 py-2">
                    <span className="inline-flex gap-1 text-navy/30 dark:text-slate-500">
                      <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                      <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                      <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mb-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Input bar */}
      <div className="border-t border-navy/10 dark:border-slate-700 p-3 flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Send a message..."
          rows={1}
          disabled={streaming}
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-600 bg-cream dark:bg-slate-900 text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-electric/30 resize-none disabled:opacity-50"
        />

        {streaming ? (
          <button
            onClick={handleKill}
            className="shrink-0 p-2.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
            title="Stop agent"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          </button>
        ) : (
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim()}
            className="shrink-0 p-2.5 rounded-lg bg-electric text-white hover:bg-electric/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Send message"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Parse Anthropic MessageParam[] into our ChatMessage[] for display.
 */
function parseMessageHistory(history: unknown[]): ChatMessage[] {
  const msgs: ChatMessage[] = [];
  for (const entry of history as any[]) {
    if (entry.role === 'user') {
      const content = typeof entry.content === 'string'
        ? entry.content
        : Array.isArray(entry.content)
          ? entry.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
          : '';
      // Skip tool_result messages (they're internal)
      if (Array.isArray(entry.content) && entry.content[0]?.type === 'tool_result') continue;
      if (content) msgs.push({ role: 'user', content });
    } else if (entry.role === 'assistant') {
      const text = typeof entry.content === 'string'
        ? entry.content
        : Array.isArray(entry.content)
          ? entry.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
          : '';
      if (text) msgs.push({ role: 'assistant', content: text });
    }
  }
  return msgs;
}
