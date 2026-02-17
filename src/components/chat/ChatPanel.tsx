'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatScope, ChatMessage as ChatMessageType, ChatSession } from '@/lib/types';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import ChatScopeSelector from './ChatScopeSelector';
import ChatHistory from './ChatHistory';

interface ChatPanelProps {
  scope: ChatScope;
  cardId?: string;
  boardId?: string;
  clientId?: string;
  onClose: () => void;
}

type PanelView = 'chat' | 'history';

interface PendingAction {
  toolName: string;
  toolInput: Record<string, unknown>;
  message: string;
}

export default function ChatPanel({ scope: initialScope, cardId, boardId, clientId, onClose }: ChatPanelProps) {
  const [scope, setScope] = useState<ChatScope>(initialScope);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [view, setView] = useState<PanelView>('chat');
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [includeAttachments, setIncludeAttachments] = useState(false);
  const [brainMode, setBrainMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Fetch sessions for history view
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const params = new URLSearchParams();
      if (cardId) params.set('card_id', cardId);
      if (boardId) params.set('board_id', boardId);

      const res = await fetch(`/api/chat/sessions?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load sessions');
      const json = await res.json();
      setSessions(json.data || []);
    } catch {
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  }, [cardId, boardId]);

  useEffect(() => {
    if (view === 'history') {
      fetchSessions();
    }
  }, [view, fetchSessions]);

  // Load an existing session
  const loadSession = useCallback(async (session: ChatSession) => {
    setSessionId(session.id);
    setMessages(session.messages || []);
    setScope(session.scope);
    setView('chat');
  }, []);

  // Delete a session
  const deleteSession = useCallback(async (deleteSessionId: string) => {
    try {
      const res = await fetch(`/api/chat/sessions/${deleteSessionId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete session');
      setSessions((prev) => prev.filter((s) => s.id !== deleteSessionId));
      // If we deleted the current session, reset
      if (sessionId === deleteSessionId) {
        setSessionId(null);
        setMessages([]);
      }
    } catch {
      setError('Failed to delete conversation');
      setTimeout(() => setError(null), 3000);
    }
  }, [sessionId]);

  // Core streaming function (used by both regular send and confirmed actions)
  const streamRequest = useCallback(async (
    body: Record<string, unknown>,
    appendUserMessage?: ChatMessageType
  ) => {
    if (appendUserMessage) {
      setMessages((prev) => [...prev, appendUserMessage]);
    }
    setIsLoading(true);
    setIsStreaming(false);
    setError(null);
    setPendingAction(null);

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to send message');
      }

      // Stream response — read SSE events
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let streamedContent = '';
      let finalTokens = 0;

      // Add placeholder assistant message for streaming
      const streamingMsg: ChatMessageType = {
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, streamingMsg]);
      setIsLoading(false);
      setIsStreaming(true);

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete last line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(trimmed.slice(6));

            if (data.type === 'token') {
              streamedContent += data.content;
              // Update the last message in place
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: streamedContent };
                }
                return updated;
              });
            } else if (data.type === 'confirmation_required') {
              // Claude wants to use a tool that needs user approval
              setPendingAction({
                toolName: data.toolName,
                toolInput: data.toolInput,
                message: data.message,
              });
            } else if (data.type === 'tool_result') {
              // A tool was executed automatically (no confirmation needed)
              // The result is already part of the streamed content
            } else if (data.type === 'done') {
              finalTokens = data.outputTokens || 0;
              if (data.sessionId && !sessionId) {
                setSessionId(data.sessionId);
              }
            } else if (data.type === 'error') {
              throw new Error(data.message || 'Stream error');
            }
          } catch (parseErr) {
            // Skip malformed SSE lines
            if (parseErr instanceof Error && parseErr.message !== 'Stream error') continue;
            throw parseErr;
          }
        }
      }

      // Finalize the streamed message with token count
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') {
          updated[updated.length - 1] = { ...last, content: streamedContent, tokens: finalTokens };
        }
        return updated;
      });
      setIsStreaming(false);
    } catch (err) {
      setIsStreaming(false);
      setError(err instanceof Error ? err.message : 'Something went wrong');
      // Remove streaming assistant message and user message on error
      setMessages((prev) => {
        const filtered = [...prev];
        // Remove the last assistant (streaming) message if it exists with empty content
        if (filtered.length > 0 && filtered[filtered.length - 1].role === 'assistant' && !filtered[filtered.length - 1].content) {
          filtered.pop();
        }
        // Remove the user message
        if (filtered.length > 0 && filtered[filtered.length - 1].role === 'user') {
          filtered.pop();
        }
        return filtered;
      });
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  }, [sessionId]);

  // Send a brain query (non-streaming, via client brain API)
  const sendBrainQuery = useCallback(async (content: string) => {
    if (!clientId) return;

    const userMessage: ChatMessageType = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/clients/${clientId}/brain/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: content }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Brain query failed');
      }

      const json = await res.json();
      const data = json.data;

      // Format brain response with confidence and sources
      const confidence = data.confidence ?? 0;
      const confidenceLabel = confidence >= 0.8 ? '🟢 High' : confidence >= 0.5 ? '🟡 Medium' : '🔴 Low';
      const sourcesText = data.sources?.length
        ? `\n\n---\n**Sources** (${data.sources.length}):\n${data.sources.map((s: { title: string; similarity: number }) => `• ${s.title} (${Math.round(s.similarity * 100)}%)`).join('\n')}`
        : '';

      const assistantMsg: ChatMessageType = {
        role: 'assistant',
        content: `${data.response}${sourcesText}\n\n_Confidence: ${confidenceLabel}_`,
        timestamp: new Date().toISOString(),
        tokens: data.outputTokens,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Brain query failed');
      // Remove the user message on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  }, [clientId]);

  // Send a message (streaming or brain mode)
  const handleSend = useCallback(async (content: string) => {
    // Brain mode: route to client brain API
    if (brainMode && clientId) {
      return sendBrainQuery(content);
    }

    const userMessage: ChatMessageType = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    const body: Record<string, unknown> = {
      message: content,
      scope,
    };
    if (sessionId) body.sessionId = sessionId;
    if (cardId) body.cardId = cardId;
    if (boardId) body.boardId = boardId;
    if (includeAttachments && scope === 'ticket') body.includeAttachments = true;

    await streamRequest(body, userMessage);
  }, [scope, sessionId, cardId, boardId, includeAttachments, streamRequest, brainMode, clientId, sendBrainQuery]);

  // Handle confirmation of a pending action
  const handleConfirmAction = useCallback(async () => {
    if (!pendingAction) return;

    const body: Record<string, unknown> = {
      message: `Confirmed: ${pendingAction.message}`,
      scope,
      confirmedAction: {
        toolName: pendingAction.toolName,
        toolInput: pendingAction.toolInput,
      },
    };
    if (sessionId) body.sessionId = sessionId;
    if (cardId) body.cardId = cardId;
    if (boardId) body.boardId = boardId;

    await streamRequest(body);
  }, [pendingAction, scope, sessionId, cardId, boardId, streamRequest]);

  // Handle rejection of a pending action
  const handleRejectAction = useCallback(() => {
    setPendingAction(null);
    // Add a system-like message noting the action was cancelled
    const cancelMsg: ChatMessageType = {
      role: 'assistant',
      content: '🚫 Action cancelled.',
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, cancelMsg]);
  }, []);

  // Handle scope change (resets session)
  const handleScopeChange = useCallback((newScope: ChatScope) => {
    setScope(newScope);
    setSessionId(null);
    setMessages([]);
    setError(null);
    setPendingAction(null);
  }, []);

  // Start new conversation
  const handleNewChat = useCallback(() => {
    setSessionId(null);
    setMessages([]);
    setError(null);
    setPendingAction(null);
    setView('chat');
  }, []);

  return (
    <div className="fixed inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:bottom-20 w-full sm:w-[400px] h-[100dvh] sm:h-[600px] sm:max-h-[80vh] bg-white dark:bg-dark-surface sm:rounded-2xl shadow-xl dark:shadow-none border-t sm:border border-cream-dark dark:border-slate-700 z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shrink-0">
        <div className="flex items-center gap-3">
          {/* AI icon */}
          <div className="w-8 h-8 rounded-xl bg-electric/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-electric" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">
              {brainMode ? '🧠 Client Brain' : 'AI Assistant'}
            </h3>
            <ChatScopeSelector
              scope={scope}
              onScopeChange={handleScopeChange}
              cardId={cardId}
              boardId={boardId}
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Brain mode toggle — only when ticket scope + client */}
          {scope === 'ticket' && clientId && (
            <button
              onClick={() => setBrainMode((v) => !v)}
              className={`
                p-1.5 rounded-lg transition-all duration-200
                ${brainMode
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 ring-1 ring-purple-200 dark:ring-purple-800'
                  : 'text-navy/40 dark:text-slate-400 hover:text-navy/60 dark:hover:text-slate-300 hover:bg-cream-dark dark:hover:bg-slate-800'
                }
              `}
              title={brainMode ? 'Brain mode ON — queries client knowledge base' : 'Enable Client Brain mode'}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </button>
          )}

          {/* History toggle */}
          <button
            onClick={() => setView(view === 'history' ? 'chat' : 'history')}
            className={`
              p-1.5 rounded-lg transition-all duration-200
              ${view === 'history'
                ? 'bg-electric/10 text-electric'
                : 'text-navy/40 dark:text-slate-400 hover:text-navy/60 dark:hover:text-slate-300 hover:bg-cream-dark dark:hover:bg-slate-800'
              }
            `}
            title="Chat history"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          {/* New chat */}
          <button
            onClick={handleNewChat}
            className="p-1.5 rounded-lg text-navy/40 dark:text-slate-400 hover:text-navy/60 dark:hover:text-slate-300 hover:bg-cream-dark dark:hover:bg-slate-800 transition-all duration-200"
            title="New conversation"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-navy/40 dark:text-slate-400 hover:text-navy/60 dark:hover:text-slate-300 hover:bg-cream-dark dark:hover:bg-slate-800 transition-all duration-200"
            title="Close chat"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2.5 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-800/30 flex items-center gap-2 shrink-0">
          <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-red-700 dark:text-red-300 font-body flex-1">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Pending action confirmation banner */}
      {pendingAction && (
        <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/30 shrink-0">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 font-heading mb-2">
            Confirm Action
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300 font-body mb-3">
            {pendingAction.message}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleConfirmAction}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-electric hover:bg-electric/90 rounded-lg transition-colors"
            >
              Approve
            </button>
            <button
              onClick={handleRejectAction}
              className="px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-900/60 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      {view === 'history' ? (
        <div className="flex-1 overflow-y-auto">
          {loadingSessions ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
            </div>
          ) : (
            <ChatHistory
              sessions={sessions}
              onSelect={loadSession}
              onDelete={deleteSession}
            />
          )}
        </div>
      ) : (
        <>
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <div className="w-12 h-12 rounded-2xl bg-electric/10 flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-electric" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <h4 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading mb-1">
                  How can I help?
                </h4>
                <p className="text-xs text-navy/40 dark:text-slate-400 font-body leading-relaxed">
                  {brainMode
                    ? 'Client Brain mode — ask questions about this client\'s knowledge base, documents, and history.'
                    : scope === 'ticket'
                      ? 'Ask me anything about this ticket — status, brief details, comments, or next steps. I can also move cards, add labels, post comments, and more.'
                      : scope === 'board'
                        ? 'Ask me about cards, progress, priorities, or anything on this board.'
                        : 'Ask me about any board, card, client, or workflow across the agency.'
                  }
                </p>
              </div>
            ) : (
              <>
                {messages.map((msg, idx) => (
                  <ChatMessage
                    key={`${msg.timestamp}-${idx}`}
                    message={msg}
                    isStreaming={isStreaming && idx === messages.length - 1 && msg.role === 'assistant'}
                  />
                ))}
                {isLoading && (
                  <div className="flex justify-start mb-3">
                    <div className="max-w-[85%]">
                      <span className="text-[10px] font-semibold text-navy/30 dark:text-slate-500 uppercase tracking-wider mb-1 px-1 font-heading block">
                        Assistant
                      </span>
                      <div className="px-3.5 py-3 rounded-2xl rounded-bl-md bg-cream-dark dark:bg-slate-800">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-navy/30 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-navy/30 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-navy/30 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input */}
          <ChatInput
            onSend={handleSend}
            isLoading={isLoading || isStreaming}
            showAttachmentToggle={scope === 'ticket' && !!cardId}
            includeAttachments={includeAttachments}
            onToggleAttachments={() => setIncludeAttachments((v) => !v)}
          />
        </>
      )}
    </div>
  );
}
