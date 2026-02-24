'use client';

import type { PGAQualityTier } from '@/lib/types';

const TIER_CONFIG: Record<PGAQualityTier, { label: string; emoji: string; classes: string }> = {
  hot: {
    label: 'Hot',
    emoji: '\u{1F525}',
    classes: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 ring-red-200 dark:ring-red-800/50',
  },
  warm: {
    label: 'Warm',
    emoji: '\u{2600}\u{FE0F}',
    classes: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 ring-orange-200 dark:ring-orange-800/50',
  },
  cold: {
    label: 'Cold',
    emoji: '\u{2744}\u{FE0F}',
    classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 ring-blue-200 dark:ring-blue-800/50',
  },
};

interface TierBadgeProps {
  tier: PGAQualityTier;
  score?: number;
  compact?: boolean;
}

export default function TierBadge({ tier, score, compact }: TierBadgeProps) {
  const config = TIER_CONFIG[tier] || TIER_CONFIG.cold;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-0.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ring-1 ${config.classes}`}
        title={score != null ? `Quality: ${score}/10 (${tier})` : `Tier: ${tier}`}
      >
        {config.emoji} {config.label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ring-1 ${config.classes}`}
    >
      {config.emoji} {config.label}
      {score != null && (
        <span className="font-bold">{score}/10</span>
      )}
    </span>
  );
}
