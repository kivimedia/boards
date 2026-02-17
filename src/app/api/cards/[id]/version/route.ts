import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getCardVersion } from '@/lib/conflict-resolution';

interface Params {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  try {
    const version = await getCardVersion(supabase, params.id);
    return successResponse({ version });
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : 'Failed to get card version',
      500
    );
  }
}
