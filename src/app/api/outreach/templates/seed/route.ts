import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * POST /api/outreach/templates/seed
 * Seed default templates for the current user by calling li_seed_templates() RPC.
 */
export async function POST(_request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Check if user already has templates
  const { count } = await supabase
    .from('li_templates')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (count && count > 0) {
    return errorResponse('Templates already exist. Delete existing templates first to re-seed.', 409);
  }

  const { error } = await supabase.rpc('li_seed_templates', { p_user_id: userId });

  if (error) {
    return errorResponse(`Seed failed: ${error.message}`, 500);
  }

  return successResponse({ seeded: true });
}
