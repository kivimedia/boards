import { describe, it, expect } from 'vitest';
import { BOARD_TYPE_CONFIG } from '@/lib/constants';
import type { BoardType, CustomFieldType } from '@/lib/types';

const ALL_BOARD_TYPES: BoardType[] = [
  'boutique_decor',
  'marquee_letters',
  'private_clients',
  'owner_dashboard',
  'va_workspace',
  'general_tasks',
];

const VALID_FIELD_TYPES: CustomFieldType[] = [
  'text',
  'number',
  'dropdown',
  'date',
  'checkbox',
  'url',
];

describe('Board Schemas - BOARD_TYPE_CONFIG', () => {
  describe('completeness', () => {
    it('has all 6 board types', () => {
      const types = Object.keys(BOARD_TYPE_CONFIG);
      expect(types).toHaveLength(6);
      for (const boardType of ALL_BOARD_TYPES) {
        expect(types).toContain(boardType);
      }
    });
  });

  describe('required fields for each board type', () => {
    it.each(ALL_BOARD_TYPES)('%s has all required fields', (boardType) => {
      const config = BOARD_TYPE_CONFIG[boardType];
      expect(config.label).toBeTruthy();
      expect(typeof config.label).toBe('string');
      expect(config.icon).toBeTruthy();
      expect(typeof config.icon).toBe('string');
      expect(config.defaultLists).toBeInstanceOf(Array);
      expect(config.defaultLists.length).toBeGreaterThan(0);
      expect(config.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(config.defaultCustomFields).toBeInstanceOf(Array);
    });
  });

  describe('boutique_decor board', () => {
    const config = BOARD_TYPE_CONFIG.boutique_decor;

    it('has 15 lists', () => {
      expect(config.defaultLists).toHaveLength(15);
    });

    it('starts with Website Inquiry and ends with Template Cards', () => {
      expect(config.defaultLists[0]).toBe('Website Inquiry');
      expect(config.defaultLists[config.defaultLists.length - 1]).toBe('Template Cards');
    });

    it('has Event Date field with is_required=true', () => {
      const eventDateField = config.defaultCustomFields.find(
        (f) => f.name === 'Event Date'
      );
      expect(eventDateField).toBeDefined();
      expect(eventDateField!.field_type).toBe('date');
      expect(eventDateField!.is_required).toBe(true);
    });
  });

  describe('marquee_letters board', () => {
    const config = BOARD_TYPE_CONFIG.marquee_letters;

    it('has 15 lists', () => {
      expect(config.defaultLists).toHaveLength(15);
    });

    it('has Letter Configuration field', () => {
      const letterField = config.defaultCustomFields.find(
        (f) => f.name === 'Letter Configuration'
      );
      expect(letterField).toBeDefined();
      expect(letterField!.field_type).toBe('text');
    });
  });

  describe('private_clients board', () => {
    const config = BOARD_TYPE_CONFIG.private_clients;

    it('has 17 lists', () => {
      expect(config.defaultLists).toHaveLength(17);
    });

    it('has Payment Status dropdown field', () => {
      const paymentField = config.defaultCustomFields.find(
        (f) => f.name === 'Payment Status'
      );
      expect(paymentField).toBeDefined();
      expect(paymentField!.field_type).toBe('dropdown');
    });
  });

  describe('owner_dashboard board', () => {
    it('has 15 lists', () => {
      expect(BOARD_TYPE_CONFIG.owner_dashboard.defaultLists).toHaveLength(15);
    });
  });

  describe('va_workspace board', () => {
    it('has 21 lists', () => {
      expect(BOARD_TYPE_CONFIG.va_workspace.defaultLists).toHaveLength(21);
    });
  });

  describe('general_tasks board', () => {
    it('has 4 lists', () => {
      expect(BOARD_TYPE_CONFIG.general_tasks.defaultLists).toHaveLength(4);
    });
  });

  describe('custom field validation across all board types', () => {
    it.each(ALL_BOARD_TYPES)(
      '%s has only valid field_type values',
      (boardType) => {
        const config = BOARD_TYPE_CONFIG[boardType];
        for (const field of config.defaultCustomFields) {
          expect(VALID_FIELD_TYPES).toContain(field.field_type);
        }
      }
    );

    it.each(ALL_BOARD_TYPES)(
      '%s dropdown fields have non-empty options arrays',
      (boardType) => {
        const config = BOARD_TYPE_CONFIG[boardType];
        const dropdownFields = config.defaultCustomFields.filter(
          (f) => f.field_type === 'dropdown'
        );
        for (const field of dropdownFields) {
          expect(
            field.options,
            `${boardType} field "${field.name}" should have options`
          ).toBeDefined();
          expect(
            field.options!.length,
            `${boardType} field "${field.name}" should have non-empty options`
          ).toBeGreaterThan(0);
        }
      }
    );

    it.each(ALL_BOARD_TYPES)(
      '%s has no duplicate field names',
      (boardType) => {
        const config = BOARD_TYPE_CONFIG[boardType];
        const fieldNames = config.defaultCustomFields.map((f) => f.name);
        const uniqueNames = new Set(fieldNames);
        expect(
          uniqueNames.size,
          `${boardType} has duplicate field names: ${fieldNames.filter(
            (n, i) => fieldNames.indexOf(n) !== i
          )}`
        ).toBe(fieldNames.length);
      }
    );

    it.each(ALL_BOARD_TYPES)(
      '%s has no duplicate list names',
      (boardType) => {
        const config = BOARD_TYPE_CONFIG[boardType];
        const listNames = config.defaultLists;
        const uniqueNames = new Set(listNames);
        expect(
          uniqueNames.size,
          `${boardType} has duplicate list names: ${listNames.filter(
            (n, i) => listNames.indexOf(n) !== i
          )}`
        ).toBe(listNames.length);
      }
    );
  });
});
