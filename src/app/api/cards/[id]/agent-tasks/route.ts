import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import {
  listCardAgentTasks,
  createCardAgentTask,
  updateCardAgentTask,
  deleteCardAgentTask,
} from '@/lib/agent-engine';

/**
 * GET /api/cards/[id]/agent-tasks — List agent tasks on a card
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const tasks = await listCardAgentTasks(auth.ctx.supabase, params.id);
    return successResponse(tasks);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}

/**
 * POST /api/cards/[id]/agent-tasks — Add an agent task to a card
 * Body: { skill_id, title, input_prompt? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();

    if (!body.skill_id || !body.title) {
      return errorResponse('skill_id and title are required', 400);
    }

    const task = await createCardAgentTask(auth.ctx.supabase, {
      card_id: params.id,
      skill_id: body.skill_id,
      title: body.title,
      input_prompt: body.input_prompt,
      created_by: auth.ctx.userId,
    });

    return successResponse(task, 201);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}

/**
 * PUT /api/cards/[id]/agent-tasks — Update a task (pass task_id in body)
 * Body: { task_id, status?, quality_rating?, was_applied?, output_preview?, output_full? }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { task_id, ...updates } = body;

    if (!task_id) return errorResponse('task_id is required', 400);

    const task = await updateCardAgentTask(auth.ctx.supabase, task_id, updates);
    return successResponse(task);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}

/**
 * DELETE /api/cards/[id]/agent-tasks — Delete a task
 * Query param: task_id
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const taskId = url.searchParams.get('task_id');
    if (!taskId) return errorResponse('task_id is required', 400);

    await deleteCardAgentTask(auth.ctx.supabase, taskId);
    return successResponse({ deleted: true });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}
