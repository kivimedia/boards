import { describe, it, expect } from 'vitest';
import {
  calculateCompleteness,
  BOARD_TYPES_WITH_BRIEFS,
  getBriefedListName,
} from '@/lib/briefing';
import type { BriefingTemplateField } from '@/lib/types';

function makeField(
  overrides: Partial<BriefingTemplateField> & { key: string; label: string }
): BriefingTemplateField {
  return {
    type: 'text',
    required: false,
    ...overrides,
  };
}

describe('briefing', () => {
  describe('calculateCompleteness', () => {
    it('returns 100% and isComplete for empty fields array', () => {
      const result = calculateCompleteness({}, []);
      expect(result.score).toBe(100);
      expect(result.isComplete).toBe(true);
      expect(result.missingRequired).toEqual([]);
    });

    it('returns 0% when no fields are filled', () => {
      const fields: BriefingTemplateField[] = [
        makeField({ key: 'name', label: 'Name', required: true }),
        makeField({ key: 'desc', label: 'Description', required: false }),
      ];
      const result = calculateCompleteness({}, fields);
      expect(result.score).toBe(0);
      expect(result.isComplete).toBe(false);
      expect(result.missingRequired).toContain('Name');
    });

    it('returns 100% when all fields are filled', () => {
      const fields: BriefingTemplateField[] = [
        makeField({ key: 'name', label: 'Name', required: true }),
        makeField({ key: 'desc', label: 'Description', required: false }),
      ];
      const result = calculateCompleteness(
        { name: 'My Project', desc: 'A description' },
        fields
      );
      expect(result.score).toBe(100);
      expect(result.isComplete).toBe(true);
      expect(result.missingRequired).toEqual([]);
    });

    it('returns 50% when half the fields are filled', () => {
      const fields: BriefingTemplateField[] = [
        makeField({ key: 'a', label: 'A', required: true }),
        makeField({ key: 'b', label: 'B', required: true }),
      ];
      const result = calculateCompleteness({ a: 'filled' }, fields);
      expect(result.score).toBe(50);
      expect(result.isComplete).toBe(false);
      expect(result.missingRequired).toContain('B');
    });

    it('is incomplete when required fields are missing even if optional fields are filled', () => {
      const fields: BriefingTemplateField[] = [
        makeField({ key: 'req', label: 'Required', required: true }),
        makeField({ key: 'opt', label: 'Optional', required: false }),
      ];
      const result = calculateCompleteness({ opt: 'value' }, fields);
      expect(result.score).toBe(50);
      expect(result.isComplete).toBe(false);
      expect(result.missingRequired).toEqual(['Required']);
    });

    it('is complete when all required fields filled but optional missing', () => {
      const fields: BriefingTemplateField[] = [
        makeField({ key: 'req', label: 'Required', required: true }),
        makeField({ key: 'opt', label: 'Optional', required: false }),
      ];
      const result = calculateCompleteness({ req: 'value' }, fields);
      expect(result.score).toBe(50);
      expect(result.isComplete).toBe(true);
      expect(result.missingRequired).toEqual([]);
    });

    describe('field type validation', () => {
      it('text: empty string is not filled', () => {
        const fields = [makeField({ key: 'a', label: 'A', type: 'text', required: true })];
        const result = calculateCompleteness({ a: '' }, fields);
        expect(result.score).toBe(0);
        expect(result.isComplete).toBe(false);
      });

      it('text: whitespace-only string is not filled', () => {
        const fields = [makeField({ key: 'a', label: 'A', type: 'text', required: true })];
        const result = calculateCompleteness({ a: '   ' }, fields);
        expect(result.score).toBe(0);
      });

      it('textarea: works like text', () => {
        const fields = [makeField({ key: 'a', label: 'A', type: 'textarea', required: true })];
        expect(calculateCompleteness({ a: 'content' }, fields).score).toBe(100);
        expect(calculateCompleteness({ a: '' }, fields).score).toBe(0);
      });

      it('number: numeric value is filled', () => {
        const fields = [makeField({ key: 'a', label: 'A', type: 'number', required: true })];
        expect(calculateCompleteness({ a: 42 }, fields).score).toBe(100);
      });

      it('number: numeric string is filled', () => {
        const fields = [makeField({ key: 'a', label: 'A', type: 'number', required: true })];
        expect(calculateCompleteness({ a: '42' }, fields).score).toBe(100);
      });

      it('number: non-numeric string is not filled', () => {
        const fields = [makeField({ key: 'a', label: 'A', type: 'number', required: true })];
        expect(calculateCompleteness({ a: 'abc' }, fields).score).toBe(0);
      });

      it('date: ISO string is filled', () => {
        const fields = [makeField({ key: 'a', label: 'A', type: 'date', required: true })];
        expect(calculateCompleteness({ a: '2025-01-01' }, fields).score).toBe(100);
      });

      it('dropdown: selected value is filled', () => {
        const fields = [
          makeField({
            key: 'a',
            label: 'A',
            type: 'dropdown',
            options: ['X', 'Y'],
            required: true,
          }),
        ];
        expect(calculateCompleteness({ a: 'X' }, fields).score).toBe(100);
      });

      it('url: URL string is filled', () => {
        const fields = [makeField({ key: 'a', label: 'A', type: 'url', required: true })];
        expect(calculateCompleteness({ a: 'https://example.com' }, fields).score).toBe(100);
      });

      it('checkbox: boolean value is filled', () => {
        const fields = [makeField({ key: 'a', label: 'A', type: 'checkbox', required: true })];
        expect(calculateCompleteness({ a: true }, fields).score).toBe(100);
        expect(calculateCompleteness({ a: false }, fields).score).toBe(100);
      });

      it('checkbox: non-boolean is not filled', () => {
        const fields = [makeField({ key: 'a', label: 'A', type: 'checkbox', required: true })];
        expect(calculateCompleteness({ a: 'yes' }, fields).score).toBe(0);
      });

      it('url_list: string value is filled', () => {
        const fields = [makeField({ key: 'a', label: 'A', type: 'url_list', required: true })];
        expect(calculateCompleteness({ a: 'https://a.com\nhttps://b.com' }, fields).score).toBe(100);
      });

      it('url_list: array value is filled', () => {
        const fields = [makeField({ key: 'a', label: 'A', type: 'url_list', required: true })];
        expect(calculateCompleteness({ a: ['https://a.com'] }, fields).score).toBe(100);
      });

      it('url_list: empty array is not filled', () => {
        const fields = [makeField({ key: 'a', label: 'A', type: 'url_list', required: true })];
        expect(calculateCompleteness({ a: [] }, fields).score).toBe(0);
      });

      it('null values are never filled', () => {
        const fields = [makeField({ key: 'a', label: 'A', type: 'text', required: true })];
        expect(calculateCompleteness({ a: null }, fields).score).toBe(0);
      });

      it('undefined values are never filled', () => {
        const fields = [makeField({ key: 'a', label: 'A', type: 'text', required: true })];
        expect(calculateCompleteness({ a: undefined }, fields).score).toBe(0);
      });
    });

    describe('complex brief scenarios', () => {
      it('design brief template with partial fill', () => {
        const fields: BriefingTemplateField[] = [
          makeField({ key: 'project_name', label: 'Project Name', type: 'text', required: true }),
          makeField({ key: 'target_audience', label: 'Target Audience', type: 'textarea', required: true }),
          makeField({ key: 'dimensions', label: 'Dimensions', type: 'text', required: true }),
          makeField({ key: 'pages', label: 'Pages', type: 'textarea', required: true }),
          makeField({ key: 'deadline', label: 'Deadline', type: 'date', required: true }),
          makeField({ key: 'color_preferences', label: 'Color Preferences', type: 'text', required: false }),
          makeField({ key: 'reference_links', label: 'Reference Links', type: 'textarea', required: false }),
          makeField({ key: 'notes', label: 'Notes', type: 'textarea', required: false }),
          makeField({ key: 'brand_guidelines', label: 'Brand Guidelines', type: 'url', required: false }),
        ];

        const data = {
          project_name: 'Website Redesign',
          target_audience: 'Young professionals',
          // dimensions missing (required)
          // pages missing (required)
          deadline: '2025-06-01',
          color_preferences: '#6366f1',
        };

        const result = calculateCompleteness(data, fields);
        expect(result.isComplete).toBe(false);
        expect(result.missingRequired).toContain('Dimensions');
        expect(result.missingRequired).toContain('Pages');
        expect(result.missingRequired).not.toContain('Color Preferences');
        // 4 filled out of 9 fields
        expect(result.score).toBe(Math.round((4 / 9) * 100));
      });

      it('fully completed bug report brief', () => {
        const fields: BriefingTemplateField[] = [
          makeField({ key: 'bug_title', label: 'Bug Title', type: 'text', required: true }),
          makeField({ key: 'steps_to_reproduce', label: 'Steps to Reproduce', type: 'textarea', required: true }),
          makeField({ key: 'expected_behavior', label: 'Expected Behavior', type: 'textarea', required: true }),
          makeField({ key: 'actual_behavior', label: 'Actual Behavior', type: 'textarea', required: true }),
          makeField({ key: 'environment', label: 'Environment', type: 'text', required: true }),
          makeField({ key: 'severity', label: 'Severity', type: 'dropdown', options: ['Critical', 'High', 'Medium', 'Low'], required: true }),
          makeField({ key: 'url', label: 'URL', type: 'url', required: false }),
          makeField({ key: 'screenshot', label: 'Screenshot', type: 'url', required: false }),
          makeField({ key: 'notes', label: 'Notes', type: 'textarea', required: false }),
        ];

        const data = {
          bug_title: 'Login button broken',
          steps_to_reproduce: '1. Go to login\n2. Click login',
          expected_behavior: 'Should submit form',
          actual_behavior: 'Nothing happens',
          environment: 'Chrome 120, macOS',
          severity: 'Critical',
          url: 'https://app.example.com/login',
        };

        const result = calculateCompleteness(data, fields);
        expect(result.isComplete).toBe(true);
        expect(result.missingRequired).toEqual([]);
        // 7 filled out of 9
        expect(result.score).toBe(Math.round((7 / 9) * 100));
      });
    });
  });

  describe('BOARD_TYPES_WITH_BRIEFS', () => {
    it('includes the 3 balloon business board types with briefs', () => {
      expect(BOARD_TYPES_WITH_BRIEFS).toContain('boutique_decor');
      expect(BOARD_TYPES_WITH_BRIEFS).toContain('marquee_letters');
      expect(BOARD_TYPES_WITH_BRIEFS).toContain('private_clients');
    });

    it('has exactly 3 entries', () => {
      expect(BOARD_TYPES_WITH_BRIEFS).toHaveLength(3);
    });
  });

  describe('getBriefedListName', () => {
    it('returns "Briefed"', () => {
      expect(getBriefedListName()).toBe('Briefed');
    });
  });
});
