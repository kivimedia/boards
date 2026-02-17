'use client';

import { MouseEvent, KeyboardEvent } from 'react';

interface CardCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean, event?: MouseEvent | KeyboardEvent) => void;
  className?: string;
}

export default function CardCheckbox({ checked, onChange, className = '' }: CardCheckboxProps) {
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked, e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
          e.preventDefault();
          onChange(!checked, e);
        }
      }}
      className={`
        w-5 h-5 rounded-md border-2 flex items-center justify-center cursor-pointer transition-colors
        ${checked
          ? 'bg-electric border-electric'
          : 'border-cream-dark dark:border-slate-600 hover:border-electric/50'
        }
        ${className}
      `}
    >
      {checked && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
  );
}
