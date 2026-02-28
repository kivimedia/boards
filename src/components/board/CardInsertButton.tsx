'use client';

import { useState, useRef, useEffect } from 'react';

interface CardInsertButtonProps {
  onInsert: (title: string) => void;
}

/**
 * Thin horizontal line with a + button that appears on hover between cards.
 * Clicking it opens an inline title input to create a card at that position.
 */
export default function CardInsertButton({ onInsert }: CardInsertButtonProps) {
  const [isActive, setIsActive] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isActive && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isActive]);

  const handleSubmit = () => {
    if (!title.trim()) {
      setIsActive(false);
      setTitle('');
      return;
    }
    onInsert(title.trim());
    setTitle('');
    setIsActive(false);
  };

  if (isActive) {
    return (
      <div className="py-1">
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Card title..."
          className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-dark-surface border border-electric/40 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 font-body"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') { setIsActive(false); setTitle(''); }
          }}
          onBlur={() => {
            // Small delay so click events on submit can fire
            setTimeout(() => {
              if (!title.trim()) {
                setIsActive(false);
                setTitle('');
              }
            }, 150);
          }}
        />
      </div>
    );
  }

  return (
    <div className="group/insert relative h-2 -my-0.5 flex items-center cursor-pointer" onClick={() => setIsActive(true)}>
      {/* Hover line */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-electric/0 group-hover/insert:bg-electric/50 transition-colors rounded-full" />
      {/* Plus button */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-electric text-white flex items-center justify-center text-xs font-bold opacity-0 group-hover/insert:opacity-100 transition-opacity shadow-sm">
        +
      </div>
    </div>
  );
}
