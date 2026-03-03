import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/outreach/browser-session - Get current browser session
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const { data: session } = await supabase
    .from('li_browser_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return successResponse({ session });
}

/**
 * POST /api/outreach/browser-session - Create or update browser session
 *
 * Body: { session_name?: string, linkedin_email?: string, status?: string }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: { session_name?: string; linkedin_email?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const {
    session_name = 'default',
    linkedin_email,
    status = 'active',
  } = body;

  try {
    // Upsert session
    const { data: session, error } = await supabase
      .from('li_browser_sessions')
      .upsert({
        user_id: userId,
        session_name,
        linkedin_email,
        status,
        user_data_dir: `/home/ziv/linkedin-profiles/${session_name}`,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,session_name',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Link session to settings
    await supabase
      .from('li_settings')
      .update({ browser_session_id: session.id })
      .eq('user_id', userId);

    return successResponse({ session });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to create session', 500);
  }
}
