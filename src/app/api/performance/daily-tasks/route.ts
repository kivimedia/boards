import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PKAMDailyTaskType } from '@/lib/types';

export const dynamic = 'force-dynamic';

const ALLOWED_TASK_TYPES: PKAMDailyTaskType[] = [
  'fathom_watch',
  'action_items_send',
  'client_update',
];

interface CreateTaskInput {
  task_type: PKAMDailyTaskType;
  task_label: string;
  notes?: string | null;
}

function getTodayISODate() {
  return new Date().toISOString().split('T')[0];
}

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

  return { ok: true as const, supabase, user, canManage };
}

/**
 * GET /api/performance/daily-tasks
 * Query params:
 *  - date=YYYY-MM-DD (default: today)
 *  - from=YYYY-MM-DD (optional, used when date is not provided)
 *  - to=YYYY-MM-DD (optional, used when date is not provided)
 *  - am=Name (optional, exact match)
 *  - includeCompleted=true|false (default: false)
 *  - limit=number (default: 500, max: 1000)
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthAndAccess();
  if (!auth.ok) return auth.response;
  const { supabase, canManage } = auth;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || getTodayISODate();
  const fromDate = searchParams.get('from');
  const toDate = searchParams.get('to');
  const am = searchParams.get('am');
  const includeCompleted = searchParams.get('includeCompleted') === 'true';
  const limit = Math.min(parseInt(searchParams.get('limit') || '500', 10), 1000);

  let query = supabase
    .from('pk_am_daily_tasks')
    .select('*')
    .order('account_manager_name', { ascending: true })
    .order('task_type', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit);

  if (searchParams.has('date')) {
    query = query.eq('task_date', date);
  } else {
    if (fromDate) query = query.gte('task_date', fromDate);
    if (toDate) query = query.lte('task_date', toDate);
    if (!fromDate && !toDate) query = query.eq('task_date', date);
  }

  if (am?.trim()) {
    query = query.eq('account_manager_name', am.trim());
  }

  if (!includeCompleted) {
    query = query.eq('is_completed', false);
  }

  const { data: tasks, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: profileRows } = await supabase
    .from('profiles')
    .select('display_name')
    .order('display_name', { ascending: true })
    .limit(300);

  const amFromProfiles = (profileRows || [])
    .map((p: { display_name: string | null }) => p.display_name)
    .filter((name: string | null): name is string => !!name && name.trim().length > 0);

  const amFromTasks = Array.from(
    new Set((tasks || []).map((row: { account_manager_name: string }) => row.account_manager_name).filter(Boolean))
  );

  const amOptions = Array.from(new Set([...amFromProfiles, ...amFromTasks])).sort((a, b) => a.localeCompare(b));

  return NextResponse.json({
    date,
    can_manage: canManage,
    am_options: amOptions,
    tasks: tasks || [],
  });
}

/**
 * POST /api/performance/daily-tasks
 * Body:
 * {
 *   task_date?: string,
 *   account_manager_id?: string | null,
 *   account_manager_name: string,
 *   notes?: string | null,
 *   tasks: [{ task_type, task_label, notes? }]
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthAndAccess();
  if (!auth.ok) return auth.response;
  if (!auth.canManage) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { supabase, user } = auth;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const taskDate = typeof body.task_date === 'string' && body.task_date.trim()
    ? body.task_date.trim()
    : getTodayISODate();
  const accountManagerName = typeof body.account_manager_name === 'string'
    ? body.account_manager_name.trim()
    : '';
  const accountManagerId = typeof body.account_manager_id === 'string' && body.account_manager_id.trim()
    ? body.account_manager_id.trim()
    : null;
  const sharedNotes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

  if (!accountManagerName) {
    return NextResponse.json({ error: 'account_manager_name is required' }, { status: 400 });
  }

  let rawTasks: CreateTaskInput[] = [];
  if (Array.isArray(body.tasks)) {
    rawTasks = body.tasks as CreateTaskInput[];
  } else if (typeof body.task_type === 'string' && typeof body.task_label === 'string') {
    rawTasks = [{
      task_type: body.task_type as PKAMDailyTaskType,
      task_label: body.task_label,
      notes: body.notes ?? null,
    }];
  }

  const normalizedTasks = rawTasks
    .map((task) => {
      const taskType = task?.task_type;
      const taskLabel = typeof task?.task_label === 'string' ? task.task_label.trim() : '';
      const taskNotes = typeof task?.notes === 'string' && task.notes.trim() ? task.notes.trim() : sharedNotes;

      if (!ALLOWED_TASK_TYPES.includes(taskType)) return null;
      if (!taskLabel) return null;

      return {
        task_date: taskDate,
        account_manager_id: accountManagerId,
        account_manager_name: accountManagerName,
        task_type: taskType,
        task_label: taskLabel,
        notes: taskNotes,
        created_by: user.id,
      };
    })
    .filter((row): row is {
      task_date: string;
      account_manager_id: string | null;
      account_manager_name: string;
      task_type: PKAMDailyTaskType;
      task_label: string;
      notes: string | null;
      created_by: string;
    } => !!row);

  if (normalizedTasks.length === 0) {
    return NextResponse.json({
      error: 'No valid tasks found. Provide tasks[] with task_type and task_label.',
    }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('pk_am_daily_tasks')
    .insert(normalizedTasks)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    message: 'Daily tasks created',
    inserted: data?.length || 0,
    tasks: data || [],
  }, { status: 201 });
}
