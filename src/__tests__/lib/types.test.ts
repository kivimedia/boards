import { describe, it, expect } from 'vitest';
import type {
  CardPriority,
  DependencyType,
  CustomFieldType,
  Checklist,
  ChecklistItem,
  Attachment,
  ActivityLogEntry,
  CardDependency,
  CustomFieldDefinition,
  CustomFieldValue,
  Mention,
  CardWithDetails,
  BoardWithLists,
} from '@/lib/types';

describe('P1.1 types', () => {
  it('CardPriority has correct values', () => {
    const priorities: CardPriority[] = ['urgent', 'high', 'medium', 'low', 'none'];
    expect(priorities).toHaveLength(5);
  });

  it('DependencyType has correct values', () => {
    const types: DependencyType[] = ['blocked_by', 'blocking', 'related'];
    expect(types).toHaveLength(3);
  });

  it('CustomFieldType has correct values', () => {
    const types: CustomFieldType[] = ['text', 'number', 'dropdown', 'date', 'checkbox', 'url'];
    expect(types).toHaveLength(6);
  });

  it('Checklist shape is correct', () => {
    const checklist: Checklist = {
      id: '1',
      card_id: 'c1',
      title: 'Test Checklist',
      position: 0,
      created_at: '2025-01-01T00:00:00Z',
      items: [],
    };
    expect(checklist.title).toBe('Test Checklist');
    expect(checklist.items).toEqual([]);
  });

  it('ChecklistItem shape is correct', () => {
    const item: ChecklistItem = {
      id: '1',
      checklist_id: 'cl1',
      content: 'Do the thing',
      is_completed: false,
      position: 0,
      completed_by: null,
      completed_at: null,
      created_at: '2025-01-01T00:00:00Z',
    };
    expect(item.is_completed).toBe(false);
    expect(item.completed_by).toBeNull();
  });

  it('Attachment shape is correct', () => {
    const attachment: Attachment = {
      id: '1',
      card_id: 'c1',
      file_name: 'design.png',
      file_size: 1024000,
      mime_type: 'image/png',
      storage_path: 'c1/123_design.png',
      uploaded_by: 'u1',
      version: 1,
      parent_attachment_id: null,
      created_at: '2025-01-01T00:00:00Z',
    };
    expect(attachment.file_size).toBe(1024000);
    expect(attachment.mime_type).toBe('image/png');
  });

  it('ActivityLogEntry shape is correct', () => {
    const entry: ActivityLogEntry = {
      id: '1',
      card_id: 'c1',
      board_id: 'b1',
      user_id: 'u1',
      event_type: 'checklist_created',
      metadata: { checklist_title: 'Test' },
      created_at: '2025-01-01T00:00:00Z',
    };
    expect(entry.event_type).toBe('checklist_created');
    expect(entry.metadata).toHaveProperty('checklist_title');
  });

  it('CardDependency shape is correct', () => {
    const dep: CardDependency = {
      id: '1',
      source_card_id: 'c1',
      target_card_id: 'c2',
      dependency_type: 'blocked_by',
      created_by: 'u1',
      created_at: '2025-01-01T00:00:00Z',
    };
    expect(dep.dependency_type).toBe('blocked_by');
  });

  it('CustomFieldDefinition shape is correct', () => {
    const field: CustomFieldDefinition = {
      id: '1',
      board_id: 'b1',
      name: 'Design Type',
      field_type: 'dropdown',
      options: ['Logo', 'Banner', 'Social'],
      is_required: true,
      position: 0,
      created_at: '2025-01-01T00:00:00Z',
    };
    expect(field.field_type).toBe('dropdown');
    expect(field.options).toContain('Logo');
  });

  it('CustomFieldValue shape is correct', () => {
    const value: CustomFieldValue = {
      id: '1',
      card_id: 'c1',
      field_definition_id: 'fd1',
      value: 'Logo',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };
    expect(value.value).toBe('Logo');
  });

  it('Mention shape is correct', () => {
    const mention: Mention = {
      id: '1',
      comment_id: 'cm1',
      user_id: 'u1',
      created_at: '2025-01-01T00:00:00Z',
    };
    expect(mention.comment_id).toBe('cm1');
  });

  it('CardWithDetails includes P1.1 optional fields', () => {
    const card: CardWithDetails = {
      id: '1',
      title: 'Test Card',
      description: 'A test',
      due_date: null,
      start_date: null,
      priority: 'high',
      cover_image_url: null,
      size: 'medium',
      client_id: null,
      is_client_visible: false,
      client_status: null,
      client_ticket_type: null,
      approval_status: null,
      created_by: 'u1',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      placements: [],
      labels: [],
      assignees: [],
      comments: [],
      checklists: [],
      attachments: [],
      activity_log: [],
      dependencies: [],
      custom_field_values: [],
    };
    expect(card.priority).toBe('high');
    expect(card.checklists).toEqual([]);
    expect(card.attachments).toEqual([]);
  });

  it('BoardWithLists includes optional custom_field_definitions', () => {
    const board: BoardWithLists = {
      id: '1',
      name: 'Test Board',
      type: 'dev',
      created_by: 'u1',
      created_at: '2025-01-01T00:00:00Z',
      is_archived: false,
      is_starred: false,
      lists: [],
      labels: [],
      custom_field_definitions: [
        {
          id: 'fd1',
          board_id: '1',
          name: 'Story Points',
          field_type: 'number',
          options: [],
          is_required: false,
          position: 0,
          created_at: '2025-01-01T00:00:00Z',
        },
      ],
    };
    expect(board.custom_field_definitions).toHaveLength(1);
  });
});
