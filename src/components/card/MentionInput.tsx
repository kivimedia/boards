'use client';

import { useState } from 'react';
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
      <div className="relative">
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
