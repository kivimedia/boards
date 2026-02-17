import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const boardType = searchParams.get('board_type');

  let query = supabase
    .from('briefing_templates')
    .select('*')
    .order('name', { ascending: true });

  if (boardType) {
    query = query.eq('board_type', boardType);
  }

  const { data, error } = await query;

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
