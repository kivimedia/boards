import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * POST /api/outreach/browser-session/health - Check browser session health
 */
export async function POST() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const serviceUrl = process.env.LINKEDIN_SERVICE_URL || 'http://157.180.37.69:8098';

  try {
    const res = await fetch(`${serviceUrl}/session/health`, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return successResponse({
        health: 'unknown',
        service_reachable: true,
      });
    }

    const result = await res.json();
    const health = result.data?.health || 'unknown';
    const loggedIn = result.data?.logged_in || false;

    // Update session in DB
    const { data: session } = await supabase
      .from('li_browser_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (session) {
      await supabase
        .from('li_browser_sessions')
        .update({
          health_status: health,
          last_health_check_at: new Date().toISOString(),
        })
        .eq('id', session.id);
    }

    return successResponse({
      health,
      logged_in: loggedIn,
      service_reachable: true,
      session_id: session?.id,
    });
  } catch {
    return successResponse({
      health: 'unknown',
      logged_in: false,
      service_reachable: false,
    });
  }
}
