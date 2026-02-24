import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { linkPhone } from '@/lib/whatsapp';

interface LinkPhoneBody {
  phone_number: string;
  display_name?: string;
}

/**
 * POST /api/whatsapp/link
 * Link a phone number and start verification flow.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<LinkPhoneBody>(request);
  if (!parsed.ok) return parsed.response;

  const { phone_number, display_name } = parsed.body;

  if (!phone_number?.trim()) {
    return errorResponse('phone_number is required');
  }

  // Basic phone number validation: must contain digits and optional + prefix
  const cleaned = phone_number.trim();
  if (!/^\+?\d{7,15}$/.test(cleaned)) {
    return errorResponse('Invalid phone number format');
  }

  const { supabase, userId } = auth.ctx;

  const waUser = await linkPhone(supabase, userId, cleaned, display_name?.trim());

  if (!waUser) {
    return errorResponse('Failed to link phone number', 500);
  }

  return successResponse(waUser, 201);
}
