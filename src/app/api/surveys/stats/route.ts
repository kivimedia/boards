import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getSurveyStats } from '@/lib/analytics';

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');

  if (!clientId) return errorResponse('client_id query parameter is required');

  const stats = await getSurveyStats(auth.ctx.supabase, clientId);
  return successResponse(stats);
}
