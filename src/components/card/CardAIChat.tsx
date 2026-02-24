'use client';

import { useState, useRef, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import type { ChatSession } from '@/lib/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MODELS = [
  // Anthropic
  { id: 'claude-haiku-4-5-20251001',  label: 'Haiku (fast)',       provider: 'anthropic' as const },
  { id: 'claude-sonnet-4-5-20250929', label: 'Sonnet',             provider: 'anthropic' as const },
  { id: 'claude-opus-4-6',            label: 'Opus (best)',         provider: 'anthropic' as const },
  // OpenAI
  { id: 'gpt-4o-mini',                label: 'GPT-4o mini',        provider: 'openai' as const },
  { id: 'gpt-4o',                     label: 'GPT-4o',             provider: 'openai' as const },
  { id: 'o3-mini',                    label: 'o3 mini (5.2)',      provider: 'openai' as const },
  { id: 'o3',                         label: 'o3 (5.3)',           provider: 'openai' as const },
  // Google — Gemini 3 family
  { id: 'gemini-3.1-pro-preview',              label: 'Gemini 3.1 Pro (reasoning/coding)', provider: 'google' as const },
  { id: 'gemini-3.1-pro-preview-customtools',  label: 'Gemini 3.1 Pro (custom tools)',     provider: 'google' as const },
  { id: 'gemini-3-pro-preview',                label: 'Gemini 3 Pro (multimodal)',          provider: 'google' as const },
  { id: 'gemini-3-flash-preview',              label: 'Gemini 3 Flash (fast)',              provider: 'google' as const },
  { id: 'gemini-3-pro-image-preview',          label: 'Gemini 3 Pro Image',                 provider: 'google' as const },
  // Google — Gemini 2.5 family
  { id: 'gemini-2.5-pro',                      label: 'Gemini 2.5 Pro',                     provider: 'google' as const },
  { id: 'gemini-2.5-flash',                    label: 'Gemini 2.5 Flash',                   provider: 'google' as const },
  { id: 'gemini-2.5-flash-lite',               label: 'Gemini 2.5 Flash Lite (fastest)',    provider: 'google' as const },
  { id: 'gemini-2.5-flash-preview-tts',        label: 'Gemini 2.5 Flash TTS',               provider: 'google' as const },
  { id: 'gemini-2.5-pro-preview-tts',          label: 'Gemini 2.5 Pro TTS',                 provider: 'google' as const },
  { id: 'gemini-2.5-flash-native-audio-preview-12-2025', label: 'Gemini 2.5 Flash Audio', provider: 'google' as const },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Attachment {
  url: string;
  name: string;
  type: 'image' | 'file';
}

interface QueueItem {
  id: string;
  text: string;
  attachments: Attachment[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: Attachment[];
}

interface CardAIChatProps {
  cardId: string;
  boardId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CardAIChat({ cardId, boardId }: CardAIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [model, setModel] = useState<string>(MODELS[1].id); // sonnet default
  const [query, setQuery] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'history'>('chat');
  const [allSessions, setAllSessions] = useState<ChatSession[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isAtBottomRef = useRef(true);

  // ── Session loading on mount ──────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/chat?scope=ticket&cardId=${cardId}`)
      .then((r) => r.json())
      .then((json) => {
        const sessions: ChatSession[] = json.data ?? [];
        const latest = sessions[0]; // most recent first
        if (latest?.messages?.length) {
          // Map ChatMessage (from types.ts) to local ChatMessage interface
          setMessages(
            latest.messages
              .filter((m) => m.role === 'user' || m.role === 'assistant')
              .map((m) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
              }))
          );
          setSessionId(latest.id);
          if (latest.model_used) {
            const found = MODELS.find((m) => m.id === latest.model_used);
            if (found) setModel(latest.model_used);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSession(false));
  }, [cardId]);

  // ── File upload helper ────────────────────────────────────────────────────
  const uploadFile = async (file: File): Promise<Attachment | null> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/chat/upload', { method: 'POST', body: form });
    if (!res.ok) return null;
    return res.json();
  };

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async (text: string, attachments: Attachment[]) => {
    setStreaming(true);
    setError(null);

    const userMsg: ChatMessage = { role: 'user', content: text, attachments };
    setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '' }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'ticket',
          cardId,
          boardId,
          message: text,
          sessionId,
          model_override: model,
          attachments,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '',
        event = '',
        accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            event = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const d = JSON.parse(line.slice(6)) as Record<string, unknown>;
              if (event === 'token' && d.text) {
                accumulated += d.text as string;
                setMessages((prev) =>
                  prev.map((m, i) =>
                    i === prev.length - 1 ? { ...m, content: accumulated } : m
                  )
                );
                if (isAtBottomRef.current) {
                  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                }
              } else if (event === 'complete') {
                if (d.session_id) setSessionId(d.session_id as string);
              } else if (event === 'error') {
                throw new Error((d.error as string) || 'Stream error');
              }
            } catch (parseErr) {
              // Only rethrow if it's our own error (not JSON parse error)
              if (parseErr instanceof Error && parseErr.message !== 'JSON parse') {
                const errMsg = parseErr.message;
                if (errMsg !== 'JSON parse' && errMsg !== 'Unexpected token') {
                  throw parseErr;
                }
              }
            }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
        setMessages((prev) => prev.slice(0, -1)); // remove empty assistant msg
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      // Auto-send next queue item
      setQueue((prev) => {
        if (prev.length === 0) return prev;
        const [next, ...rest] = prev;
        setTimeout(() => sendMessage(next.text, next.attachments), 0);
        return rest;
      });
    }
  };

  // ── Handle submit ─────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const text = query.trim();
    if (!text && pendingAttachments.length === 0) return;
    setQuery('');
    const attachments = [...pendingAttachments];
    setPendingAttachments([]);

    if (streaming) {
      setQueue((prev) => [
        ...prev,
        { id: crypto.randomUUID(), text, attachments },
      ]);
      return;
    }
    await sendMessage(text, attachments);
  };

  // ── Queue drag & drop ─────────────────────────────────────────────────────
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    setQueue((prev) => {
      const items = [...prev];
      const [moved] = items.splice(result.source.index, 1);
      items.splice(result.destination!.index, 0, moved);
      return items;
    });
  };

  // ─────────────────────────────────────────────────────────────────────────
  const handleContainerPaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.clipboardData.items);
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const att = await uploadFile(file);
        if (att) setPendingAttachments((prev) => [...prev, att]);
        return;
      }
    }
  };

  const loadHistory = async () => {
    if (loadingHistory) return;
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/chat?scope=ticket&cardId=${cardId}`);
      if (res.ok) {
        const json = await res.json() as { data?: ChatSession[] };
        setAllSessions(json.data ?? []);
      }
    } catch { /* ignore */ } finally {
      setLoadingHistory(false);
    }
  };

  return (
    <div
      className="border-b border-cream-dark dark:border-slate-700 mb-3"
      onPaste={handleContainerPaste}
    >

      {/* ── Accordion header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsOpen(o => !o)}
            className="flex items-center gap-1 text-[10px] font-semibold text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 uppercase tracking-wide transition-colors"
          >
            <svg
              className={`w-3 h-3 transition-transform ${isOpen ? '' : '-rotate-90'}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            AI
          </button>
          {isOpen && (
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('chat')}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${activeTab === 'chat' ? 'bg-electric/10 text-electric font-medium' : 'text-navy/40 dark:text-slate-500 hover:text-navy/70'}`}
              >Chat</button>
              <button
                onClick={() => { setActiveTab('history'); loadHistory(); }}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${activeTab === 'history' ? 'bg-electric/10 text-electric font-medium' : 'text-navy/40 dark:text-slate-500 hover:text-navy/70'}`}
              >History</button>
            </div>
          )}
        </div>
        {isOpen && activeTab === 'chat' && (
          <div className="flex items-center gap-2">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="text-[10px] rounded px-1.5 py-0.5 border border-cream-dark dark:border-slate-600 bg-white dark:bg-slate-800 text-navy dark:text-slate-200 focus:outline-none"
            >
              <optgroup label="Anthropic">
                {MODELS.filter(m => m.provider === 'anthropic').map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </optgroup>
              <optgroup label="OpenAI">
                {MODELS.filter(m => m.provider === 'openai').map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </optgroup>
              <optgroup label="Google">
                {MODELS.filter(m => m.provider === 'google').map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </optgroup>
            </select>
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); setSessionId(null); setError(null); }}
                className="text-[10px] text-navy/30 dark:text-slate-500 hover:text-danger transition-colors"
              >New</button>
            )}
          </div>
        )}
      </div>

      {/* ── Collapsed: show nothing ─────────────────────────────────────────── */}
      {!isOpen && <div className="pb-1" />}

      {/* ── History tab ────────────────────────────────────────────────────── */}
      {isOpen && activeTab === 'history' && (
        <div className="mb-2">
          {loadingHistory ? (
            <div className="flex justify-center py-3">
              <div className="w-4 h-4 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
            </div>
          ) : allSessions.length === 0 ? (
            <p className="text-[10px] text-navy/40 dark:text-slate-500 py-2 text-center">No past conversations for this ticket.</p>
          ) : (
            <div className="space-y-1 max-h-[260px] overflow-y-auto">
              {allSessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    const msgs = (s.messages as { role: string; content: string }[] | null) ?? [];
                    setMessages(msgs.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })));
                    setSessionId(s.id);
                    setActiveTab('chat');
                  }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors"
                >
                  <p className="text-[11px] font-medium text-navy dark:text-slate-200 truncate">{s.title || 'Untitled chat'}</p>
                  <p className="text-[10px] text-navy/40 dark:text-slate-500">
                    {s.message_count ?? 0} messages · {new Date(s.updated_at ?? s.created_at).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Chat tab (visible when isOpen && activeTab === 'chat') ─────────── */}
      {isOpen && activeTab === 'chat' && <>

      {/* ── Loading spinner ─────────────────────────────────────────────────── */}
      {loadingSession && (
        <div className="flex justify-center py-3">
          <div className="w-4 h-4 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
        </div>
      )}

      {/* ── Message history ─────────────────────────────────────────────────── */}
      {!loadingSession && messages.length > 0 && (
        <div
          ref={messagesContainerRef}
          onScroll={() => {
            const el = messagesContainerRef.current;
            if (el) {
              isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
            }
          }}
          className="max-h-[280px] overflow-y-auto space-y-2 pb-2 scrollbar-thin"
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`text-xs rounded-lg px-3 py-2 ${
                msg.role === 'user'
                  ? 'bg-electric/10 dark:bg-electric/15 text-navy dark:text-slate-100 ml-8'
                  : 'bg-cream dark:bg-navy text-navy/80 dark:text-slate-300 mr-4'
              }`}
            >
              {/* Image attachments */}
              {msg.attachments
                ?.filter((a) => a.type === 'image')
                .map((a, j) => (
                  <img
                    key={j}
                    src={a.url}
                    alt={a.name}
                    className="max-w-full max-h-32 rounded mb-1 object-contain"
                  />
                ))}
              {/* File attachments */}
              {msg.attachments
                ?.filter((a) => a.type === 'file')
                .map((a, j) => (
                  <a
                    key={j}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-cream-dark dark:bg-slate-700 text-navy/70 dark:text-slate-300 mb-1 hover:underline"
                  >
                    📎 {a.name}
                  </a>
                ))}
              {/* Streaming dots */}
              {msg.role === 'assistant' && !msg.content && streaming && (
                <span className="inline-flex gap-1 text-navy/30">
                  <span className="animate-bounce" style={{ animationDelay: '0ms' }}>
                    .
                  </span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>
                    .
                  </span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>
                    .
                  </span>
                </span>
              )}
              <div className="whitespace-pre-wrap break-words">{msg.content}</div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <p className="text-[10px] text-danger pb-1 px-1">{error}</p>
      )}

      {/* ── Pending attachment previews ─────────────────────────────────────── */}
      {pendingAttachments.length > 0 && (
        <div className="flex flex-wrap gap-1 pb-1">
          {pendingAttachments.map((a, i) => (
            <div
              key={i}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-cream-dark dark:bg-slate-700 text-navy/70 dark:text-slate-300"
            >
              {a.type === 'image' ? '🖼' : '📎'} {a.name.slice(0, 20)}
              <button
                onClick={() =>
                  setPendingAttachments((prev) => prev.filter((_, j) => j !== i))
                }
                className="text-danger hover:text-danger/70 ml-0.5"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Reply input bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 pb-2">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.txt"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const att = await uploadFile(file);
            if (att) setPendingAttachments((prev) => [...prev, att]);
            e.target.value = '';
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 rounded text-navy/30 hover:text-navy/60 dark:text-slate-500 dark:hover:text-slate-300 transition-colors shrink-0"
          title="Attach file"
        >
          📎
        </button>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={
            streaming
              ? queue.length > 0
                ? 'Adding to queue…'
                : 'Waiting…'
              : messages.length === 0
              ? 'Ask AI about this card…'
              : 'Reply…'
          }
          className="flex-1 px-3 py-1.5 rounded-lg text-xs bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-electric/40 transition-colors"
        />
        {streaming ? (
          <button
            onClick={() => {
              abortRef.current?.abort();
              setQueue([]);
            }}
            className="p-1.5 rounded text-danger hover:bg-danger/10 transition-colors shrink-0"
            title="Stop + clear queue"
          >
            ⏹
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!query.trim() && pendingAttachments.length === 0}
            className="p-1.5 rounded bg-electric text-white hover:bg-electric/90 disabled:opacity-30 transition-colors shrink-0"
          >
            ▶
          </button>
        )}
      </div>

      {/* ── Message queue ───────────────────────────────────────────────────── */}
      {queue.length > 0 && (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="chat-queue">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="border-t border-cream-dark dark:border-slate-700 pt-2 space-y-1"
              >
                <p className="text-[10px] text-navy/40 dark:text-slate-500 mb-1">
                  {queue.length} message{queue.length > 1 ? 's' : ''} queued
                </p>
                {queue.map((item, index) => (
                  <Draggable key={item.id} draggableId={item.id} index={index}>
                    {(drag) => (
                      <div
                        ref={drag.innerRef}
                        {...drag.draggableProps}
                        className="flex items-start gap-1.5 p-1.5 rounded bg-cream dark:bg-slate-800/60 border border-cream-dark dark:border-slate-700 group text-xs"
                      >
                        <span
                          {...drag.dragHandleProps}
                          className="text-navy/20 hover:text-navy/50 cursor-grab active:cursor-grabbing select-none mt-0.5 shrink-0"
                        >
                          ⠿
                        </span>
                        {editingQueueId === item.id ? (
                          <textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                setQueue((prev) =>
                                  prev.map((q) =>
                                    q.id === item.id
                                      ? { ...q, text: editingText }
                                      : q
                                  )
                                );
                                setEditingQueueId(null);
                              }
                              if (e.key === 'Escape') setEditingQueueId(null);
                            }}
                            className="flex-1 text-xs bg-white dark:bg-slate-700 border border-cream-dark dark:border-slate-600 rounded px-1 py-0.5 resize-none"
                            rows={2}
                            autoFocus
                          />
                        ) : (
                          <span className="flex-1 text-navy/70 dark:text-slate-300 truncate">
                            {item.attachments.length > 0 && (
                              <span className="mr-1">📎</span>
                            )}
                            {item.text || (
                              <em className="opacity-50">(attachment only)</em>
                            )}
                          </span>
                        )}
                        <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setEditingQueueId(item.id);
                              setEditingText(item.text);
                            }}
                            className="text-navy/40 hover:text-navy dark:text-slate-500 dark:hover:text-slate-200"
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() =>
                              setQueue((prev) =>
                                prev.filter((q) => q.id !== item.id)
                              )
                            }
                            className="text-navy/40 hover:text-danger dark:text-slate-500"
                            title="Remove"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      </> /* end chat tab */}
    </div>
  );
}
