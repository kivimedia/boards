import { getAuthContext, successResponse } from '@/lib/api-helpers';

/**
 * GET /api/outreach/learning - List learning proposals
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const { data: proposals } = await supabase
    .from('li_learning_log')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  // Get rule snapshots for rollback display
  const { data: snapshots } = await supabase
    .from('li_rule_snapshots')
    .select('id, version, created_at')
    .eq('user_id', userId)
    .order('version', { ascending: false })
    .limit(10);

  return successResponse({
    proposals: proposals || [],
    snapshots: snapshots || [],
  });
}
