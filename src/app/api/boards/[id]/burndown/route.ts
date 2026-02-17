import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getBurndownData } from '@/lib/analytics';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id) return errorResponse('Board ID is required');

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');

  if (!startDate) return errorResponse('start_date query parameter is required');
  if (!endDate) return errorResponse('end_date query parameter is required');

  // Validate date formats
  if (isNaN(Date.parse(startDate))) return errorResponse('Invalid start_date format');
  if (isNaN(Date.parse(endDate))) return errorResponse('Invalid end_date format');
  if (new Date(startDate) >= new Date(endDate)) return errorResponse('start_date must be before end_date');

  const data = await getBurndownData(auth.ctx.supabase, id, startDate, endDate);
  return successResponse(data);
}
