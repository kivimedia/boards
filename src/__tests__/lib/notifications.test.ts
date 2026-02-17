import { describe, it, expect } from 'vitest';
import type {
  Notification,
  NotificationType,
  NotificationPreferences,
  HandoffRule,
  OnboardingTemplate,
  OnboardingTemplateItem,
  DependencyType,
} from '@/lib/types';

describe('Notifications & Cross-Board Workflows (P1.6)', () => {
  describe('NotificationType', () => {
    it('supports all notification types', () => {
      const types: NotificationType[] = [
        'card_assigned',
        'card_mentioned',
        'card_moved',
        'card_due_soon',
        'card_overdue',
        'comment_added',
        'handoff_created',
        'brief_incomplete',
        'approval_needed',
        'onboarding_started',
        'automation_triggered',
      ];
      expect(types).toHaveLength(11);
    });
  });

  describe('Notification', () => {
    it('has correct shape', () => {
      const notification: Notification = {
        id: 'n-1',
        user_id: 'user-1',
        type: 'card_assigned',
        title: 'You were assigned to a card',
        body: 'Card "Design Logo" was assigned to you',
        is_read: false,
        card_id: 'card-1',
        board_id: 'board-1',
        metadata: { assigned_by: 'user-2' },
        created_at: '2025-01-01T00:00:00Z',
      };
      expect(notification.type).toBe('card_assigned');
      expect(notification.is_read).toBe(false);
    });

    it('allows nullable fields', () => {
      const notification: Notification = {
        id: 'n-2',
        user_id: 'user-1',
        type: 'automation_triggered',
        title: 'Automation ran',
        body: null,
        is_read: true,
        card_id: null,
        board_id: null,
        metadata: {},
        created_at: '2025-01-01T00:00:00Z',
      };
      expect(notification.body).toBeNull();
      expect(notification.card_id).toBeNull();
    });
  });

  describe('NotificationPreferences', () => {
    it('has correct shape', () => {
      const prefs: NotificationPreferences = {
        id: 'pref-1',
        user_id: 'user-1',
        email_enabled: true,
        push_enabled: false,
        event_settings: {
          card_assigned: true,
          comment_added: false,
          card_moved: true,
        },
        quiet_hours_start: '22:00',
        quiet_hours_end: '08:00',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      expect(prefs.email_enabled).toBe(true);
      expect(prefs.event_settings['comment_added']).toBe(false);
    });

    it('allows null quiet hours', () => {
      const prefs: NotificationPreferences = {
        id: 'pref-2',
        user_id: 'user-1',
        email_enabled: true,
        push_enabled: true,
        event_settings: {},
        quiet_hours_start: null,
        quiet_hours_end: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      expect(prefs.quiet_hours_start).toBeNull();
    });
  });

  describe('HandoffRule', () => {
    it('has correct shape', () => {
      const rule: HandoffRule = {
        id: 'hr-1',
        name: 'Design Approved → Dev Backlog',
        source_board_id: 'board-design',
        source_column: 'Approved',
        target_board_id: 'board-dev',
        target_column: 'Backlog',
        inherit_fields: ['title', 'description', 'priority', 'client_id'],
        is_active: true,
        created_by: 'user-1',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      expect(rule.name).toBe('Design Approved → Dev Backlog');
      expect(rule.inherit_fields).toContain('title');
      expect(rule.inherit_fields).toContain('client_id');
    });

    it('supports empty inherit_fields', () => {
      const rule: HandoffRule = {
        id: 'hr-2',
        name: 'Simple Handoff',
        source_board_id: 'board-1',
        source_column: 'Done',
        target_board_id: 'board-2',
        target_column: 'Inbox',
        inherit_fields: [],
        is_active: false,
        created_by: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      expect(rule.inherit_fields).toEqual([]);
      expect(rule.is_active).toBe(false);
    });
  });

  describe('OnboardingTemplate', () => {
    it('has correct shape with template_data items', () => {
      const item1: OnboardingTemplateItem = {
        board_type: 'graphic_designer',
        title: 'Create brand assets for {client_name}',
        description: 'Design initial brand assets.',
        list_name: 'Briefed',
        priority: 'high',
        inherit_client: true,
        depends_on: [],
      };

      const item2: OnboardingTemplateItem = {
        board_type: 'dev',
        title: 'Set up website for {client_name}',
        description: 'Set up hosting and structure.',
        list_name: 'Backlog',
        priority: 'medium',
        inherit_client: true,
        depends_on: [0],
      };

      const template: OnboardingTemplate = {
        id: 'ot-1',
        name: 'Standard Client Onboarding',
        description: 'Creates cards across multiple boards.',
        template_data: [item1, item2],
        is_active: true,
        created_by: 'user-1',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      expect(template.template_data).toHaveLength(2);
      expect(template.template_data[0].board_type).toBe('graphic_designer');
      expect(template.template_data[1].depends_on).toEqual([0]);
    });

    it('template item title supports client_name placeholder', () => {
      const item: OnboardingTemplateItem = {
        board_type: 'account_manager',
        title: 'Onboard {client_name} account',
        description: 'Complete onboarding for {client_name}.',
        list_name: 'Onboarding',
        priority: 'high',
        inherit_client: true,
        depends_on: [],
      };

      const clientName = 'Acme Corp';
      const resolved = item.title.replace('{client_name}', clientName);
      expect(resolved).toBe('Onboard Acme Corp account');
    });
  });

  describe('DependencyType includes spawned_from', () => {
    it('spawned_from is a valid DependencyType', () => {
      const types: DependencyType[] = ['blocked_by', 'blocking', 'related', 'spawned_from'];
      expect(types).toHaveLength(4);
      expect(types).toContain('spawned_from');
    });
  });

  describe('Onboarding template dependencies', () => {
    it('can represent a DAG of card dependencies', () => {
      const items: OnboardingTemplateItem[] = [
        {
          board_type: 'graphic_designer',
          title: 'Design',
          description: '',
          list_name: 'Briefed',
          priority: 'high',
          inherit_client: true,
          depends_on: [],
        },
        {
          board_type: 'dev',
          title: 'Develop',
          description: '',
          list_name: 'Backlog',
          priority: 'medium',
          inherit_client: true,
          depends_on: [0],
        },
        {
          board_type: 'copy',
          title: 'Write Copy',
          description: '',
          list_name: 'Briefed',
          priority: 'high',
          inherit_client: true,
          depends_on: [],
        },
        {
          board_type: 'video_editor',
          title: 'Create Video',
          description: '',
          list_name: 'Briefed',
          priority: 'low',
          inherit_client: true,
          depends_on: [0, 2],
        },
      ];

      // Item 0 (Design) has no dependencies
      expect(items[0].depends_on).toEqual([]);
      // Item 1 (Dev) depends on item 0 (Design)
      expect(items[1].depends_on).toEqual([0]);
      // Item 3 (Video) depends on items 0 and 2 (Design and Copy)
      expect(items[3].depends_on).toEqual([0, 2]);

      // Verify no circular dependencies (all depends_on point to lower indices)
      for (let i = 0; i < items.length; i++) {
        for (const dep of items[i].depends_on) {
          expect(dep).toBeLessThan(i);
        }
      }
    });
  });
});
