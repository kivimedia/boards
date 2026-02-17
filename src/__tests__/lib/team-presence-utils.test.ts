import { describe, it, expect } from 'vitest';

/**
 * Team Presence utility function tests (P8.4).
 *
 * ShareModal.tsx defines these helper functions and constants inline:
 *   - ROLE_OPTIONS constant
 *   - getRoleLabel(role) -> display label
 *   - getRoleBadgeColor(role) -> Tailwind classes
 *
 * Replicated here for testability (gantt-utils.test.ts pattern).
 */

// Replicated from ShareModal.tsx
const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'admin', label: 'Owner' },
  { value: 'department_lead', label: 'Lead' },
  { value: 'member', label: 'Editor' },
  { value: 'guest', label: 'Viewer' },
];

function getRoleLabel(role: string) {
  return ROLE_OPTIONS.find((o) => o.value === role)?.label || role;
}

function getRoleBadgeColor(role: string) {
  switch (role) {
    case 'admin': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    case 'department_lead': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'member': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'guest': return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
    default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  }
}

describe('Team Presence Utilities (P8.4)', () => {
  describe('ROLE_OPTIONS', () => {
    it('has exactly 4 entries', () => {
      expect(ROLE_OPTIONS).toHaveLength(4);
    });

    it('each entry has value and label strings', () => {
      for (const opt of ROLE_OPTIONS) {
        expect(typeof opt.value).toBe('string');
        expect(typeof opt.label).toBe('string');
        expect(opt.value.length).toBeGreaterThan(0);
        expect(opt.label.length).toBeGreaterThan(0);
      }
    });

    it('contains admin, department_lead, member, guest values', () => {
      const values = ROLE_OPTIONS.map((o) => o.value);
      expect(values).toContain('admin');
      expect(values).toContain('department_lead');
      expect(values).toContain('member');
      expect(values).toContain('guest');
    });

    it('labels are Owner, Lead, Editor, Viewer', () => {
      const labels = ROLE_OPTIONS.map((o) => o.label);
      expect(labels).toContain('Owner');
      expect(labels).toContain('Lead');
      expect(labels).toContain('Editor');
      expect(labels).toContain('Viewer');
    });
  });

  describe('getRoleLabel', () => {
    it('admin -> Owner', () => {
      expect(getRoleLabel('admin')).toBe('Owner');
    });

    it('department_lead -> Lead', () => {
      expect(getRoleLabel('department_lead')).toBe('Lead');
    });

    it('member -> Editor', () => {
      expect(getRoleLabel('member')).toBe('Editor');
    });

    it('guest -> Viewer', () => {
      expect(getRoleLabel('guest')).toBe('Viewer');
    });

    it('unknown role returns the role string as fallback', () => {
      expect(getRoleLabel('observer')).toBe('observer');
      expect(getRoleLabel('custom_role')).toBe('custom_role');
    });
  });

  describe('getRoleBadgeColor', () => {
    it('admin -> purple classes', () => {
      const classes = getRoleBadgeColor('admin');
      expect(classes).toContain('purple');
      expect(classes).toContain('dark:');
    });

    it('department_lead -> blue classes', () => {
      const classes = getRoleBadgeColor('department_lead');
      expect(classes).toContain('blue');
      expect(classes).toContain('dark:');
    });

    it('member -> green classes', () => {
      const classes = getRoleBadgeColor('member');
      expect(classes).toContain('green');
      expect(classes).toContain('dark:');
    });

    it('guest -> slate classes', () => {
      const classes = getRoleBadgeColor('guest');
      expect(classes).toContain('slate');
      expect(classes).toContain('dark:');
    });

    it('unknown role -> slate default (same as guest)', () => {
      expect(getRoleBadgeColor('unknown')).toBe(getRoleBadgeColor('guest'));
    });

    it('all known roles return non-empty strings', () => {
      for (const role of ['admin', 'department_lead', 'member', 'guest']) {
        expect(getRoleBadgeColor(role).length).toBeGreaterThan(0);
      }
    });
  });
});
