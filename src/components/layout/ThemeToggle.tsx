'use client';

import { useTheme, Theme } from '@/hooks/useTheme';

const THEME_OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'dark', label: 'Dark', icon: '🌙' },
  { value: 'system', label: 'System', icon: '💻' },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-0.5 bg-cream-dark dark:bg-white/10 rounded-lg p-0.5">
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => setTheme(option.value)}
          className={`
            px-2 py-1 rounded-md text-xs font-medium transition-all
            ${theme === option.value
              ? 'bg-white dark:bg-white/20 text-navy dark:text-white shadow-sm'
              : 'text-navy/40 dark:text-white/40 hover:text-navy/60 dark:hover:text-white/60'
            }
          `}
          title={option.label}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}
