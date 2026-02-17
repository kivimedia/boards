'use client';

interface ShareButtonProps {
  onClick: () => void;
  isDark?: boolean;
}

export default function ShareButton({ onClick, isDark }: ShareButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium font-body transition-all
        border
        ${isDark
          ? 'border-white/30 text-white/80 hover:bg-white/10 hover:text-white'
          : 'border-cream-dark dark:border-slate-600 text-navy/60 dark:text-slate-300 hover:bg-cream-dark dark:hover:bg-slate-700 hover:text-navy dark:hover:text-white'
        }
      `}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
      Share
    </button>
  );
}
