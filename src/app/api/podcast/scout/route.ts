import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * POST /api/podcast/scout
 * Create a new scout pipeline run. Returns the run ID for step-by-step execution.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Check for existing running/awaiting scout runs
  const { data: active } = await supabase
    .from('pga_agent_runs')
    .select('id, status, current_step')
    .eq('agent_type', 'scout')
    .in('status', ['running', 'awaiting_input'])
    .limit(1);

  if (active && active.length > 0) {
    // Return the existing run so the user can resume
    return successResponse({ run: active[0], resumed: true }, 200);
  }

  // Create a new run
  const { data, error } = await supabase
    .from('pga_agent_runs')
    .insert({
      agent_type: 'scout',
      status: 'running',
      current_step: 0,
      started_by: userId,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse({ run: data, resumed: false }, 201);
}

/**
 * GET /api/podcast/scout
 * Get the current active scout pipeline run (if any).
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  // Find active or most recent scout run
  const { data, error } = await supabase
    .from('pga_agent_runs')
    .select('*')
    .eq('agent_type', 'scout')
    .in('status', ['running', 'awaiting_input', 'completed'])
    .order('started_at', { ascending: false })
    .limit(1);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ run: data?.[0] || null });
}
