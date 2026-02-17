import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { backupId: string };
}

/**
 * GET /api/backups/[backupId]
 * Get a single backup by ID.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { backupId } = params;

  const { data, error } = await supabase
    .from('backups')
    .select('*')
    .eq('id', backupId)
    .single();

  if (error) return errorResponse(error.message, 500);
  if (!data) return errorResponse('Backup not found', 404);

  return successResponse(data);
}

/**
 * DELETE /api/backups/[backupId]
 * Delete a backup. Also delete the storage file if storage_path exists.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { backupId } = params;

  // Fetch the backup to get storage_path
  const { data: existing, error: fetchError } = await supabase
    .from('backups')
    .select('storage_path')
    .eq('id', backupId)
    .single();

  if (fetchError || !existing) return errorResponse('Backup not found', 404);

  // Delete the storage file if it exists
  if (existing.storage_path) {
    try {
      await supabase.storage
        .from('card-attachments')
        .remove([existing.storage_path]);
    } catch {
      // Storage deletion failure is non-fatal
      console.error(`[Backups] Failed to delete storage file: ${existing.storage_path}`);
    }
  }

  const { error } = await supabase
    .from('backups')
    .delete()
    .eq('id', backupId);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true });
}
