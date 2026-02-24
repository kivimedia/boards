import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { checkVersionConflict, bumpVersion } from '@/lib/conflict-resolution';
import { notifyWatchers } from '@/lib/card-watchers';

interface Params {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error) return errorResponse('Card not found', 404);
  return successResponse(data);
}

interface UpdateCardBody {
  title?: string;
  description?: string;
  due_date?: string | null;
  priority?: string;
  cover_image_url?: string | null;
  owner_id?: string | null;
  version?: number;
  // Lead info fields
  event_date?: string | null;
  event_type?: string | null;
  venue_name?: string | null;
  venue_city?: string | null;
  estimated_value?: number | null;
  lead_source?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  follow_up_date?: string | null;
  didnt_book_reason?: string | null;
  didnt_book_sub_reason?: string | null;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateCardBody>(request);
  if (!body.ok) return body.response;

  const { supabase, userId } = auth.ctx;
  const updates: Record<string, unknown> = {};

  if (body.body.title !== undefined) updates.title = body.body.title;
  if (body.body.description !== undefined) updates.description = body.body.description;
  if (body.body.due_date !== undefined) updates.due_date = body.body.due_date;
  if (body.body.priority !== undefined) updates.priority = body.body.priority;
  if (body.body.cover_image_url !== undefined) updates.cover_image_url = body.body.cover_image_url;
  if (body.body.owner_id !== undefined) updates.owner_id = body.body.owner_id;
  // Lead info fields
  if (body.body.event_date !== undefined) updates.event_date = body.body.event_date;
  if (body.body.event_type !== undefined) updates.event_type = body.body.event_type;
  if (body.body.venue_name !== undefined) updates.venue_name = body.body.venue_name;
  if (body.body.venue_city !== undefined) updates.venue_city = body.body.venue_city;
  if (body.body.estimated_value !== undefined) updates.estimated_value = body.body.estimated_value;
  if (body.body.lead_source !== undefined) updates.lead_source = body.body.lead_source;
  if (body.body.client_email !== undefined) updates.client_email = body.body.client_email;
  if (body.body.client_phone !== undefined) updates.client_phone = body.body.client_phone;
  if (body.body.follow_up_date !== undefined) updates.follow_up_date = body.body.follow_up_date;
  if (body.body.didnt_book_reason !== undefined) updates.didnt_book_reason = body.body.didnt_book_reason;
  if (body.body.didnt_book_sub_reason !== undefined) updates.didnt_book_sub_reason = body.body.didnt_book_sub_reason;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  // Track last touched
  updates.last_touched_at = new Date().toISOString();
  updates.last_touched_by = userId;

  // Version-based conflict detection (optional, backwards compatible)
  if (body.body.version !== undefined) {
    const conflict = await checkVersionConflict(supabase, params.id, body.body.version);
    if (conflict.conflict) {
      return NextResponse.json(
        { error: 'Version conflict', conflict: true, serverData: conflict.serverData, currentVersion: conflict.currentVersion },
        { status: 409 }
      );
    }
  }

  const { data, error } = await supabase
    .from('cards')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);

  // Bump version after successful update
  if (body.body.version !== undefined) {
    try {
      await bumpVersion(supabase, params.id, body.body.version);
    } catch {
      // Version bump failed but update succeeded; not critical
    }
  }

  // Notify watchers about card changes (non-blocking)
  const changeFields = Object.keys(updates).filter(k => k !== 'updated_at');
  if (changeFields.length > 0) {
    const changeDesc = changeFields.join(', ');
    notifyWatchers(
      supabase,
      params.id,
      `Card updated (${changeDesc})`,
      undefined,
      auth.ctx.userId
    ).catch(() => {});
  }

  return successResponse(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  // Delete placements first (cascade should handle this, but be explicit)
  await supabase.from('card_placements').delete().eq('card_id', params.id);
  await supabase.from('card_labels').delete().eq('card_id', params.id);
  await supabase.from('card_assignees').delete().eq('card_id', params.id);
  await supabase.from('comments').delete().eq('card_id', params.id);

  const { error } = await supabase.from('cards').delete().eq('id', params.id);
  if (error) return errorResponse(error.message, 500);

  return successResponse(null);
}
