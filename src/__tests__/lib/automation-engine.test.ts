import { describe, it, expect } from 'vitest';
import { matchesTrigger, getDefaultAutomationRules } from '@/lib/automation-engine';
import type { TriggerEvent } from '@/lib/automation-engine';
import type { AutomationRule } from '@/lib/types';

function createMockRule(
  overrides: Partial<AutomationRule> = {}
): AutomationRule {
  return {
    id: 'rule-1',
    board_id: 'board-1',
    name: 'Test Rule',
    is_active: true,
    trigger_type: 'card_moved',
    trigger_config: {},
    action_type: 'move_card',
    action_config: {},
    execution_order: 1,
    created_by: 'user-1',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function createEvent(
  type: TriggerEvent['type'],
  data: TriggerEvent['data'] = {}
): TriggerEvent {
  return { type, data };
}

describe('Automation Engine', () => {
  describe('matchesTrigger', () => {
    describe('card_moved trigger', () => {
      it('matches when to_list_name matches trigger_config.to_list_name', () => {
        const rule = createMockRule({
          trigger_type: 'card_moved',
          trigger_config: { to_list_name: 'Revisions' },
        });
        const event = createEvent('card_moved', {
          to_list_name: 'Revisions',
          from_list_name: 'In Progress',
        });
        expect(matchesTrigger(rule, event)).toBe(true);
      });

      it('does NOT match when to_list_name differs', () => {
        const rule = createMockRule({
          trigger_type: 'card_moved',
          trigger_config: { to_list_name: 'Revisions' },
        });
        const event = createEvent('card_moved', {
          to_list_name: 'Done',
          from_list_name: 'In Progress',
        });
        expect(matchesTrigger(rule, event)).toBe(false);
      });

      it('matches when from_list_name matches trigger_config.from_list_name', () => {
        const rule = createMockRule({
          trigger_type: 'card_moved',
          trigger_config: { from_list_name: 'In Progress' },
        });
        const event = createEvent('card_moved', {
          to_list_name: 'Done',
          from_list_name: 'In Progress',
        });
        expect(matchesTrigger(rule, event)).toBe(true);
      });

      it('matches when no list name specified in config (any move matches)', () => {
        const rule = createMockRule({
          trigger_type: 'card_moved',
          trigger_config: {},
        });
        const event = createEvent('card_moved', {
          to_list_name: 'Anywhere',
          from_list_name: 'Something',
        });
        expect(matchesTrigger(rule, event)).toBe(true);
      });
    });

    describe('field_changed trigger', () => {
      it('matches when field_name matches', () => {
        const rule = createMockRule({
          trigger_type: 'field_changed',
          trigger_config: { field_name: 'Story Points' },
        });
        const event = createEvent('field_changed', {
          field_name: 'Story Points',
          field_value: 5,
          old_value: 3,
        });
        expect(matchesTrigger(rule, event)).toBe(true);
      });

      it('does NOT match when field_name differs', () => {
        const rule = createMockRule({
          trigger_type: 'field_changed',
          trigger_config: { field_name: 'Story Points' },
        });
        const event = createEvent('field_changed', {
          field_name: 'Design Type',
          field_value: 'Logo',
        });
        expect(matchesTrigger(rule, event)).toBe(false);
      });
    });

    describe('card_created trigger', () => {
      it('always matches', () => {
        const rule = createMockRule({
          trigger_type: 'card_created',
          trigger_config: {},
        });
        const event = createEvent('card_created', {});
        expect(matchesTrigger(rule, event)).toBe(true);
      });
    });

    describe('trigger type mismatch', () => {
      it('does not match when trigger types differ', () => {
        const rule = createMockRule({
          trigger_type: 'card_moved',
          trigger_config: { to_list_name: 'Done' },
        });
        const event = createEvent('card_created', {});
        expect(matchesTrigger(rule, event)).toBe(false);
      });

      it('card_created rule does not match card_moved event', () => {
        const rule = createMockRule({
          trigger_type: 'card_created',
          trigger_config: {},
        });
        const event = createEvent('card_moved', { to_list_name: 'Done' });
        expect(matchesTrigger(rule, event)).toBe(false);
      });

      it('field_changed rule does not match card_moved event', () => {
        const rule = createMockRule({
          trigger_type: 'field_changed',
          trigger_config: { field_name: 'Status' },
        });
        const event = createEvent('card_moved', { to_list_name: 'Done' });
        expect(matchesTrigger(rule, event)).toBe(false);
      });
    });
  });

  describe('getDefaultAutomationRules', () => {
    describe('graphic_designer', () => {
      it('returns rules including revision counter increment', () => {
        const rules = getDefaultAutomationRules('graphic_designer');
        expect(rules.length).toBeGreaterThan(0);
        const revisionRule = rules.find(
          (r) =>
            r.action_type === 'increment_field' &&
            r.action_config.field_name === 'Revision Count'
        );
        expect(revisionRule).toBeDefined();
        expect(revisionRule!.trigger_type).toBe('card_moved');
      });
    });

    describe('dev', () => {
      it('returns rules including revision counter increment', () => {
        const rules = getDefaultAutomationRules('dev');
        expect(rules.length).toBeGreaterThan(0);
        const revisionRule = rules.find(
          (r) =>
            r.action_type === 'increment_field' &&
            r.action_config.field_name === 'Revision Count'
        );
        expect(revisionRule).toBeDefined();
      });
    });

    describe('video_editor', () => {
      it('returns rules including revision counter increment', () => {
        const rules = getDefaultAutomationRules('video_editor');
        expect(rules.length).toBeGreaterThan(0);
        const revisionRule = rules.find(
          (r) =>
            r.action_type === 'increment_field' &&
            r.action_config.field_name === 'Revision Count'
        );
        expect(revisionRule).toBeDefined();
      });
    });

    describe('all board types return rules', () => {
      it('account_manager returns rules', () => {
        const rules = getDefaultAutomationRules('account_manager');
        expect(rules.length).toBeGreaterThan(0);
      });

      it('executive_assistant returns rules', () => {
        const rules = getDefaultAutomationRules('executive_assistant');
        expect(rules.length).toBeGreaterThan(0);
      });

      it('training returns rules', () => {
        const rules = getDefaultAutomationRules('training');
        expect(rules.length).toBeGreaterThan(0);
      });

      it('client_strategy_map returns rules', () => {
        const rules = getDefaultAutomationRules('client_strategy_map');
        expect(rules.length).toBeGreaterThan(0);
      });

      it('copy returns rules', () => {
        const rules = getDefaultAutomationRules('copy');
        expect(rules.length).toBeGreaterThan(0);
      });
    });

    describe('rule structure', () => {
      it('all returned rules have required properties', () => {
        const boardTypes = [
          'graphic_designer',
          'dev',
          'video_editor',
          'copy',
          'account_manager',
          'executive_assistant',
          'training',
          'client_strategy_map',
        ] as const;
        for (const boardType of boardTypes) {
          const rules = getDefaultAutomationRules(boardType);
          for (const rule of rules) {
            expect(rule.name).toBeTruthy();
            expect(typeof rule.name).toBe('string');
            expect(rule.trigger_type).toBeTruthy();
            expect(rule.trigger_config).toBeDefined();
            expect(rule.action_type).toBeTruthy();
            expect(rule.action_config).toBeDefined();
          }
        }
      });
    });
  });
});
