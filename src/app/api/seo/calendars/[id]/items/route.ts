import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

type Params = { params: Promise<{ id: string }> };

interface AddItemBody {
  topic: string;
  silo?: string;
  keywords?: string[];
  outline_notes?: string;
  target_word_count?: number;
  scheduled_date: string;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<AddItemBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const { id } = await params;
  const { topic, silo, keywords, outline_notes, target_word_count, scheduled_date } = body.body;

  if (!topic?.trim()) return errorResponse('topic is required');
  if (!scheduled_date) return errorResponse('scheduled_date is required');

  // Verify calendar exists
  const { data: cal } = await supabase.from('seo_calendars').select('team_config_id').eq('id', id).single();
  if (!cal) return errorResponse('Calendar not found', 404);

  const { data: item, error } = await supabase
    .from('seo_calendar_items')
    .insert({
      calendar_id: id,
      team_config_id: cal.team_config_id,
      topic: topic.trim(),
      silo: silo || null,
      keywords: keywords || [],
      outline_notes: outline_notes || null,
      target_word_count: target_word_count || 1500,
      scheduled_date,
      sort_order: 0,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);

  // Update item count
  const { count } = await supabase.from('seo_calendar_items').select('id', { count: 'exact', head: true }).eq('calendar_id', id);
  await supabase.from('seo_calendars').update({ items_count: count || 0, updated_at: new Date().toISOString() }).eq('id', id);

  return successResponse(item, 201);
}
