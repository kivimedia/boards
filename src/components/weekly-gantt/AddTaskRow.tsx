'use client';

import { useState, useRef } from 'react';

interface AddTaskRowProps {
  onAdd: (title: string) => void;
}

export function AddTaskRow({ onAdd }: AddTaskRowProps) {
  const [active, setActive] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (title.trim()) {
      onAdd(title.trim());
      setTitle('');
    }
    // Keep focus for rapid entry
    inputRef.current?.focus();
  };

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => {
          setActive(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="w-full text-left px-4 py-2.5 text-sm text-navy/30 dark:text-slate-600 hover:text-electric dark:hover:text-electric hover:bg-cream/40 dark:hover:bg-slate-800/20 font-body transition-colors flex items-center gap-2"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add task...
      </button>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(200px,2fr)_100px_repeat(7,1fr)_40px] items-center border-b border-cream-dark/50 dark:border-slate-700/50">
      <div className="flex items-center gap-2 px-4 py-2">
        <div className="w-2 h-2" /> {/* Priority dot placeholder */}
        <div className="w-4.5 h-4.5" /> {/* Checkbox placeholder */}
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') { setActive(false); setTitle(''); }
          }}
          onBlur={() => {
            if (!title.trim()) setActive(false);
          }}
          placeholder="Task name..."
          className="flex-1 text-sm font-body bg-transparent border-b border-electric/30 outline-none text-navy dark:text-slate-100 placeholder:text-navy/20 dark:placeholder:text-slate-600 py-0"
        />
      </div>
      <div className="col-span-9" />
    </div>
  );
}
