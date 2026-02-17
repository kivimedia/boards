import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { isIPAllowed } from '@/lib/enterprise';

interface CheckIPBody {
  ip_address: string;
}

/**
 * POST /api/enterprise/ip-whitelist/check
 * Check if a given IP address is allowed by the whitelist.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<CheckIPBody>(request);
  if (!parsed.ok) return parsed.response;

  const { ip_address } = parsed.body;

  if (!ip_address?.trim()) return errorResponse('ip_address is required');

  const { supabase } = auth.ctx;

  try {
    const allowed = await isIPAllowed(supabase, ip_address.trim());
    return successResponse({ ip_address: ip_address.trim(), allowed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to check IP';
    return errorResponse(message, 500);
  }
}
