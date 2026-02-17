import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/stores/app-store';

describe('app-store', () => {
  beforeEach(() => {
    // Reset store between tests
    useAppStore.setState({
      currentUser: null,
      sidebarCollapsed: false,
      notifications: [],
      unreadCount: 0,
      activeModal: null,
    });
  });

  describe('currentUser', () => {
    it('starts with null user', () => {
      expect(useAppStore.getState().currentUser).toBeNull();
    });

    it('sets current user', () => {
      const user = { id: '1', display_name: 'Test User', avatar_url: null, role: 'member' };
      useAppStore.getState().setCurrentUser(user);

      expect(useAppStore.getState().currentUser).toEqual(user);
    });

    it('clears current user', () => {
      useAppStore.getState().setCurrentUser({ id: '1', display_name: 'Test', avatar_url: null, role: 'member' });
      useAppStore.getState().setCurrentUser(null);

      expect(useAppStore.getState().currentUser).toBeNull();
    });
  });

  describe('sidebar', () => {
    it('starts expanded', () => {
      expect(useAppStore.getState().sidebarCollapsed).toBe(false);
    });

    it('toggles sidebar', () => {
      useAppStore.getState().toggleSidebar();
      expect(useAppStore.getState().sidebarCollapsed).toBe(true);

      useAppStore.getState().toggleSidebar();
      expect(useAppStore.getState().sidebarCollapsed).toBe(false);
    });

    it('sets sidebar collapsed directly', () => {
      useAppStore.getState().setSidebarCollapsed(true);
      expect(useAppStore.getState().sidebarCollapsed).toBe(true);
    });
  });

  describe('notifications', () => {
    const makeNotification = (overrides = {}) => ({
      id: '1',
      type: 'info',
      title: 'Test',
      body: 'Test notification',
      is_read: false,
      created_at: new Date().toISOString(),
      ...overrides,
    });

    it('starts with empty notifications', () => {
      expect(useAppStore.getState().notifications).toEqual([]);
      expect(useAppStore.getState().unreadCount).toBe(0);
    });

    it('adds unread notification and increments count', () => {
      const notification = makeNotification();
      useAppStore.getState().addNotification(notification);

      expect(useAppStore.getState().notifications).toHaveLength(1);
      expect(useAppStore.getState().unreadCount).toBe(1);
    });

    it('does not increment count for read notifications', () => {
      useAppStore.getState().addNotification(makeNotification({ is_read: true }));

      expect(useAppStore.getState().notifications).toHaveLength(1);
      expect(useAppStore.getState().unreadCount).toBe(0);
    });

    it('marks notification as read', () => {
      useAppStore.getState().addNotification(makeNotification({ id: 'n1' }));
      useAppStore.getState().markAsRead('n1');

      expect(useAppStore.getState().notifications[0].is_read).toBe(true);
      expect(useAppStore.getState().unreadCount).toBe(0);
    });

    it('marks all as read', () => {
      useAppStore.getState().addNotification(makeNotification({ id: 'n1' }));
      useAppStore.getState().addNotification(makeNotification({ id: 'n2' }));
      useAppStore.getState().markAllAsRead();

      expect(useAppStore.getState().unreadCount).toBe(0);
      expect(useAppStore.getState().notifications.every(n => n.is_read)).toBe(true);
    });
  });

  describe('activeModal', () => {
    it('starts with no active modal', () => {
      expect(useAppStore.getState().activeModal).toBeNull();
    });

    it('sets active modal', () => {
      useAppStore.getState().setActiveModal('create-board');
      expect(useAppStore.getState().activeModal).toBe('create-board');
    });

    it('clears active modal', () => {
      useAppStore.getState().setActiveModal('create-board');
      useAppStore.getState().setActiveModal(null);
      expect(useAppStore.getState().activeModal).toBeNull();
    });
  });
});
