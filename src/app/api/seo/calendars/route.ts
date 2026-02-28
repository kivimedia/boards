import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const teamConfigId = searchParams.get('team_config_id');

  let query = supabase
    .from('seo_calendars')
    .select('*, team_config:seo_team_configs(id, site_name, site_url)')
    .order('created_at', { ascending: false });

  if (teamConfigId) query = query.eq('team_config_id', teamConfigId);

  const { data, error } = await query;
  if (error) return errorResponse(error.message, 500);

  return successResponse(data || []);
}
