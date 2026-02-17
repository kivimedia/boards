import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { runFullBackup } from '@/lib/backup-engine';

interface Params {
  params: { backupId: string };
}

/**
 * POST /api/backups/[backupId]/run
 * Start executing a backup.
 * Calls runFullBackup in the background (fire-and-forget) and returns immediately.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { backupId } = params;

  // Fetch the backup to verify it exists and is pending
  const { data: backup, error: fetchError } = await supabase
    .from('backups')
    .select('*')
    .eq('id', backupId)
    .single();

  if (fetchError || !backup) return errorResponse('Backup not found', 404);

  if (backup.status !== 'pending') {
    return errorResponse(`Cannot start a backup with status "${backup.status}". Backup must be pending.`);
  }

  // Fire-and-forget: run backup in background
  runFullBackup(supabase, backupId).catch((err) => {
    console.error(`Backup job ${backupId} failed:`, err);
  });

  return successResponse({ started: true });
}
