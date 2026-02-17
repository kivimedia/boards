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
    .from('lists')
    .select('*')
    .eq('board_id', params.id)
    .order('position');

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface CreateListBody {
  name: string;
  position?: number;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateListBody>(request);
  if (!body.ok) return body.response;

  const { name, position } = body.body;
  if (!name?.trim()) return errorResponse('List name is required');

  const { supabase } = auth.ctx;

  // If no position given, put at end
  let pos = position;
  if (pos === undefined) {
    const { data: maxList } = await supabase
      .from('lists')
      .select('position')
      .eq('board_id', params.id)
      .order('position', { ascending: false })
      .limit(1)
      .single();

    pos = (maxList?.position ?? -1) + 1;
  }

  const { data, error } = await supabase
    .from('lists')
    .insert({ board_id: params.id, name: name.trim(), position: pos })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
