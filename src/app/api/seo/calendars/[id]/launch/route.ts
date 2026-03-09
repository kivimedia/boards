import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { createPipelineRun } from '@/lib/seo/create-pipeline-run';

type Params = { params: Promise<{ id: string }> };

interface LaunchBody {
  item_ids: string[];
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<LaunchBody>(request);
  if (!body.ok) return body.response;

  const { supabase, userId } = auth.ctx;
  const { id } = await params;
  const { item_ids } = body.body;

  if (!item_ids?.length) return errorResponse('item_ids is required', 400);

  // Fetch items
  const { data: items, error: itemsErr } = await supabase
    .from('seo_calendar_items')
    .select('*, calendar:seo_calendars(team_config_id, client_id)')
    .in('id', item_ids)
    .eq('calendar_id', id)
    .eq('status', 'planned');

  if (itemsErr) return errorResponse(itemsErr.message, 500);
  if (!items?.length) return errorResponse('No launchable items found', 400);

  const results: Array<{ item_id: string; run_id: string; job_id: string }> = [];
  const failures: Array<{ item_id: string; topic: string; error: string }> = [];

  for (const item of items) {
    try {
      if (!item.team_config_id) {
        failures.push({
          item_id: item.id,
          topic: item.topic,
          error: 'Missing team_config_id on calendar item',
        });
        continue;
      }

      // Build assignment with images + context for the writing agent
      const itemImages = Array.isArray(item.images) ? item.images : [];
      const assignment: Record<string, unknown> = {};
      if (item.outline_notes) assignment.outline_notes = item.outline_notes;
      if (item.keywords?.length) assignment.keywords = item.keywords;
      if (itemImages.length > 0) {
        assignment.images = itemImages.map((img: { url: string; filename: string; context: string | null }) => ({
          url: img.url,
          filename: img.filename,
          context: img.context,
        }));
      }

      const { run, jobId } = await createPipelineRun(supabase, {
        userId,
        teamConfigId: item.team_config_id,
        clientId: item.calendar?.client_id || null,
        topic: item.topic,
        silo: item.silo,
        assignment: Object.keys(assignment).length > 0 ? assignment : null,
      });

      const runId = run.id as string;
      if (!runId) throw new Error('Pipeline run created without a valid run ID');

      const { error: itemUpdateErr } = await supabase
        .from('seo_calendar_items')
        .update({
          status: 'launched',
          run_id: runId,
          launched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      if (itemUpdateErr) {
        // Prevent orphaned processing if run was created but calendar item failed to link.
        await supabase.from('seo_pipeline_runs').update({ status: 'scrapped' }).eq('id', runId);
        await supabase
          .from('vps_jobs')
          .update({ status: 'paused', error: `Calendar launch failed to link item: ${itemUpdateErr.message}` })
          .eq('id', jobId);
        throw new Error(`Failed to mark calendar item launched: ${itemUpdateErr.message}`);
      }

      results.push({ item_id: item.id, run_id: runId, job_id: jobId });
    } catch (err) {
      console.error(`[seo] Failed to launch item ${item.id}:`, err);
      failures.push({
        item_id: item.id,
        topic: item.topic,
        error: err instanceof Error ? err.message : 'Unknown launch error',
      });
    }
  }

  if (results.length === 0) {
    return NextResponse.json(
      {
        error: failures[0]?.error || 'Failed to launch selected items',
        launched: 0,
        failed: failures,
      },
      { status: 500 }
    );
  }

  if (failures.length > 0) {
    return successResponse(
      {
        launched: results.length,
        runs: results,
        failed: failures,
      },
      207
    );
  }

  return successResponse({ launched: results.length, runs: results, failed: [] });
}
