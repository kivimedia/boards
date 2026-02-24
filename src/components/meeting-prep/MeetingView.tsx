'use client';

import { useState, useRef, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import type { MeetingPrepSession, MeetingChatMessage, MeetingPrepTicket } from '@/lib/types';

interface Props {
  sessionId: string;
  clientId: string;
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  'Blocked': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'In Review': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'In Progress': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'To Do': 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300',
  'Done': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

export default function MeetingView({ sessionId, clientId, isOpen, onClose }: Props) {
  const [session, setSession] = useState<MeetingPrepSession | null>(null);
  const [messages, setMessages] = useState<MeetingChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && sessionId) {
      fetchSession();
    }
  }, [isOpen, sessionId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentResponse]);

  async function fetchSession() {
    try {
      const res = await fetch(`/api/meeting-prep/${clientId}?session_id=${sessionId}`);
      if (res.ok) {
        // Load from the prep sessions table
      }
    } catch {}
  }

  async function handleSend() {
    if (!input.trim() || streaming) return;

    const userMessage: MeetingChatMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setStreaming(true);
    setCurrentResponse('');

    try {
      const res = await fetch(`/api/meeting-prep/${clientId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage.content, session_id: sessionId }),
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                fullResponse += data.text;
                setCurrentResponse(fullResponse);
              }
            } catch {}
          }
        }
      }

      const assistantMessage: MeetingChatMessage = {
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMessage]);
      setCurrentResponse('');
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  async function handleEndMeeting() {
    // Update session
    try {
      await fetch(`/api/meeting-prep/${clientId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
    } catch {}
    onClose();
  }

  const tickets: MeetingPrepTicket[] = (session?.tickets_snapshot || []) as MeetingPrepTicket[];

  const suggestedQuestions = [
    'What are the blocked items?',
    'Summarize this week\'s progress',
    'What\'s due next week?',
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="flex h-[80vh]">
        {/* Left: Prep data */}
        <div className="w-3/5 border-r border-cream-dark dark:border-slate-700 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-navy dark:text-slate-100 font-heading">
              {session?.meeting_title || 'Meeting'}
            </h2>
            <Button size="sm" variant="ghost" onClick={handleEndMeeting}>
              End Meeting
            </Button>
          </div>

          {session?.executive_summary && (
            <div className="bg-electric/5 dark:bg-electric/10 rounded-xl p-4 mb-4 border border-electric/20">
              <h3 className="text-xs font-semibold text-electric uppercase tracking-wide mb-2 font-heading">Summary</h3>
              <p className="text-sm text-navy dark:text-slate-200 font-body leading-relaxed">{session.executive_summary}</p>
            </div>
          )}

          <div className="space-y-2">
            {tickets.map(t => (
              <div key={t.card_id} className="px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[t.status_label] || ''}`}>
                    {t.status_label}
                  </span>
                  <span className="text-sm text-navy dark:text-slate-100 font-body">{t.title}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Chat */}
        <div className="w-2/5 flex flex-col">
          <div className="p-3 border-b border-cream-dark dark:border-slate-700">
            <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Meeting Assistant</h3>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && !streaming && (
              <div className="space-y-2">
                <p className="text-xs text-navy/40 dark:text-slate-500 font-body">Suggested questions:</p>
                {suggestedQuestions.map(q => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); }}
                    className="block w-full text-left px-3 py-2 rounded-lg bg-cream-dark/30 dark:bg-slate-800/50 text-xs text-navy/70 dark:text-slate-300 hover:bg-electric/5 transition-colors font-body"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm font-body ${
                  msg.role === 'user'
                    ? 'bg-electric text-white'
                    : 'bg-cream-dark/50 dark:bg-slate-800 text-navy dark:text-slate-200'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}

            {streaming && currentResponse && (
              <div className="flex justify-start">
                <div className="max-w-[85%] px-3 py-2 rounded-xl text-sm bg-cream-dark/50 dark:bg-slate-800 text-navy dark:text-slate-200 font-body">
                  {currentResponse}
                  <span className="inline-block w-1.5 h-4 bg-electric/50 animate-pulse ml-0.5" />
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-cream-dark dark:border-slate-700">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Ask about this client..."
                disabled={streaming}
                className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 font-body"
              />
              <Button size="sm" onClick={handleSend} disabled={!input.trim() || streaming}>
                Send
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
