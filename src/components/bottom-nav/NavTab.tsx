'use client';

import { ReactNode } from 'react';

interface NavTabProps {
  icon: ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

export default function NavTab({ icon, label, isActive, onClick }: NavTabProps) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium font-body transition-all duration-200
        ${isActive
          ? 'bg-electric text-white shadow-md shadow-electric/25'
          : 'text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-white hover:bg-cream-dark/60 dark:hover:bg-slate-700/60'
        }
      `}
    >
      <span className="w-5 h-5 flex items-center justify-center">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
