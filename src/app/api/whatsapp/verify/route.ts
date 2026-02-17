import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { verifyPhone } from '@/lib/whatsapp';

interface VerifyBody {
  code: string;
}

/**
 * POST /api/whatsapp/verify
 * Verify the phone number with the 6-digit code.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<VerifyBody>(request);
  if (!parsed.ok) return parsed.response;

  const { code } = parsed.body;

  if (!code?.trim()) {
    return errorResponse('code is required');
  }

  if (!/^\d{6}$/.test(code.trim())) {
    return errorResponse('Code must be a 6-digit number');
  }

  const { supabase, userId } = auth.ctx;

  const verified = await verifyPhone(supabase, userId, code.trim());

  if (!verified) {
    return errorResponse('Invalid or expired verification code', 400);
  }

  return successResponse({ verified: true });
}
