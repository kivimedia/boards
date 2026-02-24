import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { TrainingStatus } from '@/lib/types';

interface Params {
  params: { clientId: string; trainingId: string };
}

interface UpdateTrainingBody {
  title?: string;
  description?: string;
  video_url?: string;
  prompt?: string;
  status?: TrainingStatus;
  submission?: string;
  feedback?: string;
  assigned_to?: string;
  due_date?: string;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateTrainingBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const updates: Record<string, unknown> = {};

  if (body.body.title !== undefined) {
    if (!body.body.title.trim()) return errorResponse('Title cannot be empty');
    updates.title = body.body.title.trim();
  }
  if (body.body.description !== undefined) updates.description = body.body.description?.trim() || null;
  if (body.body.video_url !== undefined) updates.video_url = body.body.video_url?.trim() || null;
  if (body.body.prompt !== undefined) updates.prompt = body.body.prompt?.trim() || null;
  if (body.body.status !== undefined) {
    updates.status = body.body.status;
    if (body.body.status === 'completed') {
      updates.completed_at = new Date().toISOString();
    }
  }
  if (body.body.submission !== undefined) updates.submission = body.body.submission?.trim() || null;
  if (body.body.feedback !== undefined) updates.feedback = body.body.feedback?.trim() || null;
  if (body.body.assigned_to !== undefined) updates.assigned_to = body.body.assigned_to || null;
  if (body.body.due_date !== undefined) updates.due_date = body.body.due_date || null;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const { data, error } = await supabase
    .from('training_assignments')
    .update(updates)
    .eq('id', params.trainingId)
    .eq('client_id', params.clientId)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { error } = await supabase
    .from('training_assignments')
    .delete()
    .eq('id', params.trainingId)
    .eq('client_id', params.clientId);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true });
}
