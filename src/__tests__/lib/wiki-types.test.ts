import { describe, it, expect } from 'vitest';
import type { WikiPage, WikiPageVersion, BoardWikiPin } from '../../lib/types';

describe('Wiki Types (P2.8)', () => {
  // ===========================================================================
  // WikiPage — required fields
  // ===========================================================================

  describe('WikiPage', () => {
    it('has all required fields', () => {
      const page: WikiPage = {
        id: 'wiki-001',
        title: 'Onboarding Guide',
        slug: 'onboarding-guide',
        content: '<h1>Welcome</h1><p>Getting started with the platform.</p>',
        department: 'general',
        is_published: true,
        owner_id: 'user-abc',
        review_cadence_days: 30,
        last_reviewed_at: '2025-06-01T10:00:00Z',
        next_review_at: '2025-07-01T10:00:00Z',
        tags: ['onboarding', 'getting-started'],
        parent_page_id: null,
        position: 0,
        created_at: '2025-05-15T08:00:00Z',
        updated_at: '2025-06-01T10:00:00Z',
      };

      expect(page.id).toBe('wiki-001');
      expect(page.title).toBe('Onboarding Guide');
      expect(page.slug).toBe('onboarding-guide');
      expect(page.content).toContain('<h1>Welcome</h1>');
      expect(page.department).toBe('general');
      expect(page.is_published).toBe(true);
      expect(page.owner_id).toBe('user-abc');
      expect(page.review_cadence_days).toBe(30);
      expect(page.last_reviewed_at).toBe('2025-06-01T10:00:00Z');
      expect(page.next_review_at).toBe('2025-07-01T10:00:00Z');
      expect(page.tags).toEqual(['onboarding', 'getting-started']);
      expect(page.parent_page_id).toBeNull();
      expect(page.position).toBe(0);
      expect(page.created_at).toBe('2025-05-15T08:00:00Z');
      expect(page.updated_at).toBe('2025-06-01T10:00:00Z');
    });

    it('allows null optional fields', () => {
      const page: WikiPage = {
        id: 'wiki-002',
        title: 'Draft Page',
        slug: 'draft-page',
        content: '',
        department: null,
        is_published: false,
        owner_id: null,
        review_cadence_days: null,
        last_reviewed_at: null,
        next_review_at: null,
        tags: [],
        parent_page_id: null,
        position: 1,
        created_at: '2025-07-01T00:00:00Z',
        updated_at: '2025-07-01T00:00:00Z',
      };

      expect(page.department).toBeNull();
      expect(page.owner_id).toBeNull();
      expect(page.review_cadence_days).toBeNull();
      expect(page.last_reviewed_at).toBeNull();
      expect(page.next_review_at).toBeNull();
      expect(page.parent_page_id).toBeNull();
      expect(page.tags).toEqual([]);
      expect(page.is_published).toBe(false);
    });

    it('supports department-specific pages', () => {
      const page: WikiPage = {
        id: 'wiki-003',
        title: 'Dev Team SOPs',
        slug: 'dev-team-sops',
        content: '<p>Standard operating procedures for the dev team.</p>',
        department: 'dev',
        is_published: true,
        owner_id: 'user-dev-lead',
        review_cadence_days: 90,
        last_reviewed_at: null,
        next_review_at: null,
        tags: ['sop', 'dev'],
        parent_page_id: 'wiki-001',
        position: 2,
        created_at: '2025-08-01T00:00:00Z',
        updated_at: '2025-08-01T00:00:00Z',
      };

      expect(page.department).toBe('dev');
      expect(page.parent_page_id).toBe('wiki-001');
    });
  });

  // ===========================================================================
  // WikiPageVersion — required fields
  // ===========================================================================

  describe('WikiPageVersion', () => {
    it('has all required fields', () => {
      const version: WikiPageVersion = {
        id: 'ver-001',
        page_id: 'wiki-001',
        version_number: 1,
        title: 'Onboarding Guide',
        content: '<h1>Welcome</h1><p>Initial content.</p>',
        change_summary: 'Initial version',
        edited_by: 'user-abc',
        created_at: '2025-05-15T08:00:00Z',
      };

      expect(version.id).toBe('ver-001');
      expect(version.page_id).toBe('wiki-001');
      expect(version.version_number).toBe(1);
      expect(version.title).toBe('Onboarding Guide');
      expect(version.content).toContain('<h1>Welcome</h1>');
      expect(version.change_summary).toBe('Initial version');
      expect(version.edited_by).toBe('user-abc');
      expect(version.created_at).toBe('2025-05-15T08:00:00Z');
    });

    it('allows null optional fields', () => {
      const version: WikiPageVersion = {
        id: 'ver-002',
        page_id: 'wiki-001',
        version_number: 2,
        title: 'Onboarding Guide (Updated)',
        content: '<h1>Welcome</h1><p>Updated content.</p>',
        change_summary: null,
        edited_by: null,
        created_at: '2025-06-01T10:00:00Z',
      };

      expect(version.change_summary).toBeNull();
      expect(version.edited_by).toBeNull();
    });

    it('version_number is a positive integer', () => {
      const version: WikiPageVersion = {
        id: 'ver-003',
        page_id: 'wiki-001',
        version_number: 5,
        title: 'Onboarding Guide v5',
        content: 'Fifth revision',
        change_summary: 'Major rewrite',
        edited_by: 'user-xyz',
        created_at: '2025-09-01T00:00:00Z',
      };

      expect(version.version_number).toBeGreaterThan(0);
      expect(Number.isInteger(version.version_number)).toBe(true);
    });
  });

  // ===========================================================================
  // BoardWikiPin — required fields
  // ===========================================================================

  describe('BoardWikiPin', () => {
    it('has all required fields', () => {
      const pin: BoardWikiPin = {
        id: 'pin-001',
        board_id: 'board-abc',
        page_id: 'wiki-001',
        position: 0,
        pinned_by: 'user-abc',
        created_at: '2025-06-15T12:00:00Z',
      };

      expect(pin.id).toBe('pin-001');
      expect(pin.board_id).toBe('board-abc');
      expect(pin.page_id).toBe('wiki-001');
      expect(pin.position).toBe(0);
      expect(pin.pinned_by).toBe('user-abc');
      expect(pin.created_at).toBe('2025-06-15T12:00:00Z');
    });

    it('allows null pinned_by', () => {
      const pin: BoardWikiPin = {
        id: 'pin-002',
        board_id: 'board-xyz',
        page_id: 'wiki-002',
        position: 1,
        pinned_by: null,
        created_at: '2025-07-01T00:00:00Z',
      };

      expect(pin.pinned_by).toBeNull();
    });

    it('position is a non-negative number', () => {
      const pin: BoardWikiPin = {
        id: 'pin-003',
        board_id: 'board-abc',
        page_id: 'wiki-003',
        position: 5,
        pinned_by: 'user-abc',
        created_at: '2025-08-01T00:00:00Z',
      };

      expect(pin.position).toBeGreaterThanOrEqual(0);
      expect(typeof pin.position).toBe('number');
    });

    it('references valid board and page IDs', () => {
      const pin: BoardWikiPin = {
        id: 'pin-004',
        board_id: 'board-def',
        page_id: 'wiki-004',
        position: 0,
        pinned_by: 'user-xyz',
        created_at: '2025-09-01T00:00:00Z',
      };

      expect(typeof pin.board_id).toBe('string');
      expect(typeof pin.page_id).toBe('string');
      expect(pin.board_id.length).toBeGreaterThan(0);
      expect(pin.page_id.length).toBeGreaterThan(0);
    });
  });
});
