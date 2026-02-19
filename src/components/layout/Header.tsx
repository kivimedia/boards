'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import NotificationCenter from '@/components/notifications/NotificationCenter';
import ThemeToggle from './ThemeToggle';

interface HeaderProps {
  title?: string;
  backHref?: string;
  children?: React.ReactNode;
}

export default function Header({ title, backHref, children }: HeaderProps) {
  const { profile } = useAuth();

  return (
    <header className="h-14 bg-cream/80 dark:bg-navy-light/80 backdrop-blur-md border-b border-cream-dark dark:border-slate-700 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4">
        {backHref && (
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-sm text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-100 transition-colors font-body"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </Link>
        )}
        {title && (
          <h1 className="text-lg font-semibold text-navy dark:text-white font-heading">
            {title}
          </h1>
        )}
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <NotificationCenter />
        {children}
      </div>
    </header>
  );
}
