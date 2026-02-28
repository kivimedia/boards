import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

type Params = { params: Promise<{ id: string; itemId: string }> };

interface EditItemBody {
  topic?: string;
  silo?: string;
  keywords?: string[];
  outline_notes?: string;
  target_word_count?: number;
  scheduled_date?: string;
  sort_order?: number;
  status?: 'planned' | 'skipped';
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<EditItemBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const { id, itemId } = await params;

  // Check item exists and is editable
  const { data: existing } = await supabase
    .from('seo_calendar_items')
    .select('status')
    .eq('id', itemId)
    .eq('calendar_id', id)
    .single();

  if (!existing) return errorResponse('Item not found', 404);
  if (existing.status === 'launched') return errorResponse('Cannot edit a launched item', 400);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const b = body.body;
  if (b.topic !== undefined) updates.topic = b.topic;
  if (b.silo !== undefined) updates.silo = b.silo;
  if (b.keywords !== undefined) updates.keywords = b.keywords;
  if (b.outline_notes !== undefined) updates.outline_notes = b.outline_notes;
  if (b.target_word_count !== undefined) updates.target_word_count = b.target_word_count;
  if (b.scheduled_date !== undefined) updates.scheduled_date = b.scheduled_date;
  if (b.sort_order !== undefined) updates.sort_order = b.sort_order;
  if (b.status !== undefined) updates.status = b.status;

  const { data: updated, error } = await supabase
    .from('seo_calendar_items')
    .update(updates)
    .eq('id', itemId)
    .eq('calendar_id', id)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(updated);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id, itemId } = await params;

  const { data: existing } = await supabase
    .from('seo_calendar_items')
    .select('status, calendar_id')
    .eq('id', itemId)
    .eq('calendar_id', id)
    .single();

  if (!existing) return errorResponse('Item not found', 404);
  if (existing.status === 'launched') return errorResponse('Cannot delete a launched item', 400);

  const { error } = await supabase.from('seo_calendar_items').delete().eq('id', itemId);
  if (error) return errorResponse(error.message, 500);

  // Update item count
  const { count } = await supabase.from('seo_calendar_items').select('id', { count: 'exact', head: true }).eq('calendar_id', id);
  await supabase.from('seo_calendars').update({ items_count: count || 0, updated_at: new Date().toISOString() }).eq('id', id);

  return successResponse({ deleted: true });
}
