import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import type { BackupType } from '@/lib/types';

/**
 * GET /api/backups
 * List all backups, ordered by created_at desc.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('backups')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface CreateBackupBody {
  type: BackupType;
}

/**
 * POST /api/backups
 * Create a new backup job. Body: { type: 'full' | 'incremental' }.
 * Sets started_by to userId, status to 'pending'. Returns the created backup.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateBackupBody>(request);
  if (!body.ok) return body.response;

  const { type } = body.body;

  if (!type || !['full', 'incremental'].includes(type)) {
    return errorResponse('type must be "full" or "incremental"');
  }

  const { supabase, userId } = auth.ctx;

  const { data, error } = await supabase
    .from('backups')
    .insert({
      type,
      status: 'pending',
      started_by: userId,
      manifest: {},
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
