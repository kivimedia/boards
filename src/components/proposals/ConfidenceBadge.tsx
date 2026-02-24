'use client';

interface Props {
  tier: 'no_brainer' | 'suggested' | 'needs_human';
  size?: 'sm' | 'md';
}

const TIER_CONFIG = {
  no_brainer: {
    label: 'No-Brainer',
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-700 dark:text-green-300',
    dot: 'bg-green-500',
  },
  suggested: {
    label: 'Suggested',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  needs_human: {
    label: 'Needs Human',
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-300',
    dot: 'bg-red-500',
  },
};

export default function ConfidenceBadge({ tier, size = 'sm' }: Props) {
  const config = TIER_CONFIG[tier];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${config.bg} ${config.text} ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
