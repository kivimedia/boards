import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

const DEFAULTS = {
  max_outlets: 50,
  relevance_threshold: 50,
  verification_threshold: 60,
  qa_threshold: 70,
  email_max_words: 300,
};

/**
 * GET /api/team-pr/settings
 * Returns merged user settings (DB values override defaults).
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { supabase, userId } = auth.ctx;

  const { data } = await supabase
    .from('pr_user_settings')
    .select('settings')
    .eq('user_id', userId)
    .single();

  return successResponse({ ...DEFAULTS, ...(data?.settings || {}) });
}

/**
 * PATCH /api/team-pr/settings
 * Upsert user PR settings (merges with existing).
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { supabase, userId } = auth.ctx;

  const body = await parseBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;

  // Load existing settings to merge
  const { data: existing } = await supabase
    .from('pr_user_settings')
    .select('settings')
    .eq('user_id', userId)
    .single();

  const merged = { ...(existing?.settings || {}), ...body.body };

  const { error } = await supabase
    .from('pr_user_settings')
    .upsert(
      {
        user_id: userId,
        settings: merged,
      },
      { onConflict: 'user_id' }
    );

  if (error) return errorResponse(error.message, 500);

  return successResponse({ ...DEFAULTS, ...merged });
}
