'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';

interface UseMentionDropdownOptions {
  value: string;
  onChange: (value: string) => void;
}

export interface MentionDropdownState {
  profiles: Profile[];
  filteredProfiles: Profile[];
  showDropdown: boolean;
  dropdownFilter: string;
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  handleInput: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean; // returns true if handled
  selectProfile: (profile: Profile) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}

export function useMentionDropdown({ value, onChange }: UseMentionDropdownOptions): MentionDropdownState {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownFilter, setDropdownFilter] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const supabase = createClient();

  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const res = await fetch('/api/mentions');
        if (res.ok) {
          const json = await res.json();
          setProfiles(
            (json.data || json)
              .filter((p: any) => p.display_name)
              .sort((a: Profile, b: Profile) => (a.display_name || '').localeCompare(b.display_name || ''))
          );
          return;
        }
      } catch { /* fall through */ }
      const { data } = await supabase.from('profiles').select('*').order('display_name');
      setProfiles(data || []);
    };
    fetchProfiles();
  }, []);

  const filteredProfiles = profiles.filter((p) =>
    p.display_name.toLowerCase().includes(dropdownFilter.toLowerCase())
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    onChange(newValue);

    const textBeforeCursor = newValue.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex !== -1) {
      const charBeforeAt = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' ';
      const textAfterAt = textBeforeCursor.slice(atIndex + 1);
      if ((atIndex === 0 || charBeforeAt === ' ' || charBeforeAt === '\n') && !textAfterAt.includes(' ')) {
        setMentionStartIndex(atIndex);
        setDropdownFilter(textAfterAt);
        setShowDropdown(true);
        setSelectedIndex(0);
        return;
      }
    }
    setShowDropdown(false);
    setMentionStartIndex(null);
  }, [onChange]);

  const selectProfile = useCallback((profile: Profile) => {
    if (mentionStartIndex === null || !textareaRef.current) return;
    const ta = textareaRef.current;
    const before = value.slice(0, mentionStartIndex);
    const cursorPos = ta.selectionStart || value.length;
    const after = value.slice(cursorPos);
    const mentionText = `@${profile.display_name}`;
    const newContent = `${before}${mentionText} ${after}`;
    onChange(newContent);
    setShowDropdown(false);
    setMentionStartIndex(null);
    setDropdownFilter('');
    const newCursor = before.length + mentionText.length + 1;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newCursor, newCursor);
    });
  }, [value, mentionStartIndex, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!showDropdown || filteredProfiles.length === 0) return false;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (i < filteredProfiles.length - 1 ? i + 1 : 0));
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => (i > 0 ? i - 1 : filteredProfiles.length - 1));
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      selectProfile(filteredProfiles[selectedIndex]);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setShowDropdown(false);
      return true;
    }
    return false;
  }, [showDropdown, filteredProfiles, selectedIndex, selectProfile]);

  return {
    profiles,
    filteredProfiles,
    showDropdown,
    dropdownFilter,
    selectedIndex,
    setSelectedIndex,
    handleInput,
    handleKeyDown,
    selectProfile,
    textareaRef,
  };
}
