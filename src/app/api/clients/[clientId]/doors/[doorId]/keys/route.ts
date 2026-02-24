import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { clientId: string; doorId: string };
}

interface CreateKeyBody {
  key_number: number;
  title: string;
  description?: string;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateKeyBody>(request);
  if (!body.ok) return body.response;

  const { key_number, title, description } = body.body;
  if (!title?.trim()) return errorResponse('Key title is required');
  if (key_number === undefined || key_number === null) return errorResponse('Key number is required');

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('door_keys')
    .insert({
      door_id: params.doorId,
      key_number,
      title: title.trim(),
      description: description?.trim() || null,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
