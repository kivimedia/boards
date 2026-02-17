import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const cardId = params.id;

  const { data, error } = await supabase
    .from('activity_log')
    .select('*, profile:profiles(*)')
    .eq('card_id', cardId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
