import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { backupId: string };
}

/**
 * GET /api/backups/[backupId]/download
 * Download the backup file. Fetch from storage and return as a downloadable JSON file.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { backupId } = params;

  // Fetch the backup record
  const { data: backup, error: fetchError } = await supabase
    .from('backups')
    .select('*')
    .eq('id', backupId)
    .single();

  if (fetchError || !backup) return errorResponse('Backup not found', 404);

  if (!backup.storage_path) {
    return errorResponse('Backup has no storage file available for download.');
  }

  // Download from Supabase Storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('card-attachments')
    .download(backup.storage_path);

  if (downloadError || !fileData) {
    return errorResponse(`Failed to download backup file: ${downloadError?.message || 'Unknown error'}`, 500);
  }

  const buffer = await fileData.arrayBuffer();
  const fileName = `backup-${backup.type}-${backupId.slice(0, 8)}.json`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
