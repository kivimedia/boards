import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { clientId: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('training_assignments')
    .select('*')
    .eq('client_id', params.clientId)
    .order('created_at', { ascending: false });

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface CreateTrainingBody {
  title: string;
  description?: string;
  video_url?: string;
  prompt?: string;
  assigned_to?: string;
  due_date?: string;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateTrainingBody>(request);
  if (!body.ok) return body.response;

  const { title, description, video_url, prompt, assigned_to, due_date } = body.body;
  if (!title?.trim()) return errorResponse('Title is required');

  const { supabase, userId } = auth.ctx;
  const { data, error } = await supabase
    .from('training_assignments')
    .insert({
      client_id: params.clientId,
      title: title.trim(),
      description: description?.trim() || null,
      video_url: video_url?.trim() || null,
      prompt: prompt?.trim() || null,
      assigned_to: assigned_to || null,
      assigned_by: userId,
      due_date: due_date || null,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
