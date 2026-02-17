'use client';

import { useAuth } from '@/hooks/useAuth';
import NotificationCenter from '@/components/notifications/NotificationCenter';
import ThemeToggle from './ThemeToggle';

interface HeaderProps {
  title?: string;
  children?: React.ReactNode;
}

export default function Header({ title, children }: HeaderProps) {
  const { profile } = useAuth();

  return (
    <header className="h-14 bg-cream/80 dark:bg-navy-light/80 backdrop-blur-md border-b border-cream-dark dark:border-slate-700 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4">
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
