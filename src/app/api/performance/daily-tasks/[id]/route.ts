import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PKAMDailyTaskType } from '@/lib/types';

export const dynamic = 'force-dynamic';

const ALLOWED_TASK_TYPES: PKAMDailyTaskType[] = [
  'fathom_watch',
  'action_items_send',
  'client_update',
];

async function getAuthAndAccess() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const canManage = profile?.role === 'admin' || user.email === 'devi@dailycookie.co';

  return { ok: true as const, supabase, canManage };
}

interface RouteContext {
  params: { id: string };
}

/**
 * PATCH /api/performance/daily-tasks/[id]
 * Supports completion toggles and task edits.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await getAuthAndAccess();
  if (!auth.ok) return auth.response;
  if (!auth.canManage) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { supabase } = auth;
  const taskId = params.id;
  if (!taskId) {
    return NextResponse.json({ error: 'Task id is required' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};

  if (typeof body.task_date === 'string' && body.task_date.trim()) {
    updateData.task_date = body.task_date.trim();
  }
  if (typeof body.account_manager_name === 'string' && body.account_manager_name.trim()) {
    updateData.account_manager_name = body.account_manager_name.trim();
  }
  if (typeof body.account_manager_id === 'string' || body.account_manager_id === null) {
    updateData.account_manager_id = body.account_manager_id;
  }
  if (typeof body.task_label === 'string' && body.task_label.trim()) {
    updateData.task_label = body.task_label.trim();
  }
  if (typeof body.task_type === 'string') {
    if (!ALLOWED_TASK_TYPES.includes(body.task_type as PKAMDailyTaskType)) {
      return NextResponse.json({ error: 'Invalid task_type' }, { status: 400 });
    }
    updateData.task_type = body.task_type;
  }
  if (typeof body.notes === 'string' || body.notes === null) {
    updateData.notes = body.notes;
  }
  if (typeof body.is_completed === 'boolean') {
    updateData.is_completed = body.is_completed;
    updateData.completed_at = body.is_completed ? new Date().toISOString() : null;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('pk_am_daily_tasks')
    .update(updateData)
    .eq('id', taskId)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ task: data });
}

/**
 * DELETE /api/performance/daily-tasks/[id]
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await getAuthAndAccess();
  if (!auth.ok) return auth.response;
  if (!auth.canManage) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { supabase } = auth;
  const taskId = params.id;
  if (!taskId) {
    return NextResponse.json({ error: 'Task id is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('pk_am_daily_tasks')
    .delete()
    .eq('id', taskId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
