'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Button from '@/components/ui/Button';
import { MarkdownToolbarUI } from './MarkdownToolbar';
import { useMentionDropdown } from './useMentionDropdown';
import MentionDropdown from './MentionDropdown';

interface MentionInputProps {
  cardId: string;
  boardId?: string;
  onSubmit: (content: string, mentionedUserIds: string[]) => void;
}

export default function MentionInput({ onSubmit }: MentionInputProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const mention = useMentionDropdown({ value: content, onChange: setContent });

  const handleSubmit = () => {
    if (!content.trim()) return;
    setLoading(true);
    // Resolve mentioned user IDs from profile display names found in text
    const mentionedUserIds = mention.profiles
      .filter((p) => content.includes(`@${p.display_name}`))
      .map((p) => p.id);
    onSubmit(content.trim(), mentionedUserIds);
    setContent('');
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Mention navigation handled first
    if (mention.handleKeyDown(e)) return;

    // Submit with Cmd/Ctrl+Enter
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
      return;
    }

    // Markdown shortcuts
    const ta = mention.textareaRef.current;
    if (ta && e.key === 'b' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const s = ta.selectionStart, en = ta.selectionEnd;
      const sel = content.slice(s, en) || 'bold text';
      const text = content.slice(0, s) + '**' + sel + '**' + content.slice(en);
      setContent(text);
      requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + 2, s + 2 + sel.length); });
    } else if (ta && e.key === 'i' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const s = ta.selectionStart, en = ta.selectionEnd;
      const sel = content.slice(s, en) || 'italic text';
      const text = content.slice(0, s) + '*' + sel + '*' + content.slice(en);
      setContent(text);
      requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + 1, s + 1 + sel.length); });
    }
  };

  return (
    <div className="relative">
      {/* Write / Preview tabs */}
      <div className="flex items-center gap-0 mb-0">
        <button
          type="button"
          onClick={() => setShowPreview(false)}
          className={`px-3 py-1.5 text-xs font-medium rounded-tl-lg border border-b-0 transition-colors font-body ${
            !showPreview
              ? 'bg-white dark:bg-slate-800 border-cream-dark dark:border-slate-600 text-navy dark:text-slate-100'
              : 'bg-cream dark:bg-navy border-transparent text-navy/40 dark:text-slate-500 hover:text-navy/70 dark:hover:text-slate-300'
          }`}
        >
          Write
        </button>
        <button
          type="button"
          onClick={() => setShowPreview(true)}
          className={`px-3 py-1.5 text-xs font-medium rounded-tr-lg border border-b-0 transition-colors font-body ${
            showPreview
              ? 'bg-white dark:bg-slate-800 border-cream-dark dark:border-slate-600 text-navy dark:text-slate-100'
              : 'bg-cream dark:bg-navy border-transparent text-navy/40 dark:text-slate-500 hover:text-navy/70 dark:hover:text-slate-300'
          }`}
        >
          Preview
        </button>
      </div>

      <div className="relative">
        {showPreview ? (
          <div className="min-h-[76px] p-3 rounded-b-xl rounded-tr-xl bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 text-sm font-body prose prose-sm dark:prose-invert max-w-full prose-p:my-0.5 prose-p:font-body prose-a:text-electric prose-code:text-electric prose-code:bg-electric/10 prose-code:px-1 prose-code:rounded prose-ul:my-1 prose-ol:my-1 [overflow-wrap:break-word]">
            {content.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            ) : (
              <span className="text-navy/30 dark:text-slate-500">Nothing to preview yet...</span>
            )}
          </div>
        ) : (
          <>
            <MarkdownToolbarUI
              textareaRef={mention.textareaRef}
              value={content}
              onChange={setContent}
            />
            <textarea
              ref={mention.textareaRef}
              value={content}
              onChange={mention.handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Write a comment... Use @ to mention someone"
              className="w-full p-3 rounded-b-xl rounded-t-none bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 border-t-0 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric resize-y font-body"
              rows={3}
            />
            {mention.showDropdown && (
              <MentionDropdown
                profiles={mention.filteredProfiles}
                selectedIndex={mention.selectedIndex}
                onSelect={mention.selectProfile}
                onHover={mention.setSelectedIndex}
                filter={mention.dropdownFilter}
              />
            )}
          </>
        )}
      </div>

      {content.trim() && (
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-navy/30 dark:text-slate-500 font-body">
            {typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter to submit
          </span>
          <Button size="sm" onClick={handleSubmit} loading={loading}>
            Submit
          </Button>
        </div>
      )}
    </div>
  );
}
