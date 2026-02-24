import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { createTask, reorderTasks } from '@/lib/weekly-gantt';

interface Params {
  params: Promise<{ clientId: string; planId: string }>;
}

interface CreateTaskBody {
  title: string;
  description?: string;
  owner_id?: string;
  assignee_name?: string | null;
  day_start?: number;
  day_end?: number;
  priority?: string;
  color?: string | null;
}

/**
 * POST /api/clients/[clientId]/weekly-plans/[planId]/tasks
 * Create a new task in the plan.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateTaskBody>(request);
  if (!body.ok) return body.response;

  const { planId } = await params;
  const { title, description, owner_id, assignee_name, day_start, day_end, priority, color } = body.body;

  if (!title?.trim()) return errorResponse('Task title is required');

  try {
    const task = await createTask(auth.ctx.supabase, planId, {
      title: title.trim(),
      description,
      owner_id,
      assignee_name,
      day_start,
      day_end,
      priority,
      color,
    });
    return successResponse(task, 201);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to create task', 500);
  }
}

interface ReorderBody {
  task_ids: string[];
}

/**
 * PATCH /api/clients/[clientId]/weekly-plans/[planId]/tasks
 * Reorder tasks (bulk sort_order update).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<ReorderBody>(request);
  if (!body.ok) return body.response;

  const { planId } = await params;
  const { task_ids } = body.body;

  if (!Array.isArray(task_ids) || task_ids.length === 0) {
    return errorResponse('task_ids must be a non-empty array');
  }

  try {
    await reorderTasks(auth.ctx.supabase, planId, task_ids);
    return successResponse({ reordered: true });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to reorder tasks', 500);
  }
}
