import { describe, it, expect } from 'vitest';
import {
  TICKET_ROUTING_MAP,
  TICKET_TYPE_LABELS,
  CLIENT_STATUS_LABELS,
} from '../../lib/client-portal';
import type { ClientTicketType, BoardType } from '@/lib/types';

/**
 * Tests for the client-portal library constants and routing maps (P2.4).
 *
 * These tests verify that the exported maps cover every ticket type, that
 * labels are present for all statuses, and that the ticket-to-board routing
 * resolves to the correct department board type.
 */

describe('Client Portal Library (P2.4)', () => {
  // ===========================================================================
  // All 6 ticket types used throughout the tests
  // ===========================================================================

  const ALL_TICKET_TYPES: ClientTicketType[] = [
    'design',
    'bug',
    'dev',
    'content',
    'video',
    'general',
  ];

  // ===========================================================================
  // TICKET_ROUTING_MAP
  // ===========================================================================

  describe('TICKET_ROUTING_MAP', () => {
    it('maps all 6 ticket types to valid board types', () => {
      const validBoardTypes: BoardType[] = [
        'dev',
        'training',
        'account_manager',
        'graphic_designer',
        'executive_assistant',
        'video_editor',
        'copy',
        'client_strategy_map',
      ];

      for (const ticketType of ALL_TICKET_TYPES) {
        const boardType = TICKET_ROUTING_MAP[ticketType];
        expect(boardType).toBeDefined();
        expect(validBoardTypes).toContain(boardType);
      }
    });

    it('has exactly 6 entries', () => {
      expect(Object.keys(TICKET_ROUTING_MAP)).toHaveLength(6);
    });

    it('routes design tickets to graphic_designer board', () => {
      expect(TICKET_ROUTING_MAP.design).toBe('graphic_designer');
    });

    it('routes bug tickets to dev board', () => {
      expect(TICKET_ROUTING_MAP.bug).toBe('dev');
    });

    it('routes dev tickets to dev board', () => {
      expect(TICKET_ROUTING_MAP.dev).toBe('dev');
    });

    it('routes content tickets to copy board', () => {
      expect(TICKET_ROUTING_MAP.content).toBe('copy');
    });

    it('routes video tickets to video_editor board', () => {
      expect(TICKET_ROUTING_MAP.video).toBe('video_editor');
    });

    it('routes general tickets to account_manager board', () => {
      expect(TICKET_ROUTING_MAP.general).toBe('account_manager');
    });
  });

  // ===========================================================================
  // TICKET_TYPE_LABELS
  // ===========================================================================

  describe('TICKET_TYPE_LABELS', () => {
    it('has labels for all 6 ticket types', () => {
      for (const ticketType of ALL_TICKET_TYPES) {
        const label = TICKET_TYPE_LABELS[ticketType];
        expect(label).toBeDefined();
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(0);
      }
    });

    it('has exactly 6 entries', () => {
      expect(Object.keys(TICKET_TYPE_LABELS)).toHaveLength(6);
    });

    it('returns human-readable labels', () => {
      expect(TICKET_TYPE_LABELS.design).toBe('Design Request');
      expect(TICKET_TYPE_LABELS.bug).toBe('Bug Report');
      expect(TICKET_TYPE_LABELS.dev).toBe('Development Request');
      expect(TICKET_TYPE_LABELS.content).toBe('Content Request');
      expect(TICKET_TYPE_LABELS.video).toBe('Video Request');
      expect(TICKET_TYPE_LABELS.general).toBe('General Request');
    });
  });

  // ===========================================================================
  // CLIENT_STATUS_LABELS
  // ===========================================================================

  describe('CLIENT_STATUS_LABELS', () => {
    const ALL_CLIENT_STATUSES = [
      'in_progress',
      'ready_for_review',
      'approved',
      'delivered',
      'revision_requested',
    ];

    it('has labels for all client statuses', () => {
      for (const status of ALL_CLIENT_STATUSES) {
        const label = CLIENT_STATUS_LABELS[status];
        expect(label).toBeDefined();
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(0);
      }
    });

    it('has exactly 5 entries', () => {
      expect(Object.keys(CLIENT_STATUS_LABELS)).toHaveLength(5);
    });

    it('returns human-readable labels', () => {
      expect(CLIENT_STATUS_LABELS.in_progress).toBe('In Progress');
      expect(CLIENT_STATUS_LABELS.ready_for_review).toBe('Ready for Review');
      expect(CLIENT_STATUS_LABELS.approved).toBe('Approved');
      expect(CLIENT_STATUS_LABELS.delivered).toBe('Delivered');
      expect(CLIENT_STATUS_LABELS.revision_requested).toBe('Revision Requested');
    });
  });

  // ===========================================================================
  // Ticket type to board type mapping correctness
  // ===========================================================================

  describe('Ticket type to board type expected mappings', () => {
    const expectedMappings: Record<ClientTicketType, BoardType> = {
      design: 'graphic_designer',
      bug: 'dev',
      dev: 'dev',
      content: 'copy',
      video: 'video_editor',
      general: 'account_manager',
    };

    it('matches the complete expected routing table', () => {
      expect(TICKET_ROUTING_MAP).toEqual(expectedMappings);
    });

    it.each(
      Object.entries(expectedMappings).map(([ticket, board]) => ({
        ticketType: ticket as ClientTicketType,
        expectedBoard: board as BoardType,
      }))
    )(
      '$ticketType -> $expectedBoard',
      ({ ticketType, expectedBoard }) => {
        expect(TICKET_ROUTING_MAP[ticketType]).toBe(expectedBoard);
      }
    );
  });
});
