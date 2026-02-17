import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { sendEmail, getClientEmail } from '@/lib/client-emails';

interface Params {
  params: { clientId: string; emailId: string };
}

// POST /api/clients/[clientId]/emails/[emailId]/send — send an approved email
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  // Verify email belongs to this client
  const email = await getClientEmail(supabase, params.emailId);
  if (!email) return errorResponse('Email not found', 404);
  if (email.client_id !== params.clientId) return errorResponse('Email not found', 404);

  const result = await sendEmail(supabase, params.emailId);

  if (!result.success) {
    return errorResponse(result.error ?? 'Failed to send email', 500);
  }

  return successResponse({ sent: true });
}
