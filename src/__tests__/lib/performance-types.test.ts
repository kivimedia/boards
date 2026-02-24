import { describe, it, expect } from 'vitest';
import { PK_TRACKER_LABELS, PK_TRACKER_FREQUENCIES, PKTrackerType } from '@/lib/types';

const ALL_TRACKER_TYPES: PKTrackerType[] = [
  'masterlist', 'fathom_videos', 'client_updates', 'ticket_updates',
  'daily_goals', 'sanity_checks', 'sanity_tests', 'pics_monitoring',
  'flagged_tickets', 'weekly_tickets', 'pingdom_tests', 'google_ads_reports',
  'monthly_summaries', 'update_schedule', 'holiday_tracking', 'website_status',
  'google_analytics_status', 'other_activities',
];

describe('Performance Keeping Types', () => {
  describe('PK_TRACKER_LABELS', () => {
    it('has a label for every tracker type', () => {
      for (const type of ALL_TRACKER_TYPES) {
        expect(PK_TRACKER_LABELS[type]).toBeDefined();
        expect(PK_TRACKER_LABELS[type].length).toBeGreaterThan(0);
      }
    });

    it('has 18 tracker types total', () => {
      expect(Object.keys(PK_TRACKER_LABELS)).toHaveLength(18);
    });
  });

  describe('PK_TRACKER_FREQUENCIES', () => {
    it('has a frequency for every tracker type', () => {
      for (const type of ALL_TRACKER_TYPES) {
        expect(PK_TRACKER_FREQUENCIES[type]).toBeDefined();
        expect(PK_TRACKER_FREQUENCIES[type].length).toBeGreaterThan(0);
      }
    });

    it('has valid frequency values', () => {
      const validFreqs = ['Hub', 'Daily', '2x/week', 'Weekly', 'Quarterly', 'Monthly', 'Reference', 'Seasonal'];
      for (const freq of Object.values(PK_TRACKER_FREQUENCIES)) {
        expect(validFreqs).toContain(freq);
      }
    });
  });
});
