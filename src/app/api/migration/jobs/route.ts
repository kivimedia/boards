import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import type { MigrationJobConfig } from '@/lib/types';
import { fetchTrelloBoard } from '@/lib/trello-migration';

/**
 * GET /api/migration/jobs
 * List all migration jobs, ordered by created_at desc.
 * Excludes child jobs (those with parent_job_id) from the main list.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('migration_jobs')
    .select('*')
    .is('parent_job_id', null)
    .order('created_at', { ascending: false });

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface CreateJobBody {
  config: MigrationJobConfig;
  /** If true, create parent + child jobs for parallel board processing */
  parallel?: boolean;
  /** Board names for display in the UI (trelloBoardId -> name) */
  board_names?: Record<string, string>;
}

const EMPTY_REPORT = {
  boards_created: 0,
  lists_created: 0,
  cards_created: 0,
  comments_created: 0,
  attachments_created: 0,
  labels_created: 0,
  checklists_created: 0,
  errors: [],
};

/**
 * POST /api/migration/jobs
 * Create a new migration job. Body: { config: MigrationJobConfig, parallel?: boolean, board_names?: Record }.
 *
 * When parallel=true, creates a parent job + one child job per board.
 * Each child has its own board_index, trello_board_id, trello_board_name.
 * Returns { parent, children } instead of a single job.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateJobBody>(request);
  if (!body.ok) return body.response;

  const { config, parallel, board_names } = body.body;

  if (!config) return errorResponse('config is required');
  if (!config.trello_api_key) return errorResponse('config.trello_api_key is required');
  if (!config.trello_token) return errorResponse('config.trello_token is required');
  if (!config.board_ids || config.board_ids.length === 0) {
    return errorResponse('config.board_ids must be a non-empty array');
  }

  const { supabase, userId } = auth.ctx;

  // Sequential mode (backward compatible)
  if (!parallel) {
    const { data, error } = await supabase
      .from('migration_jobs')
      .insert({
        type: 'trello',
        status: 'pending',
        config,
        started_by: userId,
        progress: { current: 0, total: 0, phase: 'initialized' },
        report: EMPTY_REPORT,
      })
      .select()
      .single();

    if (error) return errorResponse(error.message, 500);
    return successResponse(data, 201);
  }

  // Parallel mode: create parent + children
  // 1. Create parent job
  const { data: parent, error: parentErr } = await supabase
    .from('migration_jobs')
    .insert({
      type: 'trello',
      status: 'pending',
      config,
      started_by: userId,
      progress: { current: 0, total: config.board_ids.length, phase: 'initialized' },
      report: EMPTY_REPORT,
    })
    .select()
    .single();

  if (parentErr || !parent) return errorResponse(parentErr?.message || 'Failed to create parent job', 500);

  // 2. Resolve board names if not provided
  const names: Record<string, string> = board_names || {};
  if (!board_names) {
    try {
      const trelloAuth = { key: config.trello_api_key, token: config.trello_token };
      await Promise.all(
        config.board_ids.map(async (bid) => {
          try {
            const board = await fetchTrelloBoard(trelloAuth, bid);
            names[bid] = board.name;
          } catch {
            names[bid] = bid.slice(0, 8);
          }
        })
      );
    } catch {
      // Non-critical, fallback to IDs
    }
  }

  // 3. Create child jobs
  const childInserts = config.board_ids.map((boardId, index) => ({
    type: 'trello',
    status: 'pending',
    config,
    started_by: userId,
    parent_job_id: parent.id,
    board_index: index,
    trello_board_id: boardId,
    trello_board_name: names[boardId] || boardId.slice(0, 8),
    progress: { phase: 'pending', phase_label: 'Waiting...', items_done: 0, items_total: 0 },
    report: EMPTY_REPORT,
  }));

  const { data: children, error: childErr } = await supabase
    .from('migration_jobs')
    .insert(childInserts)
    .select();

  if (childErr) return errorResponse(childErr.message, 500);

  return successResponse({ parent, children }, 201);
}
