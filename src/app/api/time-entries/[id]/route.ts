import { NextRequest } from 'next/server';
import {
  getAuthContext,
  successResponse,
  errorResponse,
  parseBody,
} from '@/lib/api-helpers';
import { updateTimeEntry, deleteTimeEntry } from '@/lib/time-tracking';

interface Params {
  params: { id: string };
}

/**
 * GET /api/time-entries/[id]
 * Get a single time entry by ID.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const entryId = params.id;

  const { data, error } = await supabase
    .from('time_entries')
    .select('*')
    .eq('id', entryId)
    .eq('user_id', userId)
    .single();

  if (error) return errorResponse('Time entry not found', 404);
  return successResponse(data);
}

interface UpdateTimeEntryBody {
  description?: string;
  is_billable?: boolean;
  started_at?: string;
  ended_at?: string;
}

/**
 * PATCH /api/time-entries/[id]
 * Update a time entry (description, billable, dates).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<UpdateTimeEntryBody>(request);
  if (!parsed.ok) return parsed.response;

  const { supabase, userId } = auth.ctx;
  const entryId = params.id;
  const body = parsed.body;

  // Verify ownership
  const { data: existing } = await supabase
    .from('time_entries')
    .select('id')
    .eq('id', entryId)
    .eq('user_id', userId)
    .single();

  if (!existing) return errorResponse('Time entry not found', 404);

  const updates: Record<string, unknown> = {};
  if (body.description !== undefined) updates.description = body.description;
  if (body.is_billable !== undefined) updates.is_billable = body.is_billable;
  if (body.started_at !== undefined) updates.started_at = body.started_at;
  if (body.ended_at !== undefined) updates.ended_at = body.ended_at;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const entry = await updateTimeEntry(supabase, entryId, updates);
  if (!entry) return errorResponse('Failed to update time entry', 500);

  return successResponse(entry);
}

/**
 * DELETE /api/time-entries/[id]
 * Delete a time entry (only the owner can delete).
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const entryId = params.id;

  // Verify ownership
  const { data: existing } = await supabase
    .from('time_entries')
    .select('id')
    .eq('id', entryId)
    .eq('user_id', userId)
    .single();

  if (!existing) return errorResponse('Time entry not found', 404);

  await deleteTimeEntry(supabase, entryId);
  return successResponse({ deleted: true });
}
