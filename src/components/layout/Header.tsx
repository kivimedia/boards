'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import NotificationCenter from '@/components/notifications/NotificationCenter';
import ThemeToggle from './ThemeToggle';
import { useAppStore } from '@/stores/app-store';

interface HeaderProps {
  title?: string;
  backHref?: string;
  children?: React.ReactNode;
}

export default function Header({ title, backHref, children }: HeaderProps) {
  const { profile } = useAuth();
  const { toggleMobileSidebar } = useAppStore();

  return (
    <header className="h-14 bg-cream/80 dark:bg-navy-light/80 backdrop-blur-md border-b border-cream-dark dark:border-slate-700 flex items-center px-4 sm:px-6 shrink-0 gap-3 sm:gap-4">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0 shrink-0">
        {/* Hamburger — visible only on mobile */}
        <button
          onClick={toggleMobileSidebar}
          className="md:hidden p-2 -ml-1 rounded-lg text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-white hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors shrink-0"
          aria-label="Toggle navigation"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        {backHref && (
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-sm text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-100 transition-colors font-body"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span className="hidden sm:inline">Back</span>
          </Link>
        )}
        {title && (
          <h1 className="text-base sm:text-lg font-semibold text-navy dark:text-white font-heading truncate">
            {title}
          </h1>
        )}
      </div>
      {children && (
        <div className="flex-1 min-w-0">
          {children}
        </div>
      )}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <ThemeToggle />
        <NotificationCenter />
      </div>
    </header>
  );
}
