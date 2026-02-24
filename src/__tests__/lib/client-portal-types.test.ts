import { describe, it, expect } from 'vitest';
import type {
  ClientTicketType,
  ClientTicketStatus,
  ClientCardStatus,
  ApprovalStatus,
  ClientBoard,
  ClientPortalUser,
  ClientTicket,
  SatisfactionResponse,
  Card,
} from '@/lib/types';

/**
 * Type-shape tests for Client Boards & Portal types (P2.4).
 *
 * These tests verify that the type definitions compile correctly and that
 * sample objects conforming to each interface contain all expected fields.
 * The assertions run at both compile time (TypeScript) and runtime (Vitest).
 */

describe('Client Boards & Portal Types (P2.4)', () => {
  // ===========================================================================
  // ClientTicketType
  // ===========================================================================

  describe('ClientTicketType type', () => {
    it('covers all 6 values', () => {
      const values: ClientTicketType[] = [
        'design',
        'bug',
        'dev',
        'content',
        'video',
        'general',
      ];
      expect(values).toHaveLength(6);
      for (const v of values) {
        expect(typeof v).toBe('string');
      }
    });
  });

  // ===========================================================================
  // ClientTicketStatus
  // ===========================================================================

  describe('ClientTicketStatus type', () => {
    it('covers all 5 values', () => {
      const values: ClientTicketStatus[] = [
        'new',
        'routed',
        'in_progress',
        'completed',
        'closed',
      ];
      expect(values).toHaveLength(5);
      for (const v of values) {
        expect(typeof v).toBe('string');
      }
    });
  });

  // ===========================================================================
  // ClientCardStatus
  // ===========================================================================

  describe('ClientCardStatus type', () => {
    it('covers all 5 values', () => {
      const values: ClientCardStatus[] = [
        'in_progress',
        'ready_for_review',
        'approved',
        'delivered',
        'revision_requested',
      ];
      expect(values).toHaveLength(5);
      for (const v of values) {
        expect(typeof v).toBe('string');
      }
    });
  });

  // ===========================================================================
  // ApprovalStatus
  // ===========================================================================

  describe('ApprovalStatus type', () => {
    it('covers all 4 values', () => {
      const values: ApprovalStatus[] = [
        'pending',
        'approved',
        'rejected',
        'revision_requested',
      ];
      expect(values).toHaveLength(4);
      for (const v of values) {
        expect(typeof v).toBe('string');
      }
    });
  });

  // ===========================================================================
  // ClientBoard
  // ===========================================================================

  describe('ClientBoard interface', () => {
    it('has all required fields', () => {
      const sample: ClientBoard = {
        id: 'cb-1',
        client_id: 'client-abc',
        board_id: 'board-xyz',
        is_active: true,
        settings: { show_kanban: true },
        created_at: '2026-02-01T10:00:00Z',
        updated_at: '2026-02-01T10:00:00Z',
      };

      expect(sample.id).toBe('cb-1');
      expect(sample.client_id).toBe('client-abc');
      expect(sample.board_id).toBe('board-xyz');
      expect(sample.is_active).toBe(true);
      expect(sample.settings).toEqual({ show_kanban: true });
      expect(sample.created_at).toBeDefined();
      expect(sample.updated_at).toBeDefined();
    });
  });

  // ===========================================================================
  // ClientPortalUser
  // ===========================================================================

  describe('ClientPortalUser interface', () => {
    it('has all required fields', () => {
      const sample: ClientPortalUser = {
        id: 'cpu-1',
        client_id: 'client-abc',
        user_id: 'user-123',
        email: 'client@example.com',
        name: 'Jane Doe',
        is_primary_contact: true,
        is_active: true,
        last_login_at: '2026-02-05T09:00:00Z',
        created_at: '2026-01-15T08:00:00Z',
        updated_at: '2026-02-05T09:00:00Z',
      };

      expect(sample.id).toBe('cpu-1');
      expect(sample.client_id).toBe('client-abc');
      expect(sample.user_id).toBe('user-123');
      expect(sample.email).toBe('client@example.com');
      expect(sample.name).toBe('Jane Doe');
      expect(sample.is_primary_contact).toBe(true);
      expect(sample.is_active).toBe(true);
      expect(sample.last_login_at).toBe('2026-02-05T09:00:00Z');
      expect(sample.created_at).toBeDefined();
      expect(sample.updated_at).toBeDefined();
    });

    it('allows null for optional nullable fields', () => {
      const sample: ClientPortalUser = {
        id: 'cpu-2',
        client_id: 'client-def',
        user_id: null,
        email: 'invited@example.com',
        name: 'New User',
        is_primary_contact: false,
        is_active: true,
        last_login_at: null,
        created_at: '2026-02-01T10:00:00Z',
        updated_at: '2026-02-01T10:00:00Z',
      };

      expect(sample.user_id).toBeNull();
      expect(sample.last_login_at).toBeNull();
    });
  });

  // ===========================================================================
  // ClientTicket
  // ===========================================================================

  describe('ClientTicket interface', () => {
    it('has all required fields', () => {
      const sample: ClientTicket = {
        id: 'ct-1',
        client_id: 'client-abc',
        submitted_by: 'user-123',
        ticket_type: 'design',
        title: 'New landing page design',
        description: 'We need a fresh landing page for Q2 campaign.',
        priority: 'high',
        status: 'routed',
        routed_to_card_id: 'card-456',
        routed_to_board_id: 'board-gd-1',
        attachments: [{ name: 'mockup.png', url: 'https://storage.example.com/mockup.png' }],
        created_at: '2026-02-01T10:00:00Z',
        updated_at: '2026-02-01T12:00:00Z',
      };

      expect(sample.id).toBe('ct-1');
      expect(sample.client_id).toBe('client-abc');
      expect(sample.submitted_by).toBe('user-123');
      expect(sample.ticket_type).toBe('design');
      expect(sample.title).toBe('New landing page design');
      expect(sample.description).toBe('We need a fresh landing page for Q2 campaign.');
      expect(sample.priority).toBe('high');
      expect(sample.status).toBe('routed');
      expect(sample.routed_to_card_id).toBe('card-456');
      expect(sample.routed_to_board_id).toBe('board-gd-1');
      expect(sample.attachments).toHaveLength(1);
      expect(sample.created_at).toBeDefined();
      expect(sample.updated_at).toBeDefined();
    });

    it('allows null for optional nullable fields', () => {
      const sample: ClientTicket = {
        id: 'ct-2',
        client_id: 'client-def',
        submitted_by: null,
        ticket_type: 'general',
        title: 'General inquiry',
        description: null,
        priority: 'medium',
        status: 'new',
        routed_to_card_id: null,
        routed_to_board_id: null,
        attachments: [],
        created_at: '2026-02-02T10:00:00Z',
        updated_at: '2026-02-02T10:00:00Z',
      };

      expect(sample.submitted_by).toBeNull();
      expect(sample.description).toBeNull();
      expect(sample.routed_to_card_id).toBeNull();
      expect(sample.routed_to_board_id).toBeNull();
      expect(sample.attachments).toHaveLength(0);
    });
  });

  // ===========================================================================
  // SatisfactionResponse
  // ===========================================================================

  describe('SatisfactionResponse interface', () => {
    it('has all required fields', () => {
      const sample: SatisfactionResponse = {
        id: 'sat-1',
        client_id: 'client-abc',
        card_id: 'card-789',
        submitted_by: 'user-123',
        rating: 5,
        feedback: 'Excellent work on the design!',
        created_at: '2026-02-05T14:00:00Z',
      };

      expect(sample.id).toBe('sat-1');
      expect(sample.client_id).toBe('client-abc');
      expect(sample.card_id).toBe('card-789');
      expect(sample.submitted_by).toBe('user-123');
      expect(sample.rating).toBe(5);
      expect(sample.feedback).toBe('Excellent work on the design!');
      expect(sample.created_at).toBeDefined();
    });

    it('allows null for optional nullable fields', () => {
      const sample: SatisfactionResponse = {
        id: 'sat-2',
        client_id: 'client-def',
        card_id: null,
        submitted_by: null,
        rating: 3,
        feedback: null,
        created_at: '2026-02-06T10:00:00Z',
      };

      expect(sample.card_id).toBeNull();
      expect(sample.submitted_by).toBeNull();
      expect(sample.feedback).toBeNull();
    });
  });

  // ===========================================================================
  // Card interface — client portal fields
  // ===========================================================================

  describe('Card interface includes client portal fields', () => {
    it('has is_client_visible, client_status, client_ticket_type, and approval_status', () => {
      const sample: Card = {
        id: 'card-1',
        title: '[Client] New landing page',
        description: 'Client-submitted design request',
        due_date: '2026-03-01',
        start_date: null,
        priority: 'high',
        cover_image_url: null,
        size: 'medium',
        client_id: 'client-abc',
        is_client_visible: true,
        client_status: 'in_progress',
        client_ticket_type: 'design',
        approval_status: 'pending',
        owner_id: null,
        created_by: 'user-1',
        created_at: '2026-02-01T10:00:00Z',
        updated_at: '2026-02-01T12:00:00Z',
      };

      expect(sample.is_client_visible).toBe(true);
      expect(sample.client_status).toBe('in_progress');
      expect(sample.client_ticket_type).toBe('design');
      expect(sample.approval_status).toBe('pending');
      expect(sample.client_id).toBe('client-abc');
    });

    it('allows null for client portal fields on non-client cards', () => {
      const sample: Card = {
        id: 'card-2',
        title: 'Internal task',
        description: 'This is an internal card, not client-facing.',
        due_date: null,
        start_date: null,
        priority: 'medium',
        cover_image_url: null,
        size: 'medium',
        client_id: null,
        is_client_visible: false,
        client_status: null,
        client_ticket_type: null,
        approval_status: null,
        owner_id: null,
        created_by: 'user-2',
        created_at: '2026-02-02T10:00:00Z',
        updated_at: '2026-02-02T10:00:00Z',
      };

      expect(sample.is_client_visible).toBe(false);
      expect(sample.client_status).toBeNull();
      expect(sample.client_ticket_type).toBeNull();
      expect(sample.approval_status).toBeNull();
      expect(sample.client_id).toBeNull();
    });
  });
});
