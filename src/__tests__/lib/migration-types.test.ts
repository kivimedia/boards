import { describe, it, expect } from 'vitest';
import type {
  MigrationJob,
  MigrationEntityMap,
  MigrationStatus,
  MigrationEntityType,
  MigrationReport,
  MigrationJobConfig,
  TrelloBoard,
  TrelloCard,
  TrelloList,
  TrelloLabel,
  TrelloComment,
  TrelloChecklist,
  TrelloCheckItem,
  TrelloAttachment,
} from '@/lib/types';

describe('P1.7 Migration Types', () => {
  // =========================================================================
  // MigrationStatus
  // =========================================================================

  describe('MigrationStatus', () => {
    it('has all 5 values', () => {
      const statuses: MigrationStatus[] = [
        'pending',
        'running',
        'completed',
        'failed',
        'cancelled',
      ];
      expect(statuses).toHaveLength(5);
    });
  });

  // =========================================================================
  // MigrationEntityType
  // =========================================================================

  describe('MigrationEntityType', () => {
    it('has all 9 values', () => {
      const types: MigrationEntityType[] = [
        'board',
        'list',
        'card',
        'label',
        'comment',
        'attachment',
        'member',
        'checklist',
        'checklist_item',
      ];
      expect(types).toHaveLength(9);
    });
  });

  // =========================================================================
  // MigrationReport
  // =========================================================================

  describe('MigrationReport', () => {
    it('has correct shape with all counter fields', () => {
      const report: MigrationReport = {
        boards_created: 2,
        lists_created: 10,
        cards_created: 50,
        comments_created: 120,
        attachments_created: 15,
        labels_created: 8,
        checklists_created: 5,
        errors: ['Some error occurred'],
      };

      expect(report.boards_created).toBe(2);
      expect(report.lists_created).toBe(10);
      expect(report.cards_created).toBe(50);
      expect(report.comments_created).toBe(120);
      expect(report.attachments_created).toBe(15);
      expect(report.labels_created).toBe(8);
      expect(report.checklists_created).toBe(5);
      expect(report.errors).toHaveLength(1);
    });

    it('allows empty errors array', () => {
      const report: MigrationReport = {
        boards_created: 0,
        lists_created: 0,
        cards_created: 0,
        comments_created: 0,
        attachments_created: 0,
        labels_created: 0,
        checklists_created: 0,
        errors: [],
      };
      expect(report.errors).toEqual([]);
    });
  });

  // =========================================================================
  // MigrationJobConfig
  // =========================================================================

  describe('MigrationJobConfig', () => {
    it('has required fields', () => {
      const config: MigrationJobConfig = {
        trello_api_key: 'key-abc123',
        trello_token: 'token-xyz789',
        board_ids: ['trello-board-1', 'trello-board-2'],
        board_type_mapping: {
          'trello-board-1': 'dev',
          'trello-board-2': 'graphic_designer',
        },
        user_mapping: {
          'trello-member-1': 'supabase-user-1',
        },
      };

      expect(config.trello_api_key).toBe('key-abc123');
      expect(config.trello_token).toBe('token-xyz789');
      expect(config.board_ids).toHaveLength(2);
      expect(config.board_type_mapping['trello-board-1']).toBe('dev');
      expect(config.user_mapping['trello-member-1']).toBe('supabase-user-1');
    });
  });

  // =========================================================================
  // MigrationJob
  // =========================================================================

  describe('MigrationJob', () => {
    it('has correct shape', () => {
      const job: MigrationJob = {
        id: 'job-1',
        type: 'trello',
        status: 'pending',
        config: {
          trello_api_key: 'key-123',
          trello_token: 'token-456',
          board_ids: ['b-1'],
          board_type_mapping: { 'b-1': 'dev' },
          user_mapping: {},
        },
        progress: { current: 0, total: 6, phase: 'pending' },
        report: {
          boards_created: 0,
          lists_created: 0,
          cards_created: 0,
          comments_created: 0,
          attachments_created: 0,
          labels_created: 0,
          checklists_created: 0,
          errors: [],
        },
        error_message: null,
        started_by: 'user-1',
        started_at: null,
        completed_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      expect(job.id).toBe('job-1');
      expect(job.type).toBe('trello');
      expect(job.status).toBe('pending');
      expect(job.config.board_ids).toContain('b-1');
      expect(job.progress.current).toBe(0);
      expect(job.report.boards_created).toBe(0);
      expect(job.error_message).toBeNull();
      expect(job.started_at).toBeNull();
      expect(job.completed_at).toBeNull();
    });
  });

  // =========================================================================
  // MigrationEntityMap
  // =========================================================================

  describe('MigrationEntityMap', () => {
    it('has correct shape', () => {
      const entityMap: MigrationEntityMap = {
        id: 'map-1',
        job_id: 'job-1',
        source_type: 'card',
        source_id: 'trello-card-123',
        target_id: 'agency-card-456',
        metadata: { original_name: 'My Trello Card' },
        created_at: '2025-01-01T00:00:00Z',
      };

      expect(entityMap.id).toBe('map-1');
      expect(entityMap.job_id).toBe('job-1');
      expect(entityMap.source_type).toBe('card');
      expect(entityMap.source_id).toBe('trello-card-123');
      expect(entityMap.target_id).toBe('agency-card-456');
      expect(entityMap.metadata).toHaveProperty('original_name');
    });
  });

  // =========================================================================
  // Trello API Types
  // =========================================================================

  describe('TrelloBoard', () => {
    it('has correct shape', () => {
      const board: TrelloBoard = {
        id: 'tb-1',
        name: 'My Trello Board',
        desc: 'A description of the board',
        closed: false,
      };
      expect(board.id).toBe('tb-1');
      expect(board.name).toBe('My Trello Board');
      expect(board.desc).toBe('A description of the board');
      expect(board.closed).toBe(false);
    });
  });

  describe('TrelloList', () => {
    it('has correct shape', () => {
      const list: TrelloList = {
        id: 'tl-1',
        name: 'To Do',
        pos: 16384,
        closed: false,
        idBoard: 'tb-1',
      };
      expect(list.id).toBe('tl-1');
      expect(list.name).toBe('To Do');
      expect(list.pos).toBe(16384);
      expect(list.closed).toBe(false);
      expect(list.idBoard).toBe('tb-1');
    });
  });

  describe('TrelloCard', () => {
    it('has correct shape', () => {
      const card: TrelloCard = {
        id: 'tc-1',
        name: 'Fix login bug',
        desc: 'Users cannot log in with email',
        pos: 32768,
        due: '2025-06-01T12:00:00Z',
        closed: false,
        idList: 'tl-1',
        idBoard: 'tb-1',
        idLabels: ['tlbl-1', 'tlbl-2'],
        idMembers: ['tm-1'],
        idChecklists: ['tcl-1'],
        idAttachmentCover: null,
      };
      expect(card.id).toBe('tc-1');
      expect(card.name).toBe('Fix login bug');
      expect(card.due).toBe('2025-06-01T12:00:00Z');
      expect(card.idLabels).toHaveLength(2);
      expect(card.idMembers).toHaveLength(1);
      expect(card.idChecklists).toHaveLength(1);
    });

    it('allows null due date', () => {
      const card: TrelloCard = {
        id: 'tc-2',
        name: 'No due date card',
        desc: '',
        pos: 1,
        due: null,
        closed: false,
        idList: 'tl-1',
        idBoard: 'tb-1',
        idLabels: [],
        idMembers: [],
        idChecklists: [],
        idAttachmentCover: null,
      };
      expect(card.due).toBeNull();
    });
  });

  describe('TrelloLabel', () => {
    it('has correct shape', () => {
      const label: TrelloLabel = {
        id: 'tlbl-1',
        name: 'Bug',
        color: 'red',
        idBoard: 'tb-1',
      };
      expect(label.id).toBe('tlbl-1');
      expect(label.name).toBe('Bug');
      expect(label.color).toBe('red');
      expect(label.idBoard).toBe('tb-1');
    });
  });

  describe('TrelloComment', () => {
    it('has correct shape', () => {
      const comment: TrelloComment = {
        id: 'tcm-1',
        data: {
          text: 'This needs to be fixed ASAP',
          card: { id: 'tc-1' },
        },
        idMemberCreator: 'tm-1',
        date: '2025-01-15T10:30:00Z',
      };
      expect(comment.id).toBe('tcm-1');
      expect(comment.data.text).toBe('This needs to be fixed ASAP');
      expect(comment.data.card?.id).toBe('tc-1');
      expect(comment.idMemberCreator).toBe('tm-1');
    });

    it('allows missing card in data', () => {
      const comment: TrelloComment = {
        id: 'tcm-2',
        data: {
          text: 'Board-level comment',
        },
        idMemberCreator: 'tm-1',
        date: '2025-01-15T10:30:00Z',
      };
      expect(comment.data.card).toBeUndefined();
    });
  });

  describe('TrelloChecklist', () => {
    it('has correct shape', () => {
      const checklist: TrelloChecklist = {
        id: 'tcl-1',
        name: 'Launch Checklist',
        pos: 16384,
        idCard: 'tc-1',
        checkItems: [
          { id: 'tci-1', name: 'Review code', pos: 1, state: 'complete' },
          { id: 'tci-2', name: 'Deploy to staging', pos: 2, state: 'incomplete' },
        ],
      };
      expect(checklist.id).toBe('tcl-1');
      expect(checklist.name).toBe('Launch Checklist');
      expect(checklist.checkItems).toHaveLength(2);
      expect(checklist.checkItems[0].state).toBe('complete');
      expect(checklist.checkItems[1].state).toBe('incomplete');
    });
  });

  describe('TrelloCheckItem', () => {
    it('has correct shape', () => {
      const item: TrelloCheckItem = {
        id: 'tci-1',
        name: 'Write tests',
        pos: 1,
        state: 'incomplete',
      };
      expect(item.id).toBe('tci-1');
      expect(item.name).toBe('Write tests');
      expect(item.state).toBe('incomplete');
    });

    it("state is either 'complete' or 'incomplete'", () => {
      const complete: TrelloCheckItem = {
        id: 'tci-1',
        name: 'Done item',
        pos: 1,
        state: 'complete',
      };
      const incomplete: TrelloCheckItem = {
        id: 'tci-2',
        name: 'Pending item',
        pos: 2,
        state: 'incomplete',
      };
      expect(complete.state).toBe('complete');
      expect(incomplete.state).toBe('incomplete');
    });
  });

  describe('TrelloAttachment', () => {
    it('has correct shape', () => {
      const attachment: TrelloAttachment = {
        id: 'ta-1',
        name: 'screenshot.png',
        fileName: 'screenshot.png',
        url: 'https://trello.com/attachments/screenshot.png',
        bytes: 204800,
        mimeType: 'image/png',
        date: '2025-01-20T14:00:00Z',
        idMember: 'member-1',
      };
      expect(attachment.id).toBe('ta-1');
      expect(attachment.name).toBe('screenshot.png');
      expect(attachment.url).toContain('trello.com');
      expect(attachment.bytes).toBe(204800);
      expect(attachment.mimeType).toBe('image/png');
    });
  });
});
