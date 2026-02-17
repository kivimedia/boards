import { describe, it, expect } from 'vitest';
import {
  BACKUP_TABLES,
  calculateChecksum,
  createManifest,
  validateBackup,
  formatBytes,
} from '@/lib/backup-engine';

describe('Backup Engine (P1.8)', () => {
  // ===========================================================================
  // BACKUP_TABLES
  // ===========================================================================

  describe('BACKUP_TABLES', () => {
    it('contains expected core tables', () => {
      const coreTables = ['boards', 'cards', 'lists', 'labels', 'comments'];
      for (const table of coreTables) {
        expect(BACKUP_TABLES).toContain(table);
      }
    });

    it('contains P1.1 tables (checklists, checklist_items, attachments, activity_log, custom_field_definitions, custom_field_values)', () => {
      const p11Tables = [
        'checklists',
        'checklist_items',
        'attachments',
        'activity_log',
        'custom_field_definitions',
        'custom_field_values',
      ];
      for (const table of p11Tables) {
        expect(BACKUP_TABLES).toContain(table);
      }
    });

    it('contains P1.2 tables (board_members, column_move_rules)', () => {
      const p12Tables = ['board_members', 'column_move_rules'];
      for (const table of p12Tables) {
        expect(BACKUP_TABLES).toContain(table);
      }
    });

    it('contains P1.3 tables (automation_rules, automation_log)', () => {
      const p13Tables = ['automation_rules', 'automation_log'];
      for (const table of p13Tables) {
        expect(BACKUP_TABLES).toContain(table);
      }
    });

    it('contains P1.4 tables (briefing_templates, card_briefs)', () => {
      const p14Tables = ['briefing_templates', 'card_briefs'];
      for (const table of p14Tables) {
        expect(BACKUP_TABLES).toContain(table);
      }
    });

    it('contains P1.5 tables (clients, credential_entries, doors, door_keys, map_sections, training_assignments)', () => {
      const p15Tables = [
        'clients',
        'credential_entries',
        'doors',
        'door_keys',
        'map_sections',
        'training_assignments',
      ];
      for (const table of p15Tables) {
        expect(BACKUP_TABLES).toContain(table);
      }
    });

    it('contains P1.6 tables (notifications, notification_preferences, handoff_rules, onboarding_templates)', () => {
      const p16Tables = [
        'notifications',
        'notification_preferences',
        'handoff_rules',
        'onboarding_templates',
      ];
      for (const table of p16Tables) {
        expect(BACKUP_TABLES).toContain(table);
      }
    });

    it('contains P1.7 tables (migration_jobs, migration_entity_map)', () => {
      const p17Tables = ['migration_jobs', 'migration_entity_map'];
      for (const table of p17Tables) {
        expect(BACKUP_TABLES).toContain(table);
      }
    });

    it('has exactly 36 tables', () => {
      expect(BACKUP_TABLES).toHaveLength(36);
    });
  });

  // ===========================================================================
  // calculateChecksum
  // ===========================================================================

  describe('calculateChecksum', () => {
    it('returns a string prefixed with sha256:', () => {
      const result = calculateChecksum('hello');
      expect(result).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('same input produces the same checksum', () => {
      const input = 'test data for checksum';
      const first = calculateChecksum(input);
      const second = calculateChecksum(input);
      expect(first).toBe(second);
    });

    it('different inputs produce different checksums', () => {
      const a = calculateChecksum('input A');
      const b = calculateChecksum('input B');
      expect(a).not.toBe(b);
    });

    it('handles empty string', () => {
      const result = calculateChecksum('');
      expect(result).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('handles large strings', () => {
      const largeInput = 'x'.repeat(1_000_000);
      const result = calculateChecksum(largeInput);
      expect(result).toMatch(/^sha256:[a-f0-9]{64}$/);
    });
  });

  // ===========================================================================
  // createManifest
  // ===========================================================================

  describe('createManifest', () => {
    it('creates manifest with correct structure', () => {
      const tableCounts = { boards: 5, cards: 20, lists: 10 };
      const manifest = createManifest(tableCounts, 3, 'sha256:abc123');

      expect(manifest).toHaveProperty('tables');
      expect(manifest).toHaveProperty('storage_files');
      expect(manifest).toHaveProperty('checksum');
      expect(manifest).toHaveProperty('backup_version');
      expect(manifest).toHaveProperty('created_at');
    });

    it('includes all provided table counts', () => {
      const tableCounts = { boards: 5, cards: 20, lists: 10, labels: 8 };
      const manifest = createManifest(tableCounts, 0, 'sha256:abc');

      expect(manifest.tables).toEqual(tableCounts);
      expect(manifest.tables.boards).toBe(5);
      expect(manifest.tables.cards).toBe(20);
      expect(manifest.tables.lists).toBe(10);
      expect(manifest.tables.labels).toBe(8);
    });

    it('has backup_version as a string', () => {
      const manifest = createManifest({}, 0, 'sha256:test');
      expect(typeof manifest.backup_version).toBe('string');
      expect(manifest.backup_version).toBeTruthy();
    });

    it('has created_at as a valid ISO string', () => {
      const manifest = createManifest({}, 0, 'sha256:test');
      expect(typeof manifest.created_at).toBe('string');
      // Verify it parses to a valid date
      const parsed = new Date(manifest.created_at);
      expect(parsed.getTime()).not.toBeNaN();
    });

    it('stores storage_files count correctly', () => {
      const manifest = createManifest({}, 42, 'sha256:test');
      expect(manifest.storage_files).toBe(42);
    });

    it('stores checksum correctly', () => {
      const checksum = 'sha256:deadbeef';
      const manifest = createManifest({}, 0, checksum);
      expect(manifest.checksum).toBe(checksum);
    });
  });

  // ===========================================================================
  // validateBackup
  // ===========================================================================

  describe('validateBackup', () => {
    it('returns true for matching checksum', () => {
      const data = 'my backup payload';
      const checksum = calculateChecksum(data);
      expect(validateBackup(data, checksum)).toBe(true);
    });

    it('returns false for mismatched checksum', () => {
      const data = 'my backup payload';
      const wrongChecksum = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
      expect(validateBackup(data, wrongChecksum)).toBe(false);
    });

    it('works with actual calculateChecksum output', () => {
      const payload = JSON.stringify({ tables: { boards: [{ id: '1' }] } });
      const checksum = calculateChecksum(payload);
      expect(validateBackup(payload, checksum)).toBe(true);

      // Tamper with data
      const tamperedPayload = JSON.stringify({ tables: { boards: [{ id: '2' }] } });
      expect(validateBackup(tamperedPayload, checksum)).toBe(false);
    });
  });

  // ===========================================================================
  // formatBytes
  // ===========================================================================

  describe('formatBytes', () => {
    it("formats 0 bytes as '0 B'", () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('formats bytes correctly (values under 1 KB)', () => {
      expect(formatBytes(500)).toBe('500 B');
    });

    it('formats 1024 bytes as 1.0 KB', () => {
      expect(formatBytes(1024)).toBe('1.0 KB');
    });

    it('formats kilobytes correctly', () => {
      // 1536 = 1.5 * 1024
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('formats megabytes correctly', () => {
      // 1 MB = 1024 * 1024 = 1048576
      expect(formatBytes(1048576)).toBe('1.0 MB');
    });

    it('formats gigabytes correctly', () => {
      // 1 GB = 1024^3 = 1073741824
      expect(formatBytes(1073741824)).toBe('1.0 GB');
    });
  });
});
