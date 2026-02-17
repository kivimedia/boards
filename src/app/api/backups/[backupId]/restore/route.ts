import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { restoreFromBackup, validateBackup } from '@/lib/backup-engine';

interface Params {
  params: { backupId: string };
}

/**
 * POST /api/backups/[backupId]/restore
 * Restore from a backup.
 * 1. Fetch the backup record to get storage_path
 * 2. Download the backup data from Supabase Storage
 * 3. Optionally validate checksum using validateBackup
 * 4. Call restoreFromBackup
 * 5. Return the restore result
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { backupId } = params;

  // 1. Fetch the backup record
  const { data: backup, error: fetchError } = await supabase
    .from('backups')
    .select('*')
    .eq('id', backupId)
    .single();

  if (fetchError || !backup) return errorResponse('Backup not found', 404);

  if (backup.status !== 'completed') {
    return errorResponse(`Cannot restore from a backup with status "${backup.status}". Backup must be completed.`);
  }

  if (!backup.storage_path) {
    return errorResponse('Backup has no storage file. Cannot restore.');
  }

  // 2. Download the backup data from Supabase Storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('card-attachments')
    .download(backup.storage_path);

  if (downloadError || !fileData) {
    return errorResponse(`Failed to download backup file: ${downloadError?.message || 'Unknown error'}`, 500);
  }

  const backupData = await fileData.text();

  // 3. Validate checksum if manifest has one
  if (backup.manifest?.checksum) {
    const isValid = validateBackup(backupData, backup.manifest.checksum);
    if (!isValid) {
      return errorResponse('Backup data integrity check failed. Checksum mismatch.', 400);
    }
  }

  // 4. Call restoreFromBackup
  try {
    const result = await restoreFromBackup(supabase, backupData);

    // 5. Return the restore result
    return successResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(`Restore failed: ${message}`, 500);
  }
}
