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
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateCardBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const updates: Record<string, unknown> = {};

  if (body.body.title !== undefined) updates.title = body.body.title;
  if (body.body.description !== undefined) updates.description = body.body.description;
  if (body.body.due_date !== undefined) updates.due_date = body.body.due_date;
  if (body.body.priority !== undefined) updates.priority = body.body.priority;
  if (body.body.cover_image_url !== undefined) updates.cover_image_url = body.body.cover_image_url;
  if (body.body.owner_id !== undefined) updates.owner_id = body.body.owner_id;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

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
