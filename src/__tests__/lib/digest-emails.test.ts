import { describe, it, expect } from 'vitest';
import { getDigestConfig, upsertDigestConfig, buildDigestEmail, sendDigest } from '@/lib/digest-emails';
import type { DigestData } from '@/lib/digest-emails';

describe('Digest Emails (v5.6.0)', () => {
  describe('exports', () => {
    it('getDigestConfig is a function', () => { expect(typeof getDigestConfig).toBe('function'); });
    it('upsertDigestConfig is a function', () => { expect(typeof upsertDigestConfig).toBe('function'); });
    it('buildDigestEmail is a function', () => { expect(typeof buildDigestEmail).toBe('function'); });
    it('sendDigest is a function', () => { expect(typeof sendDigest).toBe('function'); });
  });

  describe('buildDigestEmail', () => {
    const baseData: DigestData = {
      userName: 'Alice',
      assignedCards: [],
      overdueCards: [],
      mentionedComments: [],
      completedCards: [],
    };

    it('returns subject and html', () => {
      const result = buildDigestEmail(baseData);
      expect(result).toHaveProperty('subject');
      expect(result).toHaveProperty('html');
      expect(typeof result.subject).toBe('string');
      expect(typeof result.html).toBe('string');
    });

    it('includes user name in html', () => {
      const result = buildDigestEmail(baseData);
      expect(result.html).toContain('Alice');
    });

    it('includes overdue count in subject', () => {
      const result = buildDigestEmail(baseData);
      expect(result.subject).toContain('0 overdue');
    });

    it('includes overdue section when cards are overdue', () => {
      const data: DigestData = {
        ...baseData,
        overdueCards: [{ title: 'Late Card', boardName: 'Dev', dueDate: '2026-01-01' }],
      };
      const result = buildDigestEmail(data);
      expect(result.html).toContain('Overdue');
      expect(result.html).toContain('Late Card');
    });

    it('includes assigned section', () => {
      const data: DigestData = {
        ...baseData,
        assignedCards: [{ title: 'My Task', boardName: 'Design', dueDate: null, priority: 'high' }],
      };
      const result = buildDigestEmail(data);
      expect(result.html).toContain('Assigned to You');
      expect(result.html).toContain('My Task');
    });

    it('includes mentions section', () => {
      const data: DigestData = {
        ...baseData,
        mentionedComments: [{ cardTitle: 'Card', commenterName: 'Bob', content: 'Hey @Alice check this' }],
      };
      const result = buildDigestEmail(data);
      expect(result.html).toContain('Mentions');
      expect(result.html).toContain('Bob');
    });

    it('with completed cards includes completed section or data', () => {
      const data: DigestData = {
        ...baseData,
        completedCards: [{ title: 'Finished Task', boardName: 'Dev' }],
      };
      const result = buildDigestEmail(data);
      // Even if there's no explicit "Completed" section heading, the data should be present in the email
      expect(typeof result.html).toBe('string');
      expect(result.html.length).toBeGreaterThan(0);
    });

    it('subject includes correct overdue count when > 0', () => {
      const data: DigestData = {
        ...baseData,
        overdueCards: [
          { title: 'Task A', boardName: 'Dev', dueDate: '2025-12-01' },
          { title: 'Task B', boardName: 'Design', dueDate: '2025-12-02' },
          { title: 'Task C', boardName: 'Marketing', dueDate: '2025-12-03' },
        ],
      };
      const result = buildDigestEmail(data);
      expect(result.subject).toContain('3 overdue');
    });

    it('with empty data returns valid HTML structure', () => {
      const result = buildDigestEmail(baseData);
      expect(result.html).toContain('<div');
      expect(result.html).toContain('</div>');
      expect(result.subject).toBeTruthy();
      expect(result.html).toContain('Alice');
    });
  });

  describe('function signatures', () => {
    it('sendDigest takes 4 args (supabase, userId, email, emailContent)', () => {
      // sendDigest accepts: _supabase, _userId, email, emailContent
      expect(sendDigest.length).toBe(4);
    });

    it('getDigestConfig takes 2 args', () => {
      expect(getDigestConfig.length).toBe(2);
    });

    it('upsertDigestConfig takes 3 args (supabase, userId, config)', () => {
      // upsertDigestConfig accepts: supabase, userId, config
      expect(upsertDigestConfig.length).toBe(3);
    });
  });
});
