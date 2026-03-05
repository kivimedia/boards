import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

type Params = { params: Promise<{ id: string }> };

interface SiblingItemResponse {
  id: string;
  run_id: string | null;
  topic: string;
  silo: string | null;
  keywords: string[];
  target_word_count: number;
  scheduled_date: string;
  calendar_id: string;
  calendar_name: string | null;
  calendar_item_status: string;
  pipeline_status: string | null;
}

/**
 * GET /api/seo/runs/[id]/siblings
 * Return all calendar items from the same calendar as this run,
 * plus pipeline status for each launched sibling.
 */
export async function GET(
  _request: NextRequest,
  { params }: Params
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id } = await params;

  // Verify run exists first
  const { data: run, error: runErr } = await supabase
    .from('seo_pipeline_runs')
    .select('id')
    .eq('id', id)
    .single();

  if (runErr || !run) return errorResponse('Run not found', 404);

  // Find calendar item linked to this run
  const { data: currentItem, error: itemErr } = await supabase
    .from('seo_calendar_items')
    .select('id, calendar_id, scheduled_date')
    .eq('run_id', id)
    .limit(1)
    .maybeSingle();

  if (itemErr) return errorResponse(itemErr.message, 500);

  if (!currentItem?.calendar_id) {
    return successResponse({
      calendar: null,
      current_item_id: null,
      current_scheduled_date: null,
      items: [],
    });
  }

  const calendarId = currentItem.calendar_id;

  const { data: calendar, error: calendarErr } = await supabase
    .from('seo_calendars')
    .select('id, name')
    .eq('id', calendarId)
    .single();

  if (calendarErr) return errorResponse(calendarErr.message, 500);

  const { data: siblingItems, error: siblingsErr } = await supabase
    .from('seo_calendar_items')
    .select('id, run_id, topic, silo, keywords, target_word_count, scheduled_date, status, sort_order')
    .eq('calendar_id', calendarId)
    .order('scheduled_date', { ascending: true })
    .order('sort_order', { ascending: true });

  if (siblingsErr) return errorResponse(siblingsErr.message, 500);

  const runIds = (siblingItems || [])
    .map(item => item.run_id)
    .filter((runId): runId is string => Boolean(runId));

  const pipelineStatusByRunId = new Map<string, string>();
  if (runIds.length > 0) {
    const { data: runs, error: runsErr } = await supabase
      .from('seo_pipeline_runs')
      .select('id, status')
      .in('id', runIds);

    if (runsErr) return errorResponse(runsErr.message, 500);

    for (const siblingRun of runs || []) {
      pipelineStatusByRunId.set(siblingRun.id, siblingRun.status);
    }
  }

  const items: SiblingItemResponse[] = (siblingItems || []).map(item => ({
    id: item.id,
    run_id: item.run_id,
    topic: item.topic,
    silo: item.silo,
    keywords: item.keywords || [],
    target_word_count: item.target_word_count,
    scheduled_date: item.scheduled_date,
    calendar_id: calendar.id,
    calendar_name: calendar.name || null,
    calendar_item_status: item.status,
    pipeline_status: item.run_id ? pipelineStatusByRunId.get(item.run_id) || null : null,
  }));

  return successResponse({
    calendar: { id: calendar.id, name: calendar.name || null },
    current_item_id: currentItem.id,
    current_scheduled_date: currentItem.scheduled_date,
    items,
  });
}
