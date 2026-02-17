'use client';

import { useState, useRef, useCallback, KeyboardEvent } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  showAttachmentToggle?: boolean;
  includeAttachments?: boolean;
  onToggleAttachments?: () => void;
}

export default function ChatInput({
  onSend,
  isLoading,
  showAttachmentToggle,
  includeAttachments,
  onToggleAttachments,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setValue('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, isLoading, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="border-t border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-3">
      <div className="flex items-end gap-2">
        {/* Attachment toggle */}
        {showAttachmentToggle && (
          <button
            onClick={onToggleAttachments}
            className={`
              shrink-0 w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200
              ${includeAttachments
                ? 'bg-electric/10 text-electric'
                : 'text-navy/30 dark:text-slate-500 hover:text-navy/50 dark:hover:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-800'
              }
            `}
            title={includeAttachments ? 'Attachments included in context' : 'Include attachments in context'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question..."
          rows={1}
          disabled={isLoading}
          className="
            flex-1 resize-none px-3.5 py-2.5 rounded-xl bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700
            text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 font-body
            focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-200
          "
          style={{ minHeight: '40px', maxHeight: '120px' }}
        />

        <button
          onClick={handleSend}
          disabled={!value.trim() || isLoading}
          className="
            shrink-0 w-10 h-10 flex items-center justify-center rounded-xl
            bg-electric text-white hover:bg-electric-bright
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-all duration-200 active:scale-[0.96]
          "
          title="Send message"
        >
          {isLoading ? (
            <svg
              className="animate-spin w-4 h-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          )}
        </button>
      </div>
      <p className="text-[10px] text-navy/25 dark:text-slate-500 font-body mt-1.5 px-1">
        Press Enter to send, Shift+Enter for new line
        {includeAttachments && (
          <span className="text-electric ml-1">• Attachments active</span>
        )}
      </p>
    </div>
  );
}
