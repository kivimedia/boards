import { NextRequest } from 'next/server';
import {
  getAuthContext,
  successResponse,
  errorResponse,
  parseBody,
} from '@/lib/api-helpers';
import {
  updateRecurringCard,
  deleteRecurringCard,
} from '@/lib/automation-rules-builder';
import type { RecurrencePattern } from '@/lib/types';

interface Params {
  params: { id: string; recurringId: string };
}

/**
 * GET /api/boards/[id]/recurring-cards/[recurringId]
 * Get a single recurring card configuration.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id: boardId, recurringId } = params;

  const { data, error } = await supabase
    .from('recurring_cards')
    .select('*')
    .eq('id', recurringId)
    .eq('board_id', boardId)
    .single();

  if (error || !data) return errorResponse('Recurring card not found', 404);
  return successResponse(data);
}

interface UpdateRecurringCardBody {
  title?: string;
  description?: string;
  recurrence_pattern?: RecurrencePattern;
  recurrence_day?: number;
  is_active?: boolean;
  labels?: string[];
  assignee_ids?: string[];
  priority?: string;
}

/**
 * PATCH /api/boards/[id]/recurring-cards/[recurringId]
 * Update a recurring card configuration.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<UpdateRecurringCardBody>(request);
  if (!parsed.ok) return parsed.response;

  const { supabase } = auth.ctx;
  const { recurringId } = params;
  const body = parsed.body;

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) {
    if (!body.title.trim()) return errorResponse('title cannot be empty');
    updates.title = body.title.trim();
  }
  if (body.description !== undefined) updates.description = body.description;
  if (body.recurrence_pattern !== undefined) updates.recurrence_pattern = body.recurrence_pattern;
  if (body.recurrence_day !== undefined) updates.recurrence_day = body.recurrence_day;
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  if (body.labels !== undefined) updates.labels = body.labels;
  if (body.assignee_ids !== undefined) updates.assignee_ids = body.assignee_ids;
  if (body.priority !== undefined) updates.priority = body.priority;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const card = await updateRecurringCard(supabase, recurringId, updates);
  if (!card) return errorResponse('Failed to update recurring card', 500);

  return successResponse(card);
}

/**
 * DELETE /api/boards/[id]/recurring-cards/[recurringId]
 * Delete a recurring card configuration.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { recurringId } = params;

  await deleteRecurringCard(supabase, recurringId);
  return successResponse({ deleted: true });
}
