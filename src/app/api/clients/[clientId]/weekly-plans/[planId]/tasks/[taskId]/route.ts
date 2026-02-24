import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { updateTask, deleteTask } from '@/lib/weekly-gantt';

interface Params {
  params: Promise<{ clientId: string; planId: string; taskId: string }>;
}

interface UpdateTaskBody {
  title?: string;
  description?: string | null;
  owner_id?: string | null;
  day_start?: number;
  day_end?: number;
  completed?: boolean;
  sort_order?: number;
  priority?: string;
  reminder_at?: string | null;
}

/**
 * PATCH /api/clients/[clientId]/weekly-plans/[planId]/tasks/[taskId]
 * Update a single task.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateTaskBody>(request);
  if (!body.ok) return body.response;

  const { taskId } = await params;

  try {
    const task = await updateTask(auth.ctx.supabase, taskId, body.body);
    return successResponse(task);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to update task', 500);
  }
}

/**
 * DELETE /api/clients/[clientId]/weekly-plans/[planId]/tasks/[taskId]
 * Delete a task.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { taskId } = await params;

  try {
    await deleteTask(auth.ctx.supabase, taskId);
    return successResponse({ deleted: true });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to delete task', 500);
  }
}
