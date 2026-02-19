import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const cardId = params.id;

  // Fetch activity + profiles separately (no FK from activity_log→profiles)
  const [activityRes, profilesRes] = await Promise.all([
    supabase
      .from('activity_log')
      .select('*')
      .eq('card_id', cardId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('profiles').select('*'),
  ]);

  if (activityRes.error) return errorResponse(activityRes.error.message, 500);

  const profilesMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));
  const dataWithProfiles = (activityRes.data || []).map((entry: any) => ({
    ...entry,
    profile: profilesMap.get(entry.user_id) || null,
  }));

  return successResponse(dataWithProfiles);
}
