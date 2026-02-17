import { describe, it, expect } from 'vitest';

/**
 * Scout Pipeline UI component utility tests.
 *
 * Tests the inline constants, config objects, color mappings, and pure logic
 * from the 5 new scout pipeline UI components:
 *   - TierBadge.tsx: TIER_CONFIG, compact/full rendering logic
 *   - QualityScoreBar.tsx: DIMENSION_LABELS, getScoreColor, getDimensionColor
 *   - DossierViewer.tsx: CONFIDENCE_DOT, VERIFICATION_BADGE
 *   - OutreachEmailPanel.tsx: SEND_STATUS_COLORS, DEFAULT_CONFIG
 *   - CostDashboard.tsx: SERVICE_COLORS, SERVICE_LABELS
 *
 * Follows the project pattern (gantt-utils.test.ts, team-presence-utils.test.ts)
 * of replicating inline functions for testability.
 */

// ============================================================================
// Replicated from TierBadge.tsx
// ============================================================================

type PGAQualityTier = 'hot' | 'warm' | 'cold';

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

function getTierTitle(tier: PGAQualityTier, score?: number): string {
  if (score != null) return `Quality: ${score}/10 (${tier})`;
  return `Tier: ${tier}`;
}

// ============================================================================
// Replicated from QualityScoreBar.tsx
// ============================================================================

const DIMENSION_LABELS: Record<string, string> = {
  revenue_magnitude: 'Revenue',
  proof_strength: 'Proof',
  reachability: 'Reachable',
  vibe_coding_fit: 'Fit',
  content_richness: 'Content',
};

function getScoreColor(score: number): string {
  if (score >= 7) return 'bg-red-500';
  if (score >= 4) return 'bg-orange-500';
  return 'bg-blue-500';
}

function getDimensionColor(value: number): string {
  if (value >= 2) return 'bg-green-500';
  if (value >= 1) return 'bg-yellow-500';
  return 'bg-red-400';
}

function getScoreWidth(score: number): number {
  return Math.min(score * 10, 100);
}

// ============================================================================
// Replicated from DossierViewer.tsx
// ============================================================================

const CONFIDENCE_DOT: Record<string, string> = {
  high: 'bg-green-500',
  medium: 'bg-yellow-500',
  low: 'bg-red-400',
};

const VERIFICATION_BADGE: Record<string, { classes: string; label: string }> = {
  verified: {
    classes: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    label: 'Verified',
  },
  unverified: {
    classes: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300',
    label: 'Unverified',
  },
  stale: {
    classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    label: 'Stale',
  },
  risky: {
    classes: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    label: 'Risky',
  },
};

// ============================================================================
// Replicated from OutreachEmailPanel.tsx
// ============================================================================

const SEND_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300',
  approved: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  sent: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  bounced: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  replied: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  unsubscribed: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-400',
};

interface OutreachConfig {
  sender_name: string;
  sender_title: string;
  podcast_name: string;
  booking_url: string;
  reply_to_email: string;
}

const DEFAULT_CONFIG: OutreachConfig = {
  sender_name: '',
  sender_title: '',
  podcast_name: '',
  booking_url: '',
  reply_to_email: '',
};

function isConfigValid(config: OutreachConfig): boolean {
  return !!(config.sender_name && config.podcast_name && config.booking_url && config.reply_to_email);
}

// ============================================================================
// Replicated from CostDashboard.tsx
// ============================================================================

const SERVICE_COLORS: Record<string, string> = {
  hunter: 'bg-orange-500',
  snov: 'bg-blue-500',
  anthropic: 'bg-purple-500',
  resend: 'bg-green-500',
};

const SERVICE_LABELS: Record<string, string> = {
  hunter: 'Hunter.io',
  snov: 'Snov.io',
  anthropic: 'Anthropic AI',
  resend: 'Resend',
};

