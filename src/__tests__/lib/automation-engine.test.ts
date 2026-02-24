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
    describe('boutique_decor', () => {
      it('returns 4 rules (proposal sent, invoice sent, paid in full, completion log)', () => {
        const rules = getDefaultAutomationRules('boutique_decor');
        expect(rules).toHaveLength(4);
      });

      it('includes proposal sent logging rule', () => {
        const rules = getDefaultAutomationRules('boutique_decor');
        const proposalRule = rules.find(
          (r) => r.action_config.event_type === 'proposal_sent'
        );
        expect(proposalRule).toBeDefined();
        expect(proposalRule!.trigger_type).toBe('card_moved');
        expect(proposalRule!.action_type).toBe('create_activity_log');
      });

      it('includes invoice sent logging rule', () => {
        const rules = getDefaultAutomationRules('boutique_decor');
        const invoiceRule = rules.find(
          (r) => r.action_config.event_type === 'invoice_sent'
        );
        expect(invoiceRule).toBeDefined();
      });

      it('includes payment received logging rule', () => {
        const rules = getDefaultAutomationRules('boutique_decor');
        const paymentRule = rules.find(
          (r) => r.action_config.event_type === 'payment_received'
        );
        expect(paymentRule).toBeDefined();
      });

      it('includes booking completed logging rule', () => {
        const rules = getDefaultAutomationRules('boutique_decor');
        const completionRule = rules.find(
          (r) => r.action_config.event_type === 'booking_completed'
        );
        expect(completionRule).toBeDefined();
      });
    });

    describe('marquee_letters', () => {
      it('returns 4 rules (proposal sent, invoice sent, paid in full, completion log)', () => {
        const rules = getDefaultAutomationRules('marquee_letters');
        expect(rules).toHaveLength(4);
      });

      it('includes proposal sent logging rule', () => {
        const rules = getDefaultAutomationRules('marquee_letters');
        const proposalRule = rules.find(
          (r) => r.action_config.event_type === 'proposal_sent'
        );
        expect(proposalRule).toBeDefined();
      });
    });

    describe('private_clients', () => {
      it('returns 3 rules (invoice sent, paid, completion)', () => {
        const rules = getDefaultAutomationRules('private_clients');
        expect(rules).toHaveLength(3);
      });

      it('includes invoice sent logging rule', () => {
        const rules = getDefaultAutomationRules('private_clients');
        const invoiceRule = rules.find(
          (r) => r.action_config.event_type === 'invoice_sent'
        );
        expect(invoiceRule).toBeDefined();
      });

      it('includes payment received logging rule', () => {
        const rules = getDefaultAutomationRules('private_clients');
        const paymentRule = rules.find(
          (r) => r.action_config.event_type === 'payment_received'
        );
        expect(paymentRule).toBeDefined();
      });

      it('includes booking completed logging rule', () => {
        const rules = getDefaultAutomationRules('private_clients');
        const completionRule = rules.find(
          (r) => r.action_config.event_type === 'booking_completed'
        );
        expect(completionRule).toBeDefined();
      });
    });

    describe('owner_dashboard', () => {
      it('returns at least 1 rule', () => {
        const rules = getDefaultAutomationRules('owner_dashboard');
        expect(rules.length).toBeGreaterThanOrEqual(1);
      });

      it('includes approved logging rule', () => {
        const rules = getDefaultAutomationRules('owner_dashboard');
        const approvedRule = rules.find(
          (r) => r.action_config.event_type === 'card_approved'
        );
        expect(approvedRule).toBeDefined();
      });
    });

    describe('va_workspace', () => {
      it('returns at least 1 rule', () => {
        const rules = getDefaultAutomationRules('va_workspace');
        expect(rules.length).toBeGreaterThanOrEqual(1);
      });

      it('includes ready to send logging rule', () => {
        const rules = getDefaultAutomationRules('va_workspace');
        const readyRule = rules.find(
          (r) => r.action_config.event_type === 'ready_to_send'
        );
        expect(readyRule).toBeDefined();
      });
    });

    describe('general_tasks', () => {
      it('returns at least 1 rule (general completion log)', () => {
        const rules = getDefaultAutomationRules('general_tasks');
        expect(rules.length).toBeGreaterThanOrEqual(1);
      });

      it('includes task completed logging rule', () => {
        const rules = getDefaultAutomationRules('general_tasks');
        const completionRule = rules.find(
          (r) => r.action_config.event_type === 'task_completed'
        );
        expect(completionRule).toBeDefined();
      });
    });

    describe('rule structure', () => {
      it('all returned rules have required properties', () => {
        const boardTypes = [
          'boutique_decor',
          'marquee_letters',
          'private_clients',
          'owner_dashboard',
          'va_workspace',
          'general_tasks',
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
