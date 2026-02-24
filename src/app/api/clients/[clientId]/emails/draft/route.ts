import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { draftClientEmail } from '@/lib/client-emails';

interface Params {
  params: { clientId: string };
}

// POST /api/clients/[clientId]/emails/draft — AI-draft an email for the client
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  try {
    const email = await draftClientEmail(supabase, params.clientId, userId);

    if (!email) {
      return errorResponse('Failed to generate email draft', 500);
    }

    return successResponse(email, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to draft email';
    return errorResponse(message, 500);
  }
}
