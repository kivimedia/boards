import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { triageLeadApi } from '@/lib/lead-triage';

interface Params {
  params: { id: string };
}

export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const cardId = params.id;

  const result = await triageLeadApi(supabase, cardId, userId);

  if (!result) {
    return errorResponse('Card not found or not placed on any board', 404);
  }

  return successResponse(result);
}
