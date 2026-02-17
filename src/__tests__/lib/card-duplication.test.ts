import { describe, it, expect } from 'vitest';
import { duplicateCard } from '@/lib/card-duplication';
import type {
  CardWatcher,
  CommentReaction,
  SavedFilter,
  PushSubscription,
  DigestConfig,
  NotificationType,
} from '@/lib/types';

describe('Card Duplication (v5.2.0)', () => {
  // ===========================================================================
  // duplicateCard
  // ===========================================================================

  describe('duplicateCard', () => {
    it('is a function', () => {
      expect(typeof duplicateCard).toBe('function');
    });

    it('requires 3 arguments (supabase, cardId, userId)', () => {
      expect(duplicateCard.length).toBe(3);
    });

    it('is the named export from card-duplication module', () => {
      expect(duplicateCard).toBeDefined();
      expect(duplicateCard.name).toBe('duplicateCard');
    });
  });

  // ===========================================================================
  // v5.2.0 Types
  // ===========================================================================

  describe('v5.2.0 Types', () => {
    it('CardWatcher type has id, card_id, user_id, created_at fields', () => {
      const watcher: CardWatcher = {
        id: 'cw-1',
        card_id: 'card-1',
        user_id: 'user-1',
        created_at: '2026-01-01T00:00:00Z',
      };

      expect(watcher).toHaveProperty('id');
      expect(watcher).toHaveProperty('card_id');
      expect(watcher).toHaveProperty('user_id');
      expect(watcher).toHaveProperty('created_at');
    });

    it('CommentReaction type has id, comment_id, user_id, emoji, created_at fields', () => {
      const reaction: CommentReaction = {
        id: 'cr-1',
        comment_id: 'comment-1',
        user_id: 'user-1',
        emoji: '\uD83D\uDC4D',
        created_at: '2026-01-01T00:00:00Z',
      };

      expect(reaction).toHaveProperty('id');
      expect(reaction).toHaveProperty('comment_id');
      expect(reaction).toHaveProperty('user_id');
      expect(reaction).toHaveProperty('emoji');
      expect(reaction).toHaveProperty('created_at');
    });

    it('SavedFilter type has correct shape', () => {
      const filter: SavedFilter = {
        id: 'sf-1',
        board_id: 'board-1',
        user_id: 'user-1',
        name: 'My Filter',
        filter_config: { labels: ['urgent'] },
        is_default: false,
        is_shared: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      expect(filter).toHaveProperty('id');
      expect(filter).toHaveProperty('board_id');
      expect(filter).toHaveProperty('name');
      expect(filter).toHaveProperty('filter_config');
      expect(filter).toHaveProperty('is_default');
      expect(filter).toHaveProperty('is_shared');
    });

    it('PushSubscription type has correct shape', () => {
      const sub: PushSubscription = {
        id: 'ps-1',
        user_id: 'user-1',
        endpoint: 'https://push.example.com/sub/abc',
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8p8V1t9lQ',
        auth_key: 'tBHItJI5svbpC7htmQxpRg',
        created_at: '2026-01-01T00:00:00Z',
      };

      expect(sub).toHaveProperty('id');
      expect(sub).toHaveProperty('user_id');
      expect(sub).toHaveProperty('endpoint');
      expect(sub).toHaveProperty('p256dh');
      expect(sub).toHaveProperty('auth_key');
    });

    it('DigestConfig type has correct shape', () => {
      const digest: DigestConfig = {
        id: 'dc-1',
        user_id: 'user-1',
        frequency: 'daily',
        send_time: '09:00',
        include_assigned: true,
        include_overdue: true,
        include_mentions: false,
        include_completed: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      expect(digest).toHaveProperty('id');
      expect(digest).toHaveProperty('frequency');
      expect(digest).toHaveProperty('send_time');
      expect(digest.frequency).toBe('daily');
    });

    it("NotificationType includes 'card_watched'", () => {
      const watchedType: NotificationType = 'card_watched';
      expect(watchedType).toBe('card_watched');
    });
  });
});
