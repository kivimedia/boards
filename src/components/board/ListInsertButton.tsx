'use client';

import { useState, useRef, useEffect } from 'react';

interface ListInsertButtonProps {
  onInsert: (name: string) => void;
}

/**
 * Vertical line with a + button that appears on hover between lists.
 * Clicking it opens an inline name input to create a list at that position.
 */
export default function ListInsertButton({ onInsert }: ListInsertButtonProps) {
  const [isActive, setIsActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    if (isActive && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isActive]);

  const handleSubmit = () => {
    if (!name.trim()) {
      setIsActive(false);
      setName('');
      return;
    }
    onInsert(name.trim());
    setName('');
    setIsActive(false);
  };

  if (isActive) {
    return (
      <div className="shrink-0 w-72 bg-cream-dark/50 dark:bg-slate-800/50 rounded-2xl p-3">
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter list name..."
          className="w-full p-2.5 rounded-xl bg-white dark:bg-dark-surface border border-electric/40 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 font-body"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') { setIsActive(false); setName(''); }
          }}
          onBlur={() => {
            setTimeout(() => {
              if (!name.trim()) {
                setIsActive(false);
                setName('');
              }
            }, 150);
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="group/listinsert shrink-0 relative w-3 self-stretch flex items-center justify-center cursor-pointer -mx-0.5"
      onClick={() => setIsActive(true)}
    >
      {/* Hover line */}
      <div className="absolute inset-y-4 left-1/2 -translate-x-1/2 w-0.5 bg-electric/0 group-hover/listinsert:bg-electric/50 transition-colors rounded-full" />
      {/* Plus button */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-electric text-white flex items-center justify-center text-xs font-bold opacity-0 group-hover/listinsert:opacity-100 transition-opacity shadow-md z-10">
        +
      </div>
    </div>
  );
}
