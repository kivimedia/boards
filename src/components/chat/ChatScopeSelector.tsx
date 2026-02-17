'use client';

import { useState, useRef, useEffect } from 'react';
import type { ChatScope } from '@/lib/types';

interface ChatScopeSelectorProps {
  scope: ChatScope;
  onScopeChange: (scope: ChatScope) => void;
  cardId?: string;
  boardId?: string;
}

interface ScopeOption {
  value: ChatScope;
  label: string;
  icon: React.ReactNode;
}

export default function ChatScopeSelector({
  scope,
  onScopeChange,
  cardId,
  boardId,
}: ChatScopeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const options: ScopeOption[] = [];

  if (cardId) {
    options.push({
      value: 'ticket',
      label: 'This Ticket',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    });
  }

  if (boardId) {
    options.push({
      value: 'board',
      label: 'This Board',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
      ),
    });
  }

  options.push({
    value: 'all_boards',
    label: 'All Boards',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  });

  const currentOption = options.find((o) => o.value === scope) || options[options.length - 1];

  // If only one option available, render as a static badge
  if (options.length <= 1) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cream-dark dark:bg-slate-800 text-navy/60 dark:text-slate-400 text-xs font-medium font-body">
        {currentOption.icon}
        <span>{currentOption.label}</span>
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="
          inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg
          bg-cream-dark dark:bg-slate-800 text-navy/60 dark:text-slate-400 text-xs font-medium font-body
          hover:bg-cream dark:hover:bg-slate-700 hover:text-navy dark:hover:text-slate-200 transition-all duration-200
        "
      >
        {currentOption.icon}
        <span>{currentOption.label}</span>
        <svg
          className={`w-3 h-3 ml-0.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-44 bg-white dark:bg-dark-surface rounded-xl shadow-lg border border-cream-dark dark:border-slate-700 z-50 overflow-hidden py-1">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onScopeChange(option.value);
                setIsOpen(false);
              }}
              className={`
                w-full text-left px-3 py-2 flex items-center gap-2 text-xs font-body
                transition-colors duration-150
                ${option.value === scope
                  ? 'bg-electric/5 text-electric font-medium'
                  : 'text-navy/60 dark:text-slate-400 hover:bg-cream-dark/50 dark:hover:bg-slate-800/50 hover:text-navy dark:hover:text-slate-200'
                }
              `}
            >
              {option.icon}
              <span>{option.label}</span>
              {option.value === scope && (
                <svg className="w-3.5 h-3.5 ml-auto text-electric" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
