import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { getSkill } from '@/lib/agent-engine';

/**
 * GET /api/agents/sessions
 * List current user's recent agent sessions (for tab restoration on page load).
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const { data, error } = await supabase
    .from('agent_sessions')
    .select('*, skill:agent_skills(id, name, slug, icon, category, quality_tier)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) return errorResponse(error.message, 500);

  // Mark any stale 'running' sessions as idle (server-side agent died on page nav)
  const stale = (data || []).filter((s: any) => s.status === 'running');
  if (stale.length > 0) {
    await supabase
      .from('agent_sessions')
      .update({ status: 'idle' })
      .in('id', stale.map((s: any) => s.id));
    for (const s of stale) s.status = 'idle';
  }

  return NextResponse.json({ data: data || [] });
}

/**
 * POST /api/agents/sessions
 * Create a new session (no execution). Returns JSON with session data.
 * The client should then send the first message via POST /api/agents/sessions/:id/message.
 * Body: { skill_id, title?, board_id? }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: { skill_id: string; title?: string; board_id?: string };
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }

  if (!body.skill_id) {
    return errorResponse('skill_id is required', 400);
  }

  const skill = await getSkill(supabase, body.skill_id);
  if (!skill) return errorResponse('Skill not found', 404);

  // Build system prompt
  let systemPrompt = skill.system_prompt;
  const hasTools = (skill.supported_tools?.length ?? 0) > 0;
  if (hasTools) {
    systemPrompt += '\n\nYou have tools available. Use them to gather information and take actions. Use the think tool to reason through complex problems before acting.';
  }

  const title = body.title || 'New session';

  // Create session (idle — no execution yet)
  const { data: session, error: insertErr } = await supabase
    .from('agent_sessions')
    .insert({
      user_id: userId,
      skill_id: body.skill_id,
      board_id: body.board_id || null,
      title,
      system_prompt: systemPrompt,
      status: 'idle',
    })
    .select('*')
    .single();

  if (insertErr || !session) return errorResponse(insertErr?.message || 'Failed to create session', 500);

  return NextResponse.json({
    data: {
      id: session.id,
      title,
      skill_name: skill.name,
      skill_icon: skill.icon,
    },
  });
}
