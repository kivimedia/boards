'use client';

import { useRef, useEffect } from 'react';

const REACTION_EMOJIS = ['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F389}', '\u{1F680}', '\u{1F440}', '\u{1F4AF}'];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="bg-white dark:bg-dark-surface shadow-modal rounded-xl p-2 flex gap-1"
    >
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className="hover:bg-cream-dark dark:hover:bg-slate-800 rounded-lg p-1.5 text-lg transition-colors"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
