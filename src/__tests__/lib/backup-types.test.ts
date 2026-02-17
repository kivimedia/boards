import { describe, it, expect } from 'vitest';
import type {
  BackupType,
  BackupStatus,
  BackupManifest,
  Backup,
} from '@/lib/types';

describe('P1.8 Backup Types', () => {
  // ===========================================================================
  // BackupType
  // ===========================================================================

  describe('BackupType', () => {
    it('has 2 values: full and incremental', () => {
      const types: BackupType[] = ['full', 'incremental'];
      expect(types).toHaveLength(2);
      expect(types).toContain('full');
      expect(types).toContain('incremental');
    });
  });

  // ===========================================================================
  // BackupStatus
  // ===========================================================================

  describe('BackupStatus', () => {
    it('has 4 values: pending, running, completed, failed', () => {
      const statuses: BackupStatus[] = ['pending', 'running', 'completed', 'failed'];
      expect(statuses).toHaveLength(4);
      expect(statuses).toContain('pending');
      expect(statuses).toContain('running');
      expect(statuses).toContain('completed');
      expect(statuses).toContain('failed');
    });
  });

  // ===========================================================================
  // BackupManifest
  // ===========================================================================

  describe('BackupManifest', () => {
    it('has correct shape with all required fields', () => {
      const manifest: BackupManifest = {
        tables: { boards: 5, cards: 20 },
        storage_files: 10,
        checksum: 'sha256:abc123def456',
        backup_version: '1.0.0',
        created_at: '2025-01-01T00:00:00.000Z',
      };

      expect(manifest.tables).toEqual({ boards: 5, cards: 20 });
      expect(manifest.storage_files).toBe(10);
      expect(typeof manifest.checksum).toBe('string');
      expect(typeof manifest.backup_version).toBe('string');
      expect(typeof manifest.created_at).toBe('string');
    });

    it('tables is a Record<string, number>', () => {
      const manifest: BackupManifest = {
        tables: { boards: 3, lists: 10, cards: 50, labels: 8 },
        storage_files: 0,
        checksum: 'sha256:000',
        backup_version: '1.0.0',
        created_at: new Date().toISOString(),
      };

      for (const [key, value] of Object.entries(manifest.tables)) {
        expect(typeof key).toBe('string');
        expect(typeof value).toBe('number');
      }
    });
  });

  // ===========================================================================
  // Backup
  // ===========================================================================

  describe('Backup', () => {
    it('has correct shape with all fields', () => {
      const backup: Backup = {
        id: 'backup-1',
        type: 'full',
        status: 'completed',
        storage_path: 'backups/backup-1.json',
        size_bytes: 1048576,
        manifest: {
          tables: { boards: 5, cards: 20 },
          storage_files: 10,
          checksum: 'sha256:abc123',
          backup_version: '1.0.0',
          created_at: '2025-01-01T00:00:00.000Z',
        },
        error_message: null,
        started_by: 'user-1',
        started_at: '2025-01-01T00:00:00.000Z',
        completed_at: '2025-01-01T00:01:00.000Z',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:01:00.000Z',
      };

      expect(backup.id).toBe('backup-1');
      expect(backup.type).toBe('full');
      expect(backup.status).toBe('completed');
      expect(backup.storage_path).toBe('backups/backup-1.json');
      expect(backup.size_bytes).toBe(1048576);
      expect(backup.manifest.tables).toHaveProperty('boards');
      expect(backup.manifest.checksum).toBeTruthy();
      expect(backup.error_message).toBeNull();
      expect(backup.started_by).toBe('user-1');
      expect(typeof backup.started_at).toBe('string');
      expect(typeof backup.completed_at).toBe('string');
      expect(typeof backup.created_at).toBe('string');
      expect(typeof backup.updated_at).toBe('string');
    });

    it('allows nullable fields to be null', () => {
      const backup: Backup = {
        id: 'backup-2',
        type: 'incremental',
        status: 'pending',
        storage_path: null,
        size_bytes: 0,
        manifest: {
          tables: {},
          storage_files: 0,
          checksum: '',
          backup_version: '1.0.0',
          created_at: '2025-01-01T00:00:00.000Z',
        },
        error_message: null,
        started_by: null,
        started_at: null,
        completed_at: null,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
      };

      expect(backup.storage_path).toBeNull();
      expect(backup.error_message).toBeNull();
      expect(backup.started_by).toBeNull();
      expect(backup.started_at).toBeNull();
      expect(backup.completed_at).toBeNull();
    });

    it('supports failed status with error_message', () => {
      const backup: Backup = {
        id: 'backup-3',
        type: 'full',
        status: 'failed',
        storage_path: null,
        size_bytes: 0,
        manifest: {
          tables: {},
          storage_files: 0,
          checksum: '',
          backup_version: '1.0.0',
          created_at: '2025-01-01T00:00:00.000Z',
        },
        error_message: 'Connection timeout while exporting boards table',
        started_by: 'user-1',
        started_at: '2025-01-01T00:00:00.000Z',
        completed_at: null,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:30.000Z',
      };

      expect(backup.status).toBe('failed');
      expect(backup.error_message).toBe('Connection timeout while exporting boards table');
      expect(backup.completed_at).toBeNull();
    });
  });
});
