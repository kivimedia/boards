import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('comments')
    .select('*, profile:profiles(*)')
    .eq('card_id', params.id)
    .order('created_at', { ascending: true });

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface CreateCommentBody {
  content: string;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateCommentBody>(request);
  if (!body.ok) return body.response;

  if (!body.body.content?.trim()) return errorResponse('Comment content is required');

  const { supabase, userId } = auth.ctx;

  const { data, error } = await supabase
    .from('comments')
    .insert({
      card_id: params.id,
      user_id: userId,
      content: body.body.content.trim(),
    })
    .select('*, profile:profiles(*)')
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
