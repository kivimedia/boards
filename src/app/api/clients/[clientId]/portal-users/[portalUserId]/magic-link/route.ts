import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { sendMagicLink } from '@/lib/client-portal';

interface Params {
  params: { clientId: string; portalUserId: string };
}

/**
 * POST /api/clients/[clientId]/portal-users/[portalUserId]/magic-link
 * Send a magic link to a portal user so they can access the client portal.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  try {
    // Fetch the portal user to get their email
    const { data: portalUser, error: fetchError } = await supabase
      .from('client_portal_users')
      .select('email, is_active')
      .eq('id', params.portalUserId)
      .eq('client_id', params.clientId)
      .single();

    if (fetchError || !portalUser) {
      return errorResponse('Portal user not found', 404);
    }

    if (!portalUser.is_active) {
      return errorResponse('Cannot send magic link to deactivated user', 400);
    }

    // Build redirect URL from request origin
    const origin = request.headers.get('origin') || request.headers.get('referer') || '';
    const redirectTo = `${origin}/client-portal`;

    const result = await sendMagicLink(supabase, portalUser.email, redirectTo);

    if (!result.success) {
      return errorResponse(result.error ?? 'Failed to send magic link', 500);
    }

    return successResponse({ sent: true, email: portalUser.email });
  } catch (err) {
    return errorResponse(
      `Failed to send magic link: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
