import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getClientEmailConfig, updateClientEmailConfig } from '@/lib/client-emails';
import type { ClientEmailConfig } from '@/lib/types';

interface Params {
  params: { clientId: string };
}

// GET /api/clients/[clientId]/email-config — get email configuration
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const config = await getClientEmailConfig(supabase, params.clientId);
  return successResponse(config);
}

// PUT /api/clients/[clientId]/email-config — replace email configuration
export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<ClientEmailConfig>(request);
  if (!parsed.ok) return parsed.response;

  const config = parsed.body;

  // Validate cadence
  const validCadences = ['weekly', 'biweekly', 'monthly'];
  if (config.update_cadence && !validCadences.includes(config.update_cadence)) {
    return errorResponse('Invalid cadence. Must be weekly, biweekly, or monthly.');
  }

  // Validate tone
  const validTones = ['formal', 'friendly', 'casual'];
  if (config.tone && !validTones.includes(config.tone)) {
    return errorResponse('Invalid tone. Must be formal, friendly, or casual.');
  }

  const { supabase } = auth.ctx;
  await updateClientEmailConfig(supabase, params.clientId, config);
  return successResponse(config);
}
