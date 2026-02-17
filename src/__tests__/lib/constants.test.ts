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
    it('has all 8 board types', () => {
      const types = Object.keys(BOARD_TYPE_CONFIG);
      expect(types).toHaveLength(8);
      expect(types).toContain('dev');
      expect(types).toContain('training');
      expect(types).toContain('account_manager');
      expect(types).toContain('graphic_designer');
      expect(types).toContain('executive_assistant');
      expect(types).toContain('video_editor');
      expect(types).toContain('copy');
      expect(types).toContain('client_strategy_map');
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

    it('dev board has correct default lists', () => {
      expect(BOARD_TYPE_CONFIG.dev.defaultLists).toEqual([
        'Backlog',
        'Briefed',
        'In Progress',
        'Code Review',
        'QA Testing',
        'Revisions',
        'Staging',
        'Ready for Deploy',
        'Deployed',
      ]);
    });

    it('dev board has expected custom fields', () => {
      const fieldNames = BOARD_TYPE_CONFIG.dev.defaultCustomFields.map((f) => f.name);
      expect(fieldNames).toContain('Ticket Type');
      expect(fieldNames).toContain('Story Points');
      expect(fieldNames).toContain('Repository');
      expect(fieldNames).toContain('PR Link');
    });

    it('copy board has correct default lists', () => {
      expect(BOARD_TYPE_CONFIG.copy.defaultLists).toEqual([
        'Briefed',
        'Research',
        'Writing',
        'Internal Review',
        'Revisions',
        'Client Review',
        'Approved',
        'Published',
      ]);
    });

    it('client_strategy_map board has correct default lists', () => {
      expect(BOARD_TYPE_CONFIG.client_strategy_map.defaultLists).toEqual([
        'Discovery',
        'Strategy',
        'Execution',
        'Review',
        'Optimization',
      ]);
    });
  });

  describe('LABEL_COLORS', () => {
    it('has 8 predefined colors', () => {
      expect(LABEL_COLORS).toHaveLength(8);
    });

    it('each color has a name and hex value', () => {
      for (const color of LABEL_COLORS) {
        expect(color.name).toBeTruthy();
        expect(color.value).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });
  });
});
