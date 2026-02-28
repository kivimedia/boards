import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getSkill, getSkillBySlug } from '@/lib/agent-engine';
import { resolveSkillChain } from '@/lib/ai/agent-chain';

/**
 * POST /api/agents/run-vps
 * Start an agent execution on VPS (background, no SSE timeout).
 * Creates a vps_jobs entry that the VPS worker picks up via Realtime.
 *
 * Body: {
 *   skill_id: string;
 *   input_message: string;
 *   board_id?: string;
 *   max_iterations?: number;
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: {
    skill_id: string;
    input_message: string;
    board_id?: string;
    max_iterations?: number;
  };

  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.skill_id || !body.input_message?.trim()) {
    return errorResponse('skill_id and input_message are required', 400);
  }

  // Load skill to check if it has dependencies (chain vs standalone)
  const skill = await getSkill(supabase, body.skill_id);
  if (!skill) {
    return errorResponse('Skill not found', 404);
  }

  const hasDependencies = (skill.depends_on ?? []).length > 0;

  if (hasDependencies) {
    // Resolve chain and verify it's valid before creating job
    try {
      const chain = await resolveSkillChain(supabase, skill.slug);
      if (chain.steps.length <= 1) {
        // Single step - treat as standalone
        return createStandaloneJob(supabase, userId, body, skill.slug);
      }

      // Create chain job
      const { data: job, error: jobErr } = await supabase
        .from('vps_jobs')
        .insert({
          job_type: 'agent_chain',
          status: 'pending',
          user_id: userId,
          payload: {
            target_skill_slug: skill.slug,
            board_id: body.board_id || null,
            user_id: userId,
            input_prompt: body.input_message.trim(),
          },
        })
        .select()
        .single();

      if (jobErr) return errorResponse(jobErr.message, 500);

      return successResponse({
        job_id: job.id,
        job_type: 'agent_chain',
        chain_steps: chain.steps.map(s => ({ slug: s.skill_slug, name: s.skill_name })),
        total_steps: chain.total_steps,
      }, 201);
    } catch (err: any) {
      return errorResponse(`Chain resolution failed: ${err.message}`, 400);
    }
  }

  return createStandaloneJob(supabase, userId, body, skill.slug);
}

async function createStandaloneJob(
  supabase: any,
  userId: string,
  body: { skill_id: string; input_message: string; board_id?: string; max_iterations?: number },
  skillSlug: string
) {
  const { data: job, error: jobErr } = await supabase
    .from('vps_jobs')
    .insert({
      job_type: 'agent',
      status: 'pending',
      user_id: userId,
      payload: {
        skill_id: body.skill_id,
        board_id: body.board_id || null,
        user_id: userId,
        input_message: body.input_message.trim(),
        max_iterations: body.max_iterations || 10,
      },
    })
    .select()
    .single();

  if (jobErr) return errorResponse(jobErr.message, 500);

  return successResponse({
    job_id: job.id,
    job_type: 'agent',
    skill_slug: skillSlug,
  }, 201);
}
