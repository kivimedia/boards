'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { PageForgeBuildMessage } from '@/lib/types';

interface PageForgeChatPanelProps {
  buildId: string;
  buildStatus: string;
}

const ROLE_STYLES: Record<string, { bg: string; name: string; icon: string }> = {
  orchestrator: {
    bg: 'bg-electric/10 dark:bg-electric/20',
    name: 'Orchestrator',
    icon: '🤖',
  },
  system: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    name: 'System',
    icon: '⚙️',
  },
  user: {
    bg: 'bg-cream dark:bg-slate-800',
    name: 'You',
    icon: '💬',
  },
};

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function PageForgeChatPanel({ buildId, buildStatus }: PageForgeChatPanelProps) {
  const [messages, setMessages] = useState<PageForgeBuildMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingReply, setPendingReply] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/pageforge/builds/${buildId}/messages`);
      if (!res.ok) return;
      const json = await res.json();
      setMessages(json.messages || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [buildId]);

  // Initial load
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Realtime subscription for new messages
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`pf-chat-${buildId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pageforge_build_messages',
          filter: `build_id=eq.${buildId}`,
        },
        (payload) => {
          const newMsg = payload.new as PageForgeBuildMessage;
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            // If this is a user message and we have an optimistic one, replace it
            if (newMsg.role === 'user') {
              const withoutOptimistic = prev.filter((m) => !m.id.startsWith('temp-'));
              return [...withoutOptimistic, newMsg];
            }
            return [...prev, newMsg];
          });
          // Clear typing indicator when orchestrator replies
          if (newMsg.role === 'orchestrator') {
            setPendingReply(false);
          }
          scrollToBottom();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [buildId, scrollToBottom]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setInput('');

    // Optimistic: show user message immediately
    const optimisticMsg: PageForgeBuildMessage = {
      id: `temp-${Date.now()}`,
      build_id: buildId,
      role: 'user',
      sender_name: 'You',
      sender_id: null,
      content: text,
      phase: null,
      phase_index: null,
      metadata: {},
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    scrollToBottom();
    setPendingReply(true);
    // Auto-clear typing indicator after 15s
    setTimeout(() => setPendingReply(false), 15_000);

    try {
      const res = await fetch(`/api/pageforge/builds/${buildId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) {
        // Remove optimistic and restore input
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
        setInput(text);
        setPendingReply(false);
      } else {
        // Refetch to ensure we show the reply even if Realtime missed it
        await fetchMessages();
        setPendingReply(false);
        scrollToBottom();
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setInput(text);
      setPendingReply(false);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isFinished = ['published', 'failed', 'cancelled'].includes(buildStatus);

  return (
    <div className="rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-card overflow-hidden flex flex-col" style={{ height: '420px' }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-cream-dark dark:border-slate-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">
          Build Chat
        </h3>
        <span className="text-[10px] text-navy/40 dark:text-slate-500 font-body">
          {messages.length} message{messages.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-electric animate-pulse" />
              <div className="w-1.5 h-1.5 rounded-full bg-electric animate-pulse [animation-delay:150ms]" />
              <div className="w-1.5 h-1.5 rounded-full bg-electric animate-pulse [animation-delay:300ms]" />
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <p className="text-sm text-navy/30 dark:text-slate-600 font-body">
                No messages yet
              </p>
              <p className="text-xs text-navy/20 dark:text-slate-700 font-body mt-1">
                The orchestrator will post updates as the build progresses
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const style = ROLE_STYLES[msg.role] || ROLE_STYLES.system;
            return (
              <div key={msg.id} className={`rounded-lg px-3 py-2 ${style.bg}`}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-semibold text-navy dark:text-slate-200 font-heading">
                    {style.icon} {msg.sender_name || style.name}
                  </span>
                  <div className="flex items-center gap-2">
                    {msg.phase && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-navy/5 dark:bg-slate-700 text-navy/40 dark:text-slate-500 font-mono">
                        {msg.phase}
                      </span>
                    )}
                    <span className="text-[10px] text-navy/30 dark:text-slate-600 font-body">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-navy/70 dark:text-slate-300 font-body whitespace-pre-wrap leading-relaxed">
                  {msg.content}
                </p>
              </div>
            );
          })
        )}
        {pendingReply && (
          <div className="rounded-lg px-3 py-2 bg-electric/10 dark:bg-electric/20 animate-pulse">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-navy dark:text-slate-200 font-heading">
                🤖 Orchestrator
              </span>
              <span className="text-[10px] text-navy/40 dark:text-slate-500 font-body italic">thinking...</span>
            </div>
            <div className="flex items-center gap-1 mt-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-electric animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-electric animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-electric animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-cream-dark dark:border-slate-700 p-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isFinished ? 'Build finished' : 'Message the orchestrator...'}
            disabled={sending || isFinished}
            rows={1}
            className="flex-1 resize-none px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body placeholder:text-navy/30 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-electric/30 disabled:opacity-50"
            style={{ minHeight: '36px', maxHeight: '80px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending || isFinished}
            className="px-3 py-2 rounded-lg bg-electric text-white text-xs font-semibold font-body hover:bg-electric/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            {sending ? (
              <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-[10px] text-navy/25 dark:text-slate-600 mt-1.5 font-body">
          Press Enter to send, Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
