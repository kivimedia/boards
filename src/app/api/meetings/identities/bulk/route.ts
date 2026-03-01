import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse, parseBody, successResponse } from '@/lib/api-helpers';

interface BulkBody {
  ids: string[];
  action: 'confirm' | 'assign';
  client_id?: string;
}

/**
 * POST /api/meetings/identities/bulk
 * Bulk confirm or assign identities.
 * Body: { ids: string[], action: 'confirm' | 'assign', client_id?: string }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<BulkBody>(request);
  if (!body.ok) return body.response;

  const { supabase, userId } = auth.ctx;
  const { ids, action, client_id } = body.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return errorResponse('ids must be a non-empty array');
  }

  if (!action || !['confirm', 'assign'].includes(action)) {
    return errorResponse('action must be "confirm" or "assign"');
  }

  if (action === 'assign' && !client_id) {
    return errorResponse('client_id is required for assign action');
  }

  const now = new Date().toISOString();
  let updated = 0;
  let errors: string[] = [];

  for (const id of ids) {
    const updates: Record<string, unknown> = {
      confirmed_at: now,
      confirmed_by: userId,
      source: 'manual',
      confidence: 'high',
      updated_at: now,
    };

    if (action === 'assign' && client_id) {
      updates.client_id = client_id;
    }

    const { error } = await supabase
      .from('participant_identities')
      .update(updates)
      .eq('id', id);

    if (error) {
      errors.push(`${id}: ${error.message}`);
    } else {
      updated++;
    }
  }

  return successResponse({
    updated,
    total: ids.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
