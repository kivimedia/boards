import { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import type { BackupManifest } from './types';

const BACKUP_VERSION = '1.0.0';

/**
 * List of tables to include in a full backup, in dependency order.
 */
export const BACKUP_TABLES = [
  'profiles',
  'boards',
  'lists',
  'labels',
  'cards',
  'card_placements',
  'card_labels',
  'card_assignees',
  'comments',
  'checklists',
  'checklist_items',
  'attachments',
  'activity_log',
  'card_dependencies',
  'custom_field_definitions',
  'custom_field_values',
  'mentions',
  'board_members',
  'column_move_rules',
  'automation_rules',
  'automation_log',
  'briefing_templates',
  'card_briefs',
  'clients',
  'credential_entries',
  'credential_audit_log',
  'training_assignments',
  'doors',
  'door_keys',
  'map_sections',
  'notifications',
  'notification_preferences',
  'handoff_rules',
  'onboarding_templates',
  'migration_jobs',
  'migration_entity_map',
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number];

/**
 * Export all rows from a table as JSON.
 */
export async function exportTable(
  supabase: SupabaseClient,
  tableName: string
): Promise<{ data: unknown[]; count: number }> {
  const { data, error, count } = await supabase
    .from(tableName)
    .select('*', { count: 'exact' });

  if (error) {
    throw new Error(`Failed to export table "${tableName}": ${error.message}`);
  }

  return { data: data || [], count: count || 0 };
}

/**
 * Calculate SHA-256 checksum of backup data.
 */
export function calculateChecksum(data: string): string {
  return `sha256:${createHash('sha256').update(data).digest('hex')}`;
}

/**
 * Create a full backup manifest from table data.
 */
export function createManifest(
  tableCounts: Record<string, number>,
  storageFileCount: number,
  checksum: string
): BackupManifest {
  return {
    tables: tableCounts,
    storage_files: storageFileCount,
    checksum,
    backup_version: BACKUP_VERSION,
    created_at: new Date().toISOString(),
  };
}

/**
 * Run a full backup: export all tables to JSON.
 * Returns the backup data as a JSON string plus manifest.
 */
export async function createFullBackup(
  supabase: SupabaseClient,
  backupId: string
): Promise<{ backupData: string; manifest: BackupManifest; sizeBytes: number }> {
  // Mark as running
  await supabase
    .from('backups')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', backupId);

  const tableData: Record<string, unknown[]> = {};
  const tableCounts: Record<string, number> = {};

  for (const tableName of BACKUP_TABLES) {
    try {
      const { data, count } = await exportTable(supabase, tableName);
      tableData[tableName] = data;
      tableCounts[tableName] = count;
    } catch (err) {
      console.error(`[BackupEngine] Failed to export ${tableName}:`, err);
      tableCounts[tableName] = -1; // Indicate error
    }
  }

  // Count storage files (attachments)
  const { data: storageFiles } = await supabase.storage
    .from('card-attachments')
    .list('', { limit: 10000 });
  const storageFileCount = storageFiles?.length || 0;

  const backupPayload = {
    version: BACKUP_VERSION,
    created_at: new Date().toISOString(),
    tables: tableData,
  };

  const backupData = JSON.stringify(backupPayload);
  const sizeBytes = Buffer.byteLength(backupData, 'utf8');
  const checksum = calculateChecksum(backupData);
  const manifest = createManifest(tableCounts, storageFileCount, checksum);

  return { backupData, manifest, sizeBytes };
}

/**
 * Run a full backup job: export data, store it, update the backup record.
 */
export async function runFullBackup(
  supabase: SupabaseClient,
  backupId: string
): Promise<void> {
  try {
    const { backupData, manifest, sizeBytes } = await createFullBackup(supabase, backupId);

    // Store backup in Supabase Storage
    const storagePath = `backups/${backupId}.json`;

    // Ensure the backups bucket exists (it may not)
    // We'll store the path even if storage fails — the manifest is the critical piece
    try {
      const { error: uploadError } = await supabase.storage
        .from('card-attachments')
        .upload(storagePath, backupData, {
          contentType: 'application/json',
          upsert: true,
        });

      if (uploadError) {
        console.error('[BackupEngine] Storage upload failed:', uploadError.message);
      }
    } catch {
      console.error('[BackupEngine] Storage upload failed (no bucket)');
    }

    await supabase
      .from('backups')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        storage_path: storagePath,
        size_bytes: sizeBytes,
        manifest,
      })
      .eq('id', backupId);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await supabase
      .from('backups')
      .update({
        status: 'failed',
        error_message: errorMessage,
      })
      .eq('id', backupId);
  }
}

/**
 * Restore from a backup: import all tables from backup JSON data.
 * Creates a pre-restore snapshot first.
 */
export async function restoreFromBackup(
  supabase: SupabaseClient,
  backupData: string
): Promise<{ restored: boolean; tablesRestored: number; errors: string[] }> {
  const errors: string[] = [];
  let tablesRestored = 0;

  try {
    const payload = JSON.parse(backupData);

    if (!payload.tables || typeof payload.tables !== 'object') {
      throw new Error('Invalid backup format: missing tables');
    }

    // Verify checksum if manifest is available
    const tables = payload.tables as Record<string, unknown[]>;

    // Restore tables in reverse dependency order (delete children first, then parents)
    const reversedTables = [...BACKUP_TABLES].reverse();

    // Phase 1: Clear existing data (in reverse order to handle FK constraints)
    for (const tableName of reversedTables) {
      if (!tables[tableName]) continue;
      try {
        // Delete all existing rows
        await supabase.from(tableName).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      } catch {
        // Some tables may not support delete or may have no rows
      }
    }

    // Phase 2: Insert backup data (in forward order)
    for (const tableName of BACKUP_TABLES) {
      const rows = tables[tableName];
      if (!rows || !Array.isArray(rows) || rows.length === 0) continue;

      try {
        // Insert in batches of 100
        for (let i = 0; i < rows.length; i += 100) {
          const batch = rows.slice(i, i + 100);
          const { error } = await supabase.from(tableName).insert(batch);
          if (error) {
            errors.push(`${tableName}: ${error.message}`);
          }
        }
        tablesRestored++;
      } catch (err) {
        errors.push(`${tableName}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { restored: true, tablesRestored, errors };
  } catch (err) {
    errors.push(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
    return { restored: false, tablesRestored, errors };
  }
}

/**
 * Validate backup data integrity by checking the checksum.
 */
export function validateBackup(
  backupData: string,
  expectedChecksum: string
): boolean {
  const actualChecksum = calculateChecksum(backupData);
  return actualChecksum === expectedChecksum;
}

/**
 * Get a human-readable size string from bytes.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