function getTimeSince(range: '7d' | '30d' | 'all'): string | null {
  if (range === 'all') return null;
  const days = range === '7d' ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// ============================================================================
// TESTS
// ============================================================================

describe('Scout Pipeline UI Components', () => {
  // --------------------------------------------------------------------------
  // TierBadge
  // --------------------------------------------------------------------------
  describe('TierBadge - TIER_CONFIG', () => {
    it('has exactly 3 tiers: hot, warm, cold', () => {
      const tiers = Object.keys(TIER_CONFIG);
      expect(tiers).toHaveLength(3);
      expect(tiers).toContain('hot');
      expect(tiers).toContain('warm');
      expect(tiers).toContain('cold');
    });

    it('hot tier has red classes', () => {
      expect(TIER_CONFIG.hot.classes).toContain('red');
      expect(TIER_CONFIG.hot.label).toBe('Hot');
    });

    it('warm tier has orange classes', () => {
      expect(TIER_CONFIG.warm.classes).toContain('orange');
      expect(TIER_CONFIG.warm.label).toBe('Warm');
    });

    it('cold tier has blue classes', () => {
      expect(TIER_CONFIG.cold.classes).toContain('blue');
      expect(TIER_CONFIG.cold.label).toBe('Cold');
    });

    it('all tiers have emoji, label, and classes', () => {
      for (const [, config] of Object.entries(TIER_CONFIG)) {
        expect(config.emoji.length).toBeGreaterThan(0);
        expect(config.label.length).toBeGreaterThan(0);
        expect(config.classes.length).toBeGreaterThan(0);
        expect(config.classes).toContain('dark:');
      }
    });

    it('all tiers have ring classes for border styling', () => {
      for (const [, config] of Object.entries(TIER_CONFIG)) {
        expect(config.classes).toContain('ring-');
      }
    });
  });

  describe('TierBadge - getTierTitle', () => {
    it('includes score when provided', () => {
      expect(getTierTitle('hot', 9)).toBe('Quality: 9/10 (hot)');
      expect(getTierTitle('warm', 5)).toBe('Quality: 5/10 (warm)');
      expect(getTierTitle('cold', 2)).toBe('Quality: 2/10 (cold)');
    });

    it('shows tier only when no score', () => {
      expect(getTierTitle('hot')).toBe('Tier: hot');
      expect(getTierTitle('cold')).toBe('Tier: cold');
    });

    it('handles score of 0', () => {
      expect(getTierTitle('cold', 0)).toBe('Quality: 0/10 (cold)');
    });

    it('handles score of 10', () => {
      expect(getTierTitle('hot', 10)).toBe('Quality: 10/10 (hot)');
    });
  });

  // --------------------------------------------------------------------------
  // QualityScoreBar
  // --------------------------------------------------------------------------
  describe('QualityScoreBar - DIMENSION_LABELS', () => {
    it('has exactly 5 dimensions', () => {
      expect(Object.keys(DIMENSION_LABELS)).toHaveLength(5);
    });

    it('contains all scoring dimensions', () => {
      expect(DIMENSION_LABELS.revenue_magnitude).toBe('Revenue');
      expect(DIMENSION_LABELS.proof_strength).toBe('Proof');
      expect(DIMENSION_LABELS.reachability).toBe('Reachable');
      expect(DIMENSION_LABELS.vibe_coding_fit).toBe('Fit');
      expect(DIMENSION_LABELS.content_richness).toBe('Content');
    });

    it('all labels are short display strings', () => {
      for (const label of Object.values(DIMENSION_LABELS)) {
        expect(label.length).toBeLessThanOrEqual(10);
        expect(label.length).toBeGreaterThan(0);
      }
    });
  });

  describe('QualityScoreBar - getScoreColor', () => {
    it('returns red for hot scores (7-10)', () => {
      expect(getScoreColor(7)).toBe('bg-red-500');
      expect(getScoreColor(8)).toBe('bg-red-500');
      expect(getScoreColor(9)).toBe('bg-red-500');
      expect(getScoreColor(10)).toBe('bg-red-500');
    });

    it('returns orange for warm scores (4-6)', () => {
      expect(getScoreColor(4)).toBe('bg-orange-500');
      expect(getScoreColor(5)).toBe('bg-orange-500');
      expect(getScoreColor(6)).toBe('bg-orange-500');
    });

    it('returns blue for cold scores (0-3)', () => {
      expect(getScoreColor(0)).toBe('bg-blue-500');
      expect(getScoreColor(1)).toBe('bg-blue-500');
      expect(getScoreColor(2)).toBe('bg-blue-500');
      expect(getScoreColor(3)).toBe('bg-blue-500');
    });

    it('boundary: 7 is red (hot threshold)', () => {
      expect(getScoreColor(7)).toContain('red');
      expect(getScoreColor(6)).toContain('orange');
    });

    it('boundary: 4 is orange (warm threshold)', () => {
      expect(getScoreColor(4)).toContain('orange');
      expect(getScoreColor(3)).toContain('blue');
    });
  });

  describe('QualityScoreBar - getDimensionColor', () => {
    it('returns green for max dimension (2)', () => {
      expect(getDimensionColor(2)).toBe('bg-green-500');
    });

    it('returns yellow for mid dimension (1)', () => {
      expect(getDimensionColor(1)).toBe('bg-yellow-500');
    });

    it('returns red for zero dimension (0)', () => {
      expect(getDimensionColor(0)).toBe('bg-red-400');
    });

    it('handles edge case: value above 2', () => {
      expect(getDimensionColor(3)).toBe('bg-green-500');
    });
  });

  describe('QualityScoreBar - getScoreWidth', () => {
    it('maps score to percentage (score * 10)', () => {
      expect(getScoreWidth(0)).toBe(0);
      expect(getScoreWidth(5)).toBe(50);
      expect(getScoreWidth(10)).toBe(100);
    });

    it('caps at 100%', () => {
      expect(getScoreWidth(11)).toBe(100);
      expect(getScoreWidth(15)).toBe(100);
    });

    it('handles fractional scores', () => {
      expect(getScoreWidth(3.5)).toBe(35);
      expect(getScoreWidth(7.8)).toBe(78);
    });
  });

  // --------------------------------------------------------------------------
  // DossierViewer
  // --------------------------------------------------------------------------
  describe('DossierViewer - CONFIDENCE_DOT', () => {
    it('has 3 confidence levels', () => {
      expect(Object.keys(CONFIDENCE_DOT)).toHaveLength(3);
    });

    it('high confidence is green', () => {
      expect(CONFIDENCE_DOT.high).toContain('green');
    });

    it('medium confidence is yellow', () => {
      expect(CONFIDENCE_DOT.medium).toContain('yellow');
    });

    it('low confidence is red', () => {
      expect(CONFIDENCE_DOT.low).toContain('red');
    });

    it('all values are valid Tailwind bg classes', () => {
      for (const cls of Object.values(CONFIDENCE_DOT)) {
        expect(cls).toMatch(/^bg-/);
      }
    });
  });

  describe('DossierViewer - VERIFICATION_BADGE', () => {
    it('has 4 verification statuses', () => {
      expect(Object.keys(VERIFICATION_BADGE)).toHaveLength(4);
    });

    it('verified has green classes and correct label', () => {
      expect(VERIFICATION_BADGE.verified.classes).toContain('green');
      expect(VERIFICATION_BADGE.verified.label).toBe('Verified');
    });

    it('unverified has gray classes and correct label', () => {
      expect(VERIFICATION_BADGE.unverified.classes).toContain('gray');
      expect(VERIFICATION_BADGE.unverified.label).toBe('Unverified');
    });

    it('stale has amber classes and correct label', () => {
      expect(VERIFICATION_BADGE.stale.classes).toContain('amber');
      expect(VERIFICATION_BADGE.stale.label).toBe('Stale');
    });

    it('risky has red classes and correct label', () => {
      expect(VERIFICATION_BADGE.risky.classes).toContain('red');
      expect(VERIFICATION_BADGE.risky.label).toBe('Risky');
    });

    it('all badges have dark mode classes', () => {
      for (const badge of Object.values(VERIFICATION_BADGE)) {
        expect(badge.classes).toContain('dark:');
      }
    });

    it('all labels are capitalized single words', () => {
      for (const badge of Object.values(VERIFICATION_BADGE)) {
        expect(badge.label).toMatch(/^[A-Z][a-z]+$/);
      }
    });
  });

  // --------------------------------------------------------------------------
  // OutreachEmailPanel
  // --------------------------------------------------------------------------
  describe('OutreachEmailPanel - SEND_STATUS_COLORS', () => {
    it('has 6 send statuses', () => {
      expect(Object.keys(SEND_STATUS_COLORS)).toHaveLength(6);
    });

    it('covers all outreach send statuses', () => {
      const statuses = Object.keys(SEND_STATUS_COLORS);
      expect(statuses).toContain('draft');
      expect(statuses).toContain('approved');
      expect(statuses).toContain('sent');
      expect(statuses).toContain('bounced');
      expect(statuses).toContain('replied');
      expect(statuses).toContain('unsubscribed');
    });

    it('draft is gray', () => {
      expect(SEND_STATUS_COLORS.draft).toContain('gray');
    });

    it('approved is blue', () => {
      expect(SEND_STATUS_COLORS.approved).toContain('blue');
    });

    it('sent is green', () => {
      expect(SEND_STATUS_COLORS.sent).toContain('green');
    });

    it('bounced is red', () => {
      expect(SEND_STATUS_COLORS.bounced).toContain('red');
    });

    it('replied is amber', () => {
      expect(SEND_STATUS_COLORS.replied).toContain('amber');
    });

    it('unsubscribed is slate', () => {
      expect(SEND_STATUS_COLORS.unsubscribed).toContain('slate');
    });

    it('all statuses have dark mode variants', () => {
      for (const classes of Object.values(SEND_STATUS_COLORS)) {
        expect(classes).toContain('dark:');
      }
    });
  });

  describe('OutreachEmailPanel - DEFAULT_CONFIG', () => {
    it('has all 5 required fields', () => {
      expect(DEFAULT_CONFIG).toHaveProperty('sender_name');
      expect(DEFAULT_CONFIG).toHaveProperty('sender_title');
      expect(DEFAULT_CONFIG).toHaveProperty('podcast_name');
      expect(DEFAULT_CONFIG).toHaveProperty('booking_url');
      expect(DEFAULT_CONFIG).toHaveProperty('reply_to_email');
    });

    it('all fields default to empty strings', () => {
      for (const val of Object.values(DEFAULT_CONFIG)) {
        expect(val).toBe('');
      }
    });
  });

  describe('OutreachEmailPanel - isConfigValid', () => {
    it('returns false for default empty config', () => {
      expect(isConfigValid(DEFAULT_CONFIG)).toBe(false);
    });

    it('returns false if sender_name is missing', () => {
      expect(isConfigValid({
        sender_name: '',
        sender_title: 'Host',
        podcast_name: 'My Pod',
        booking_url: 'https://cal.com/me',
        reply_to_email: 'me@test.com',
      })).toBe(false);
    });

    it('returns false if podcast_name is missing', () => {
      expect(isConfigValid({
        sender_name: 'Jane',
        sender_title: 'Host',
        podcast_name: '',
        booking_url: 'https://cal.com/me',
        reply_to_email: 'me@test.com',
      })).toBe(false);
    });

    it('returns false if booking_url is missing', () => {
      expect(isConfigValid({
        sender_name: 'Jane',
        sender_title: 'Host',
        podcast_name: 'My Pod',
        booking_url: '',
        reply_to_email: 'me@test.com',
      })).toBe(false);
    });

    it('returns false if reply_to_email is missing', () => {
      expect(isConfigValid({
        sender_name: 'Jane',
        sender_title: 'Host',
        podcast_name: 'My Pod',
        booking_url: 'https://cal.com/me',
        reply_to_email: '',
      })).toBe(false);
    });

    it('returns true when all required fields are filled', () => {
      expect(isConfigValid({
        sender_name: 'Jane Doe',
        sender_title: 'Host',
        podcast_name: 'AI Builders Pod',
        booking_url: 'https://cal.com/jane',
        reply_to_email: 'jane@pod.com',
      })).toBe(true);
    });

    it('sender_title is optional (not checked)', () => {
      expect(isConfigValid({
        sender_name: 'Jane',
        sender_title: '',
        podcast_name: 'My Pod',
        booking_url: 'https://cal.com/me',
        reply_to_email: 'me@test.com',
      })).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // CostDashboard
  // --------------------------------------------------------------------------
  describe('CostDashboard - SERVICE_COLORS', () => {
    it('has 4 services', () => {
      expect(Object.keys(SERVICE_COLORS)).toHaveLength(4);
    });

    it('covers hunter, snov, anthropic, resend', () => {
      expect(SERVICE_COLORS).toHaveProperty('hunter');
      expect(SERVICE_COLORS).toHaveProperty('snov');
      expect(SERVICE_COLORS).toHaveProperty('anthropic');
      expect(SERVICE_COLORS).toHaveProperty('resend');
    });

    it('hunter is orange', () => {
      expect(SERVICE_COLORS.hunter).toContain('orange');
    });

    it('snov is blue', () => {
      expect(SERVICE_COLORS.snov).toContain('blue');
    });

    it('anthropic is purple', () => {
      expect(SERVICE_COLORS.anthropic).toContain('purple');
    });

    it('resend is green', () => {
      expect(SERVICE_COLORS.resend).toContain('green');
    });

    it('all values are valid Tailwind bg classes', () => {
      for (const cls of Object.values(SERVICE_COLORS)) {
        expect(cls).toMatch(/^bg-/);
      }
    });
  });

  describe('CostDashboard - SERVICE_LABELS', () => {
    it('has 4 services', () => {
      expect(Object.keys(SERVICE_LABELS)).toHaveLength(4);
    });

    it('hunter -> Hunter.io', () => {
      expect(SERVICE_LABELS.hunter).toBe('Hunter.io');
    });

    it('snov -> Snov.io', () => {
      expect(SERVICE_LABELS.snov).toBe('Snov.io');
    });

    it('anthropic -> Anthropic AI', () => {
      expect(SERVICE_LABELS.anthropic).toBe('Anthropic AI');
    });

    it('resend -> Resend', () => {
      expect(SERVICE_LABELS.resend).toBe('Resend');
    });

    it('labels and colors have the same keys', () => {
      const colorKeys = Object.keys(SERVICE_COLORS).sort();
      const labelKeys = Object.keys(SERVICE_LABELS).sort();
      expect(colorKeys).toEqual(labelKeys);
    });
  });

  describe('CostDashboard - getTimeSince', () => {
    it('returns null for "all" range', () => {
      expect(getTimeSince('all')).toBeNull();
    });

    it('returns ISO date string for "7d"', () => {
      const result = getTimeSince('7d');
      expect(result).not.toBeNull();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      // Should be roughly 7 days ago
      const d = new Date(result!);
      const diff = Date.now() - d.getTime();
      const days = diff / (1000 * 60 * 60 * 24);
      expect(days).toBeCloseTo(7, 0);
    });

    it('returns ISO date string for "30d"', () => {
      const result = getTimeSince('30d');
      expect(result).not.toBeNull();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      const d = new Date(result!);
      const diff = Date.now() - d.getTime();
      const days = diff / (1000 * 60 * 60 * 24);
      expect(days).toBeCloseTo(30, 0);
    });

    it('30d returns a date earlier than 7d', () => {
      const sevenDays = new Date(getTimeSince('7d')!).getTime();
      const thirtyDays = new Date(getTimeSince('30d')!).getTime();
      expect(thirtyDays).toBeLessThan(sevenDays);
    });
  });

  // --------------------------------------------------------------------------
  // Cross-component consistency
  // --------------------------------------------------------------------------
  describe('Cross-component consistency', () => {
    it('tier colors match score color mapping (hot=red, warm=orange, cold=blue)', () => {
      // Hot tier (score 7-10) -> red in both TIER_CONFIG and getScoreColor
      expect(TIER_CONFIG.hot.classes).toContain('red');
      expect(getScoreColor(7)).toContain('red');

      // Warm tier (score 4-6) -> orange
      expect(TIER_CONFIG.warm.classes).toContain('orange');
      expect(getScoreColor(4)).toContain('orange');

      // Cold tier (score 0-3) -> blue
      expect(TIER_CONFIG.cold.classes).toContain('blue');
      expect(getScoreColor(0)).toContain('blue');
    });

    it('confidence dot colors are distinct', () => {
      const colors = Object.values(CONFIDENCE_DOT);
      const unique = new Set(colors);
      expect(unique.size).toBe(colors.length);
    });

    it('all color maps use standard Tailwind color names', () => {
      const validColors = ['red', 'orange', 'amber', 'yellow', 'green', 'blue', 'purple', 'gray', 'slate'];
      const allColorValues = [
        ...Object.values(CONFIDENCE_DOT),
        ...Object.values(SERVICE_COLORS),
      ];
      for (const cls of allColorValues) {
        const hasValidColor = validColors.some((c) => cls.includes(c));
        expect(hasValidColor).toBe(true);
      }
    });

    it('tier config keys match PGAQualityTier type values', () => {
      const tierKeys = Object.keys(TIER_CONFIG);
      expect(tierKeys).toEqual(['hot', 'warm', 'cold']);
    });
  });
});
