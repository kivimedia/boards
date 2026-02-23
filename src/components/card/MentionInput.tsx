'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';

interface MentionInputProps {
  cardId: string;
  onSubmit: (content: string, mentionedUserIds: string[]) => void;
}

interface MentionData {
  userId: string;
  displayName: string;
}

export default function MentionInput({ cardId, onSubmit }: MentionInputProps) {
  const [content, setContent] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [mentions, setMentions] = useState<MentionData[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownFilter, setDropdownFilter] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [selectedDropdownIndex, setSelectedDropdownIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    const fetchProfiles = async () => {
      const { data } = await supabase.from('profiles').select('*').order('display_name');
      setProfiles(data || []);
    };
    fetchProfiles();
  }, []);

  const filteredProfiles = profiles.filter((p) =>
    p.display_name.toLowerCase().includes(dropdownFilter.toLowerCase())
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const cursorPos = e.target.selectionStart || 0;
      setContent(newValue);

      // Check if we're in a mention context
      const textBeforeCursor = newValue.slice(0, cursorPos);
      const atIndex = textBeforeCursor.lastIndexOf('@');

      if (atIndex !== -1) {
        const charBeforeAt = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' ';
        const textAfterAt = textBeforeCursor.slice(atIndex + 1);

        // Only show dropdown if @ is at start or preceded by whitespace, and no space in the query yet
        if ((atIndex === 0 || charBeforeAt === ' ' || charBeforeAt === '\n') && !textAfterAt.includes(' ')) {
          setMentionStartIndex(atIndex);
          setDropdownFilter(textAfterAt);
          setShowDropdown(true);
          setSelectedDropdownIndex(0);
          return;
        }
      }

      setShowDropdown(false);
      setMentionStartIndex(null);
    },
    []
  );

  const handleSelectMention = useCallback(
    (profile: Profile) => {
      if (mentionStartIndex === null || !textareaRef.current) return;

      const before = content.slice(0, mentionStartIndex);
      const cursorPos = textareaRef.current.selectionStart || content.length;
      const after = content.slice(cursorPos);

      const mentionText = `@${profile.display_name}`;
      const newContent = `${before}${mentionText} ${after}`;

      setContent(newContent);
      setMentions((prev) => {
        if (prev.some((m) => m.userId === profile.id)) return prev;
        return [...prev, { userId: profile.id, displayName: profile.display_name }];
      });
      setShowDropdown(false);
      setMentionStartIndex(null);
      setDropdownFilter('');

      // Restore focus and cursor position
      setTimeout(() => {
        if (textareaRef.current) {
          const newCursorPos = before.length + mentionText.length + 1;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    },
    [content, mentionStartIndex]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showDropdown && filteredProfiles.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedDropdownIndex((prev) =>
          prev < filteredProfiles.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedDropdownIndex((prev) =>
          prev > 0 ? prev - 1 : filteredProfiles.length - 1
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectMention(filteredProfiles[selectedDropdownIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowDropdown(false);
        return;
      }
    }

    // Submit with Cmd/Ctrl+Enter
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (!content.trim()) return;
    setLoading(true);

    // Extract mentioned user IDs that actually appear in the final text
    const mentionedUserIds = mentions
      .filter((m) => content.includes(`@${m.displayName}`))
      .map((m) => m.userId);

    onSubmit(content.trim(), mentionedUserIds);
    setContent('');
    setMentions([]);
    setLoading(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Write a comment... Use @ to mention someone"
          className="w-full p-3 rounded-xl bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric resize-y font-body"
          rows={3}
        />

        {/* Mention dropdown */}
        {showDropdown && filteredProfiles.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-dark-surface rounded-xl border border-cream-dark dark:border-slate-700 shadow-lg dark:shadow-none z-[60] max-h-48 overflow-y-auto"
          >
            {filteredProfiles.map((profile, index) => (
              <button
                key={profile.id}
                onClick={() => handleSelectMention(profile)}
                onMouseEnter={() => setSelectedDropdownIndex(index)}
                className={`
                  w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors
                  first:rounded-t-xl last:rounded-b-xl
                  ${index === selectedDropdownIndex
                    ? 'bg-electric/10 text-navy dark:text-slate-100'
                    : 'text-navy/70 dark:text-slate-300 hover:bg-cream dark:hover:bg-slate-800'
                  }
                `}
              >
                <Avatar
                  name={profile.display_name}
                  src={profile.avatar_url}
                  size="sm"
                />
                <div className="flex-1 text-left">
                  <span className="font-medium font-heading text-sm">
                    {profile.display_name}
                  </span>
                  {profile.role && (
                    <span className="text-navy/30 dark:text-slate-500 text-xs ml-2 font-body">
                      {profile.role}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {showDropdown && filteredProfiles.length === 0 && dropdownFilter.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-dark-surface rounded-xl border border-cream-dark dark:border-slate-700 shadow-lg dark:shadow-none z-[60] p-3 text-sm text-navy/40 dark:text-slate-400 text-center font-body">
            No users found
          </div>
        )}
      </div>

      {content.trim() && (
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-navy/30 dark:text-slate-500 font-body">
            {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter to submit
          </span>
          <Button size="sm" onClick={handleSubmit} loading={loading}>
            Submit
          </Button>
        </div>
      )}
    </div>
  );
}
