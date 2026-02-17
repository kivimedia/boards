import { describe, it, expect } from 'vitest';
import type {
  Client,
  ClientContact,
  CredentialEntry,
  CredentialDecrypted,
  CredentialAuditLogEntry,
  TrainingAssignment,
  TrainingStatus,
  Door,
  DoorKey,
  DoorStatus,
  MapSection,
  MapSectionType,
} from '@/lib/types';

describe('Client Strategy Map Types', () => {
  describe('Client', () => {
    it('has correct shape with contacts array', () => {
      const client: Client = {
        id: 'c-1',
        name: 'Acme Corp',
        company: 'Acme Inc.',
        contacts: [
          { name: 'John Doe', email: 'john@acme.com', phone: '+1234567890', role: 'CEO' },
          { name: 'Jane Smith', email: 'jane@acme.com' },
        ],
        client_tag: 'acme',
        contract_type: 'Monthly Retainer',
        notes: 'Important client',
        created_by: 'user-1',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      expect(client.contacts).toHaveLength(2);
      expect(client.contacts[0].role).toBe('CEO');
      expect(client.contacts[1].phone).toBeUndefined();
    });

    it('allows nullable fields', () => {
      const client: Client = {
        id: 'c-2',
        name: 'Minimal Client',
        company: null,
        contacts: [],
        client_tag: null,
        contract_type: null,
        notes: null,
        created_by: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      expect(client.company).toBeNull();
      expect(client.contacts).toEqual([]);
    });
  });

  describe('CredentialEntry', () => {
    it('has correct shape with encrypted fields', () => {
      const cred: CredentialEntry = {
        id: 'cred-1',
        client_id: 'c-1',
        platform: 'Google Ads',
        username_encrypted: 'hex-encrypted-username',
        password_encrypted: 'hex-encrypted-password',
        notes_encrypted: null,
        category: 'advertising',
        created_by: 'user-1',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      expect(cred.platform).toBe('Google Ads');
      expect(cred.category).toBe('advertising');
    });
  });

  describe('CredentialDecrypted', () => {
    it('has plaintext fields instead of encrypted', () => {
      const cred: CredentialDecrypted = {
        id: 'cred-1',
        client_id: 'c-1',
        platform: 'Google Ads',
        username: 'admin@acme.com',
        password: 'secret123',
        notes: 'Main account',
        category: 'advertising',
        created_by: 'user-1',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      expect(cred.username).toBe('admin@acme.com');
      expect(cred.password).toBe('secret123');
    });
  });

  describe('CredentialAuditLogEntry', () => {
    it('has correct shape', () => {
      const entry: CredentialAuditLogEntry = {
        id: 'audit-1',
        credential_id: 'cred-1',
        user_id: 'user-1',
        action: 'viewed',
        ip_address: '192.168.1.1',
        created_at: '2025-01-01T00:00:00Z',
      };
      expect(entry.action).toBe('viewed');
    });

    it('supports all action types', () => {
      const actions: CredentialAuditLogEntry['action'][] = ['viewed', 'created', 'updated', 'deleted'];
      expect(actions).toHaveLength(4);
    });
  });

  describe('TrainingAssignment', () => {
    it('has correct shape', () => {
      const training: TrainingAssignment = {
        id: 't-1',
        client_id: 'c-1',
        title: 'Onboarding Training',
        description: 'Complete the onboarding training',
        video_url: 'https://example.com/video',
        prompt: 'Watch and summarize key takeaways',
        status: 'pending',
        submission: null,
        feedback: null,
        assigned_to: 'user-2',
        assigned_by: 'user-1',
        due_date: '2025-02-01T00:00:00Z',
        completed_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      expect(training.status).toBe('pending');
    });

    it('supports all training statuses', () => {
      const statuses: TrainingStatus[] = ['pending', 'in_progress', 'submitted', 'reviewed', 'completed'];
      expect(statuses).toHaveLength(5);
    });
  });

  describe('Door', () => {
    it('has correct shape with keys', () => {
      const key1: DoorKey = {
        id: 'dk-1',
        door_id: 'd-1',
        key_number: 1,
        title: 'Set up analytics',
        description: 'Install Google Analytics on client site',
        is_completed: true,
        completed_by: 'user-1',
        completed_at: '2025-01-15T00:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
      };

      const key2: DoorKey = {
        id: 'dk-2',
        door_id: 'd-1',
        key_number: 2,
        title: 'Set up reporting',
        description: null,
        is_completed: false,
        completed_by: null,
        completed_at: null,
        created_at: '2025-01-01T00:00:00Z',
      };

      const door: Door = {
        id: 'd-1',
        client_id: 'c-1',
        door_number: 1,
        title: 'Analytics Setup',
        description: 'Set up all analytics tracking',
        status: 'in_progress',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-15T00:00:00Z',
        keys: [key1, key2],
      };

      expect(door.keys).toHaveLength(2);
      expect(door.keys![0].is_completed).toBe(true);
      expect(door.keys![1].is_completed).toBe(false);
    });

    it('supports all door statuses', () => {
      const statuses: DoorStatus[] = ['locked', 'in_progress', 'completed'];
      expect(statuses).toHaveLength(3);
    });
  });

  describe('Door progress calculation', () => {
    it('calculates progress from keys', () => {
      const keys: DoorKey[] = [
        {
          id: 'dk-1', door_id: 'd-1', key_number: 1, title: 'Key 1',
          description: null, is_completed: true, completed_by: 'u1',
          completed_at: '2025-01-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'dk-2', door_id: 'd-1', key_number: 2, title: 'Key 2',
          description: null, is_completed: true, completed_by: 'u1',
          completed_at: '2025-01-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'dk-3', door_id: 'd-1', key_number: 3, title: 'Key 3',
          description: null, is_completed: false, completed_by: null,
          completed_at: null, created_at: '2025-01-01T00:00:00Z',
        },
      ];

      const completedKeys = keys.filter((k) => k.is_completed).length;
      const totalKeys = keys.length;
      const progress = totalKeys > 0 ? Math.round((completedKeys / totalKeys) * 100) : 0;

      expect(completedKeys).toBe(2);
      expect(totalKeys).toBe(3);
      expect(progress).toBe(67);
    });

    it('returns 0 progress when no keys exist', () => {
      const keys: DoorKey[] = [];
      const progress = keys.length > 0
        ? Math.round((keys.filter((k) => k.is_completed).length / keys.length) * 100)
        : 0;
      expect(progress).toBe(0);
    });

    it('returns 100 progress when all keys completed', () => {
      const keys: DoorKey[] = [
        {
          id: 'dk-1', door_id: 'd-1', key_number: 1, title: 'Key 1',
          description: null, is_completed: true, completed_by: 'u1',
          completed_at: '2025-01-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'dk-2', door_id: 'd-1', key_number: 2, title: 'Key 2',
          description: null, is_completed: true, completed_by: 'u1',
          completed_at: '2025-01-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z',
        },
      ];

      const completedKeys = keys.filter((k) => k.is_completed).length;
      const progress = Math.round((completedKeys / keys.length) * 100);
      expect(progress).toBe(100);
    });
  });

  describe('MapSection', () => {
    it('has correct shape', () => {
      const section: MapSection = {
        id: 'ms-1',
        client_id: 'c-1',
        section_type: 'visual_brief',
        title: 'Brand Visual Brief',
        content: {
          logo_url: 'https://example.com/logo.png',
          primary_color: '#6366f1',
          secondary_color: '#0f172a',
        },
        position: 0,
        is_client_visible: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      expect(section.section_type).toBe('visual_brief');
      expect(section.is_client_visible).toBe(true);
    });

    it('supports all section types', () => {
      const types: MapSectionType[] = [
        'visual_brief',
        'outreach_planner',
        'resources',
        'whiteboard',
        'notes',
      ];
      expect(types).toHaveLength(5);
    });
  });
});
