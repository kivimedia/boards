import { NextRequest } from 'next/server';
import {
  getAuthContext,
  successResponse,
  errorResponse,
  parseBody,
} from '@/lib/api-helpers';
import {
  getRecurringCards,
  createRecurringCard,
} from '@/lib/automation-rules-builder';
import type { RecurrencePattern } from '@/lib/types';

interface Params {
  params: { id: string };
}

/**
 * GET /api/boards/[id]/recurring-cards
 * List all recurring card configs for a board.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const boardId = params.id;

  const cards = await getRecurringCards(supabase, boardId);
  return successResponse(cards);
}

interface CreateRecurringCardBody {
  list_id: string;
  title: string;
  description?: string;
  recurrence_pattern: RecurrencePattern;
  recurrence_day?: number;
  recurrence_time?: string;
  labels?: string[];
  assignee_ids?: string[];
  priority?: string;
  custom_fields?: Record<string, unknown>;
}

/**
 * POST /api/boards/[id]/recurring-cards
 * Create a new recurring card configuration.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<CreateRecurringCardBody>(request);
  if (!parsed.ok) return parsed.response;

  const { supabase, userId } = auth.ctx;
  const boardId = params.id;
  const body = parsed.body;

  if (!body.list_id) return errorResponse('list_id is required');
  if (!body.title?.trim()) return errorResponse('title is required');
  if (!body.recurrence_pattern) return errorResponse('recurrence_pattern is required');

  const card = await createRecurringCard(supabase, {
    boardId,
    listId: body.list_id,
    title: body.title.trim(),
    description: body.description,
    recurrencePattern: body.recurrence_pattern,
    recurrenceDay: body.recurrence_day,
    recurrenceTime: body.recurrence_time,
    labels: body.labels,
    assigneeIds: body.assignee_ids,
    priority: body.priority,
    customFields: body.custom_fields,
    createdBy: userId,
  });

  if (!card) return errorResponse('Failed to create recurring card', 500);
  return successResponse(card, 201);
}
