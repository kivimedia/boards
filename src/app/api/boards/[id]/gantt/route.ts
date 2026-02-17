import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getGanttTasks } from '@/lib/analytics';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id) return errorResponse('Board ID is required');

  const tasks = await getGanttTasks(auth.ctx.supabase, id);
  return successResponse(tasks);
}
