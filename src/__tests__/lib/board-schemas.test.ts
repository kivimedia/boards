import { describe, it, expect } from 'vitest';
import { BOARD_TYPE_CONFIG } from '@/lib/constants';
import type { BoardType, CustomFieldType } from '@/lib/types';

const ALL_BOARD_TYPES: BoardType[] = [
  'dev',
  'training',
  'account_manager',
  'graphic_designer',
  'executive_assistant',
  'video_editor',
  'copy',
  'client_strategy_map',
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
    it('has all 8 board types', () => {
      const types = Object.keys(BOARD_TYPE_CONFIG);
      expect(types).toHaveLength(8);
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

  describe('graphic_designer board', () => {
    const config = BOARD_TYPE_CONFIG.graphic_designer;

    it('has 8 columns', () => {
      expect(config.defaultLists).toHaveLength(8);
    });

    it('starts with Briefed and ends with Delivered', () => {
      expect(config.defaultLists[0]).toBe('Briefed');
      expect(config.defaultLists[config.defaultLists.length - 1]).toBe('Delivered');
    });

    it('has Design Type dropdown field with is_required=true', () => {
      const designTypeField = config.defaultCustomFields.find(
        (f) => f.name === 'Design Type'
      );
      expect(designTypeField).toBeDefined();
      expect(designTypeField!.field_type).toBe('dropdown');
      expect(designTypeField!.is_required).toBe(true);
    });
  });

  describe('dev board', () => {
    const config = BOARD_TYPE_CONFIG.dev;

    it('has 9 columns', () => {
      expect(config.defaultLists).toHaveLength(9);
    });

    it('starts with Backlog and ends with Deployed', () => {
      expect(config.defaultLists[0]).toBe('Backlog');
      expect(config.defaultLists[config.defaultLists.length - 1]).toBe('Deployed');
    });

    it('has Ticket Type dropdown field with is_required=true', () => {
      const ticketTypeField = config.defaultCustomFields.find(
        (f) => f.name === 'Ticket Type'
      );
      expect(ticketTypeField).toBeDefined();
      expect(ticketTypeField!.field_type).toBe('dropdown');
      expect(ticketTypeField!.is_required).toBe(true);
    });

    it('has Story Points number field', () => {
      const storyPointsField = config.defaultCustomFields.find(
        (f) => f.name === 'Story Points'
      );
      expect(storyPointsField).toBeDefined();
      expect(storyPointsField!.field_type).toBe('number');
    });
  });

  describe('video_editor board', () => {
    const config = BOARD_TYPE_CONFIG.video_editor;

    it('has 8 columns', () => {
      expect(config.defaultLists).toHaveLength(8);
    });

    it('has Revision Count number field', () => {
      const revisionCountField = config.defaultCustomFields.find(
        (f) => f.name === 'Revision Count'
      );
      expect(revisionCountField).toBeDefined();
      expect(revisionCountField!.field_type).toBe('number');
    });
  });

  describe('copy board', () => {
    const config = BOARD_TYPE_CONFIG.copy;

    it('has 8 columns', () => {
      expect(config.defaultLists).toHaveLength(8);
    });

    it('has Content Type dropdown field', () => {
      const contentTypeField = config.defaultCustomFields.find(
        (f) => f.name === 'Content Type'
      );
      expect(contentTypeField).toBeDefined();
      expect(contentTypeField!.field_type).toBe('dropdown');
    });
  });

  describe('account_manager board', () => {
    it('has 8 columns', () => {
      expect(BOARD_TYPE_CONFIG.account_manager.defaultLists).toHaveLength(8);
    });
  });

  describe('executive_assistant board', () => {
    it('has 6 columns', () => {
      expect(BOARD_TYPE_CONFIG.executive_assistant.defaultLists).toHaveLength(6);
    });
  });

  describe('training board', () => {
    it('has 6 columns', () => {
      expect(BOARD_TYPE_CONFIG.training.defaultLists).toHaveLength(6);
    });
  });

  describe('client_strategy_map board', () => {
    it('has 5 columns', () => {
      expect(BOARD_TYPE_CONFIG.client_strategy_map.defaultLists).toHaveLength(5);
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
