import { describe, it, expect } from 'vitest';
import { BOARD_TYPE_CONFIG, LABEL_COLORS } from '@/lib/constants';
import type { CustomFieldType } from '@/lib/types';

const VALID_FIELD_TYPES: CustomFieldType[] = [
  'text',
  'number',
  'dropdown',
  'date',
  'checkbox',
  'url',
];

describe('constants', () => {
  describe('BOARD_TYPE_CONFIG', () => {
    it('has all 6 board types', () => {
      const types = Object.keys(BOARD_TYPE_CONFIG);
      expect(types).toHaveLength(6);
      expect(types).toContain('boutique_decor');
      expect(types).toContain('marquee_letters');
      expect(types).toContain('private_clients');
      expect(types).toContain('owner_dashboard');
      expect(types).toContain('va_workspace');
      expect(types).toContain('general_tasks');
    });

    it('each board type has required fields', () => {
      for (const [type, config] of Object.entries(BOARD_TYPE_CONFIG)) {
        expect(config.label, `${type} should have a label`).toBeTruthy();
        expect(config.icon, `${type} should have an icon`).toBeTruthy();
        expect(config.defaultLists.length, `${type} should have default lists`).toBeGreaterThan(0);
        expect(config.color, `${type} should have a color`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });

    it('each board type has defaultCustomFields array', () => {
      for (const [type, config] of Object.entries(BOARD_TYPE_CONFIG)) {
        expect(
          config.defaultCustomFields,
          `${type} should have defaultCustomFields`
        ).toBeInstanceOf(Array);
      }
    });

    it('each board type has custom fields with valid field_type values', () => {
      for (const [type, config] of Object.entries(BOARD_TYPE_CONFIG)) {
        for (const field of config.defaultCustomFields) {
          expect(
            VALID_FIELD_TYPES,
            `${type} field "${field.name}" has invalid field_type "${field.field_type}"`
          ).toContain(field.field_type);
        }
      }
    });

    it('boutique_decor board has correct default lists', () => {
      expect(BOARD_TYPE_CONFIG.boutique_decor.defaultLists).toEqual([
        'Website Inquiry',
        'DM/Text Inquiry',
        'Responded - Need More Info',
        'Proposal/Pricing Sent',
        'Needs Follow-Up',
        'Needs Invoice',
        'Invoice Sent',
        'Paid in Full',
        'Supplies/Prep Needed',
        'Event This Week',
        'Needs Thank You',
        'Thank You Sent / Complete',
        "Didn't Book",
        'Future/On Hold',
        'Template Cards',
      ]);
    });

    it('boutique_decor board has expected custom fields', () => {
      const fieldNames = BOARD_TYPE_CONFIG.boutique_decor.defaultCustomFields.map((f) => f.name);
      expect(fieldNames).toContain('Event Date');
      expect(fieldNames).toContain('Event Type');
      expect(fieldNames).toContain('Venue');
      expect(fieldNames).toContain('Estimated Value');
    });

    it('general_tasks board has correct default lists', () => {
      expect(BOARD_TYPE_CONFIG.general_tasks.defaultLists).toEqual([
        'To Do',
        'In Progress',
        'Done',
        'Reference',
      ]);
    });

    it('owner_dashboard board has correct default lists', () => {
      expect(BOARD_TYPE_CONFIG.owner_dashboard.defaultLists).toContain('Halley Needs to Review');
      expect(BOARD_TYPE_CONFIG.owner_dashboard.defaultLists).toContain('Approved');
    });
  });

  describe('LABEL_COLORS', () => {
    it('has 10 predefined colors', () => {
      expect(LABEL_COLORS).toHaveLength(10);
    });

    it('each color has a name and hex value', () => {
      for (const color of LABEL_COLORS) {
        expect(color.name).toBeTruthy();
        expect(color.value).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });
  });
});
