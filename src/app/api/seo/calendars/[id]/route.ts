import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id } = await params;

  const { data: calendar, error: calErr } = await supabase
    .from('seo_calendars')
    .select('*, team_config:seo_team_configs(id, site_name, site_url, config)')
    .eq('id', id)
    .single();

  if (calErr || !calendar) return errorResponse('Calendar not found', 404);

  const { data: items, error: itemsErr } = await supabase
    .from('seo_calendar_items')
    .select('*')
    .eq('calendar_id', id)
    .order('scheduled_date', { ascending: true })
    .order('sort_order', { ascending: true });

  if (itemsErr) return errorResponse(itemsErr.message, 500);

  return successResponse({ calendar, items: items || [] });
}
