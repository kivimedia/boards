'use client';

import { useState, useRef, useCallback } from 'react';

interface CardAIChatProps {
  cardId: string;
  boardId: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  suggestedQuestions?: string[];
}

export default function CardAIChat({ cardId, boardId }: CardAIChatProps) {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSubmit = useCallback(
    async (text?: string) => {
      const q = (text || query).trim();
      if (!q || streaming) return;
      setQuery('');
      setError(null);

      const userMsg: ChatMessage = { role: 'user', content: q };
      setMessages((prev) => [...prev, userMsg]);

      // Add placeholder assistant message
      const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`/api/cards/${cardId}/assistant`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, boardId }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response stream');

        const decoder = new TextDecoder();
        let buffer = '';
        let fullResponse = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: token')) continue;
            if (line.startsWith('data: ')) {
              const json = line.slice(6);
              try {
                const data = JSON.parse(json);
                if (data.text) {
                  fullResponse += data.text;
                  // Update the last assistant message
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last.role === 'assistant') {
                      last.content = fullResponse;
                    }
                    return updated;
                  });
                }
                if (data.response !== undefined) {
                  // Final done event
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last.role === 'assistant') {
                      last.content = data.response;
                      last.suggestedQuestions = data.suggested_questions || [];
                    }
                    return updated;
                  });
                }
                if (data.error) {
                  setError(data.error);
                }
              } catch {
                // skip malformed
              }
            }
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to get AI response');
          // Remove the empty assistant message on error
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && !last.content) {
              return prev.slice(0, -1);
            }
            return prev;
          });
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    },
    [cardId, boardId, query, streaming]
  );

  const handleSuggestedQuestion = (q: string) => {
    handleSubmit(q);
  };

  const hasChat = messages.length > 0;

  return (
    <div className="border-b border-cream-dark dark:border-slate-700 mb-3">

      {/* ── EMPTY STATE: show the prompt input bar ── */}
      {!hasChat && (
        <div className="flex items-center gap-2 pb-2">
          <div className="relative flex-1">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-navy/30 dark:text-slate-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Ask AI about this card..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs font-body bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-colors"
              disabled={streaming}
            />
          </div>
        </div>
      )}

      {/* ── ACTIVE CHAT: messages + bottom reply bar ── */}
      {hasChat && (
        <>
          {/* Header row with clear button */}
          <div className="flex items-center justify-between pb-1">
            <span className="text-[10px] text-navy/40 dark:text-slate-500 font-body">AI Chat</span>
            <button
              onClick={() => { setMessages([]); setError(null); setQuery(''); }}
              className="text-[10px] text-navy/30 dark:text-slate-500 hover:text-danger transition-colors"
              title="Clear chat"
            >
              Clear
            </button>
          </div>

          {/* Message list */}
          <div className="max-h-[280px] overflow-y-auto space-y-2 pb-2 scrollbar-thin">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`text-xs font-body rounded-lg px-3 py-2 ${
                  msg.role === 'user'
                    ? 'bg-electric/10 dark:bg-electric/15 text-navy dark:text-slate-100 ml-8'
                    : 'bg-cream dark:bg-navy text-navy/80 dark:text-slate-300 mr-4'
                }`}
              >
                {msg.role === 'assistant' && !msg.content && streaming && (
                  <span className="inline-flex gap-1 text-navy/30 dark:text-slate-500">
                    <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                  </span>
                )}
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>

                {msg.suggestedQuestions && msg.suggestedQuestions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-cream-dark/50 dark:border-slate-700/50">
                    {msg.suggestedQuestions.map((sq, j) => (
                      <button
                        key={j}
                        onClick={() => handleSuggestedQuestion(sq)}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-electric/10 text-electric hover:bg-electric/20 transition-colors truncate max-w-[200px]"
                      >
                        {sq}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Error */}
          {error && (
            <p className="text-[10px] text-danger font-body pb-1 px-1">{error}</p>
          )}

          {/* Bottom reply input */}
          <div className="flex items-center gap-2 pt-1 pb-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Reply..."
              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-body bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-colors"
              disabled={streaming}
              autoFocus
            />
            {streaming ? (
              <button
                onClick={() => abortRef.current?.abort()}
                className="p-1.5 rounded-lg text-navy/40 dark:text-slate-500 hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
                title="Stop"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              </button>
            ) : (
              <button
                onClick={() => handleSubmit()}
                disabled={!query.trim()}
                className="p-1.5 rounded-lg bg-electric text-white hover:bg-electric/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
                title="Send"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            )}
          </div>
        </>
      )}

      {/* Error before any chat */}
      {!hasChat && error && (
        <p className="text-[10px] text-danger font-body pb-1 px-1">{error}</p>
      )}
    </div>
  );
}
