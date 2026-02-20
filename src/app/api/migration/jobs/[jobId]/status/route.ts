import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import type { MigrationJob, MigrationReport } from '@/lib/types';

interface Params {
  params: { jobId: string };
}

/**
 * GET /api/migration/jobs/[jobId]/status
 * Returns parent job + all children in one response.
 * Client polls this every 1.5s to update the parallel progress grid.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { jobId } = params;

  // Fetch parent
  const { data: parent, error: parentErr } = await supabase
    .from('migration_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (parentErr || !parent) return errorResponse('Job not found', 404);

  // If this is not a parent job (no children), return as-is
  if (parent.parent_job_id) {
    return errorResponse('Use the parent job ID to get status');
  }

  // Fetch all children
  const { data: children, error: childErr } = await supabase
    .from('migration_jobs')
    .select('*')
    .eq('parent_job_id', jobId)
    .order('board_index');

  if (childErr) return errorResponse(childErr.message, 500);

  const childJobs = (children || []) as MigrationJob[];

  // Derive overall status from children (but never override 'cancelled' set by user)
  if (parent.status === 'cancelled') {
    // Already cancelled by user - don't re-derive
    return successResponse({
      parent: parent as MigrationJob,
      children: childJobs,
      overall_percent: 0,
    });
  }

  const allComplete = childJobs.length > 0 && childJobs.every((c) => c.status === 'completed');
  const anyRunning = childJobs.some((c) => c.status === 'running');
  const anyFailed = childJobs.some((c) => c.status === 'failed');
  const anyNeedsResume = childJobs.some(
    (c) => c.status === 'pending' && (c.progress as any)?.needs_resume
  );

  let derivedParentStatus = parent.status;
  if (allComplete) {
    derivedParentStatus = 'completed';
  } else if (anyRunning) {
    derivedParentStatus = 'running';
  } else if (anyFailed && !anyRunning && !anyNeedsResume) {
    // All done, at least one failed
    const allDone = childJobs.every((c) => c.status === 'completed' || c.status === 'failed' || c.status === 'cancelled');
    if (allDone) derivedParentStatus = 'completed'; // partial success
  }

  // Update parent status if changed
  if (derivedParentStatus !== parent.status) {
    const updateData: Record<string, unknown> = { status: derivedParentStatus };
    if (derivedParentStatus === 'completed') {
      updateData.completed_at = new Date().toISOString();
      // Aggregate child reports
      const aggregated: MigrationReport = {
        boards_created: 0, lists_created: 0, cards_created: 0, cards_updated: 0,
        comments_created: 0, attachments_created: 0, labels_created: 0,
        checklists_created: 0, checklist_items_updated: 0,
        placements_removed: 0, covers_resolved: 0, positions_synced: 0, errors: [],
      };
      for (const child of childJobs) {
        const r = child.report as MigrationReport;
        if (!r) continue;
        aggregated.boards_created += r.boards_created || 0;
        aggregated.lists_created += r.lists_created || 0;
        aggregated.cards_created += r.cards_created || 0;
        aggregated.cards_updated += r.cards_updated || 0;
        aggregated.comments_created += r.comments_created || 0;
        aggregated.attachments_created += r.attachments_created || 0;
        aggregated.labels_created += r.labels_created || 0;
        aggregated.checklists_created += r.checklists_created || 0;
        aggregated.checklist_items_updated += r.checklist_items_updated || 0;
        aggregated.placements_removed += r.placements_removed || 0;
        aggregated.covers_resolved += r.covers_resolved || 0;
        aggregated.positions_synced += r.positions_synced || 0;
        if (r.errors) aggregated.errors.push(...r.errors);
      }
      updateData.report = aggregated;
    }
    await supabase.from('migration_jobs').update(updateData).eq('id', jobId);
    parent.status = derivedParentStatus;
  }

  // Calculate overall percent
  let totalDone = 0;
  let totalItems = 0;
  for (const child of childJobs) {
    const p = child.progress as any;
    if (child.status === 'completed') {
      totalDone += 1;
      totalItems += 1;
    } else if (p?.items_total) {
      // Map phase to a weight (6 phases total)
      const phaseWeights: Record<string, number> = {
        importing_board: 0.05, importing_labels: 0.1, importing_lists: 0.15,
        importing_cards: 0.5, importing_attachments: 0.75, resolving_covers: 0.8,
        importing_comments_checklists: 0.9, completed: 1,
      };
      totalDone += phaseWeights[p.phase] || 0;
      totalItems += 1;
    } else {
      totalItems += 1;
    }
  }
  const overallPercent = totalItems > 0 ? Math.round((totalDone / totalItems) * 100) : 0;

  return successResponse({
    parent: parent as MigrationJob,
    children: childJobs,
    overall_percent: overallPercent,
  });
}
