import { describe, it, expect } from 'vitest';
import { subscribe, unsubscribe, getSubscriptions, sendPush, buildPushPayload } from '@/lib/push-notifications';

describe('Push Notifications (v5.6.0)', () => {
  describe('exports', () => {
    it('subscribe is a function', () => { expect(typeof subscribe).toBe('function'); });
    it('unsubscribe is a function', () => { expect(typeof unsubscribe).toBe('function'); });
    it('getSubscriptions is a function', () => { expect(typeof getSubscriptions).toBe('function'); });
    it('sendPush is a function', () => { expect(typeof sendPush).toBe('function'); });
    it('buildPushPayload is a function', () => { expect(typeof buildPushPayload).toBe('function'); });
  });

  describe('buildPushPayload', () => {
    it('creates payload with title and body', () => {
      const payload = buildPushPayload('Test Title', 'Test Body');
      expect(payload.title).toBe('Test Title');
      expect(payload.body).toBe('Test Body');
    });

    it('includes url when provided', () => {
      const payload = buildPushPayload('T', 'B', '/card/123');
      expect(payload.url).toBe('/card/123');
    });

    it('includes default icon', () => {
      const payload = buildPushPayload('T', 'B');
      expect(payload.icon).toBeTruthy();
    });

    it('url is undefined when not provided', () => {
      const payload = buildPushPayload('T', 'B');
      expect(payload.url).toBeUndefined();
    });
  });

  describe('function signatures', () => {
    it('subscribe takes 3 args', () => { expect(subscribe.length).toBe(3); });
    it('unsubscribe takes 3 args', () => { expect(unsubscribe.length).toBe(3); });
    it('getSubscriptions takes 2 args', () => { expect(getSubscriptions.length).toBe(2); });
    it('sendPush takes 3 args', () => { expect(sendPush.length).toBe(3); });
  });

  describe('buildPushPayload serialization', () => {
    it('payload can be JSON.stringify\'d', () => {
      const payload = buildPushPayload('Notification', 'You have a new task');
      const json = JSON.stringify(payload);
      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(parsed.title).toBe('Notification');
      expect(parsed.body).toBe('You have a new task');
    });

    it('with all 3 args includes all properties', () => {
      const payload = buildPushPayload('Title', 'Body text', '/boards/123');
      expect(payload).toHaveProperty('title', 'Title');
      expect(payload).toHaveProperty('body', 'Body text');
      expect(payload).toHaveProperty('url', '/boards/123');
      expect(payload).toHaveProperty('icon');
    });
  });
});
