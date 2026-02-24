import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * GET /api/podcast/runs/[id]
 * Get a single agent run with details
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id } = params;

  const { data, error } = await supabase
    .from('pga_agent_runs')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return errorResponse('Run not found', 404);
  return successResponse(data);
}

/**
 * PATCH /api/podcast/runs/[id]
 * Update a run (mark completed/failed, update counters)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{
    status?: 'running' | 'completed' | 'failed';
    candidates_found?: number;
    emails_created?: number;
    tokens_used?: number;
    output_json?: Record<string, unknown>;
    error_message?: string;
  }>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const { id } = params;
  const updates: Record<string, unknown> = {};

  if (body.body.status) {
    updates.status = body.body.status;
    if (body.body.status === 'completed' || body.body.status === 'failed') {
      updates.ended_at = new Date().toISOString();
    }
  }
  if (body.body.candidates_found !== undefined) updates.candidates_found = body.body.candidates_found;
  if (body.body.emails_created !== undefined) updates.emails_created = body.body.emails_created;
  if (body.body.tokens_used !== undefined) updates.tokens_used = body.body.tokens_used;
  if (body.body.output_json !== undefined) updates.output_json = body.body.output_json;
  if (body.body.error_message !== undefined) updates.error_message = body.body.error_message;

  const { data, error } = await supabase
    .from('pga_agent_runs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
