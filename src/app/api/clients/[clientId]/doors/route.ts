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
    .from('doors')
    .select('*, keys:door_keys(*)')
    .eq('client_id', params.clientId)
    .order('door_number', { ascending: true });

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface CreateDoorBody {
  door_number: number;
  title: string;
  description?: string;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateDoorBody>(request);
  if (!body.ok) return body.response;

  const { door_number, title, description } = body.body;
  if (!title?.trim()) return errorResponse('Door title is required');
  if (door_number === undefined || door_number === null) return errorResponse('Door number is required');

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('doors')
    .insert({
      client_id: params.clientId,
      door_number,
      title: title.trim(),
      description: description?.trim() || null,
    })
    .select('*, keys:door_keys(*)')
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
