'use client';

import type { ChatMessage as ChatMessageType } from '@/lib/types';

interface ChatMessageProps {
  message: ChatMessageType;
  isStreaming?: boolean;
}

function formatContent(content: string): string {
  let html = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic: *text*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code: `text`
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="px-1 py-0.5 rounded bg-navy/5 text-xs font-mono">$1</code>'
  );
  // Line breaks
  html = html.replace(/\n/g, '<br />');

  return html;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString();
}

export default function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="px-3 py-1.5 rounded-lg bg-cream-dark/60 dark:bg-slate-800/60 text-navy/40 dark:text-slate-400 text-xs font-body text-center max-w-[85%]">
          <div dangerouslySetInnerHTML={{ __html: formatContent(message.content) }} />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[85%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Role label */}
        <span className="text-[10px] font-semibold text-navy/30 dark:text-slate-500 uppercase tracking-wider mb-1 px-1 font-heading">
          {isUser ? 'You' : 'Assistant'}
        </span>

        {/* Message bubble */}
        <div
          className={`
            px-3.5 py-2.5 text-sm font-body leading-relaxed
            ${isUser
              ? 'bg-electric text-white rounded-2xl rounded-br-md'
              : 'bg-cream-dark dark:bg-slate-800 text-navy dark:text-slate-100 rounded-2xl rounded-bl-md'
            }
          `}
        >
          <div dangerouslySetInnerHTML={{ __html: formatContent(message.content) }} />
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 ml-0.5 bg-electric/70 animate-pulse rounded-sm align-text-bottom" />
          )}
        </div>

        {/* Timestamp + tokens */}
        <div className="flex items-center gap-2 mt-1 px-1">
          <span className="text-[10px] text-navy/25 dark:text-slate-500 font-body">
            {formatTimestamp(message.timestamp)}
          </span>
          {message.tokens !== undefined && message.tokens > 0 && (
            <span className="text-[10px] text-navy/20 dark:text-slate-600 font-body">
              {message.tokens} tokens
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
