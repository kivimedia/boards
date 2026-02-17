import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import type { MigrationJobConfig } from '@/lib/types';

/**
 * GET /api/migration/jobs
 * List all migration jobs, ordered by created_at desc.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('migration_jobs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface CreateJobBody {
  config: MigrationJobConfig;
}

/**
 * POST /api/migration/jobs
 * Create a new migration job. Body: { config: MigrationJobConfig }.
 * Sets started_by to userId, status to 'pending'.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateJobBody>(request);
  if (!body.ok) return body.response;

  const { config } = body.body;

  if (!config) return errorResponse('config is required');
  if (!config.trello_api_key) return errorResponse('config.trello_api_key is required');
  if (!config.trello_token) return errorResponse('config.trello_token is required');
  if (!config.board_ids || config.board_ids.length === 0) {
    return errorResponse('config.board_ids must be a non-empty array');
  }

  const { supabase, userId } = auth.ctx;

  const { data, error } = await supabase
    .from('migration_jobs')
    .insert({
      type: 'trello',
      status: 'pending',
      config,
      started_by: userId,
      progress: { current: 0, total: 0, phase: 'initialized' },
      report: {
        boards_created: 0,
        lists_created: 0,
        cards_created: 0,
        comments_created: 0,
        attachments_created: 0,
        labels_created: 0,
        checklists_created: 0,
        errors: [],
      },
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
