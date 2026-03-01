import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getProviderKey } from '@/lib/ai/providers';
import { logUsage } from '@/lib/ai/cost-tracker';

/**
 * GET /api/pageforge/builds/[id]/messages
 * Returns all chat messages for a build, ordered by created_at ASC.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: messages, error } = await supabase
    .from('pageforge_build_messages')
    .select('*')
    .eq('build_id', params.id)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: messages || [] });
}

/**
 * POST /api/pageforge/builds/[id]/messages
 * Send a user message to the build chat, then generate an AI orchestrator reply.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { content } = body;

  if (!content?.trim()) {
    return NextResponse.json({ error: 'Message content required' }, { status: 400 });
  }

  // Get current build for context
  const { data: build } = await supabase
    .from('pageforge_builds')
    .select('status, current_phase, page_title, page_slug, figma_file_key, vqa_score_overall, vqa_score_desktop, vqa_score_tablet, vqa_score_mobile, wp_draft_url, wp_live_url, error_log, total_cost_usd')
    .eq('id', params.id)
    .single();

  // Get user display name
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('display_name')
    .eq('user_id', user.id)
    .single();

  // Insert user message
  const { data: message, error } = await supabase
    .from('pageforge_build_messages')
    .insert({
      build_id: params.id,
      role: 'user',
      sender_name: profile?.display_name || user.email?.split('@')[0] || 'User',
      sender_id: user.id,
      content: content.trim(),
      phase: build?.status || null,
      phase_index: build?.current_phase ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Generate AI response in background (don't block the user message response)
  generateOrchestratorReply(supabase, params.id, content.trim(), build, user.id).catch((err) => {
    console.error('[PageForge Chat] AI reply failed:', err);
  });

  return NextResponse.json({ message });
}

async function generateOrchestratorReply(
  supabase: any,
  buildId: string,
  userMessage: string,
  build: any,
  userId: string
) {
  const startTime = Date.now();

  // Get recent messages for context (last 10)
  const { data: recentMsgs } = await supabase
    .from('pageforge_build_messages')
    .select('role, sender_name, content')
    .eq('build_id', buildId)
    .order('created_at', { ascending: false })
    .limit(10);

  const chatHistory = (recentMsgs || []).reverse().map((m: any) =>
    `${m.role === 'user' ? 'User' : m.role === 'orchestrator' ? 'Orchestrator' : 'System'}: ${m.content}`
  ).join('\n');

  const buildContext = build ? `
Build Status: ${build.status}
Page: ${build.page_title || 'Unknown'}${build.page_slug ? ` (/${build.page_slug})` : ''}
Phase: ${build.current_phase ?? 'N/A'}
VQA Scores: Desktop=${build.vqa_score_desktop ?? '-'}%, Tablet=${build.vqa_score_tablet ?? '-'}%, Mobile=${build.vqa_score_mobile ?? '-'}%, Overall=${build.vqa_score_overall ?? '-'}%
Draft URL: ${build.wp_draft_url || 'Not yet created'}
Live URL: ${build.wp_live_url || 'Not yet published'}
Total Cost: $${build.total_cost_usd?.toFixed(3) || '0.000'}
Errors: ${build.error_log ? JSON.stringify(build.error_log).substring(0, 300) : 'None'}
`.trim() : 'Build data unavailable.';

  const systemPrompt = `You are the PageForge Build Orchestrator, an AI assistant managing a Figma-to-WordPress automated build pipeline.

You are chatting with the project team member about this build. Be helpful, concise, and informative.

Current build context:
${buildContext}

Recent conversation:
${chatHistory}

Guidelines:
- Answer questions about the build status, phases, errors, and next steps
- If asked about the build quality, reference VQA scores and any available data
- If there are errors, explain them in simple terms and suggest fixes
- If the build is at a gate (developer_review_gate or am_signoff_gate), help the reviewer understand what to check
- Keep responses under 200 words
- Be direct and practical, not chatty
- If you don't know something, say so rather than guessing`;

  try {
    const apiKey = await getProviderKey(supabase, 'google');
    if (!apiKey) {
      // Fallback: insert a message saying AI reply isn't available
      await supabase.from('pageforge_build_messages').insert({
        build_id: buildId,
        role: 'orchestrator',
        sender_name: 'Orchestrator',
        content: 'AI reply is not available - Google AI API key not configured.',
        phase: build?.status || null,
        phase_index: build?.current_phase ?? null,
      });
      return;
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      systemInstruction: { role: 'model', parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    });

    const replyText = result.response.text().trim();
    const latencyMs = Date.now() - startTime;
    const usage = result.response.usageMetadata;

    // Insert orchestrator reply
    await supabase.from('pageforge_build_messages').insert({
      build_id: buildId,
      role: 'orchestrator',
      sender_name: 'Orchestrator',
      content: replyText,
      phase: build?.status || null,
      phase_index: build?.current_phase ?? null,
      metadata: { ai_reply: true, model: 'gemini-2.0-flash', latency_ms: latencyMs },
    });

    // Log usage
    try {
      await logUsage(supabase, {
        userId,
        activity: 'pageforge_orchestrator' as any,
        provider: 'google',
        modelId: 'gemini-2.0-flash',
        inputTokens: usage?.promptTokenCount || 0,
        outputTokens: usage?.candidatesTokenCount || 0,
        latencyMs,
        status: 'success',
        metadata: { chat_reply: true, build_id: buildId },
      });
    } catch {
      // non-critical
    }
  } catch (err) {
    console.error('[PageForge Chat] AI generation failed:', err);
    // Insert an error message so the user knows
    try {
      await supabase.from('pageforge_build_messages').insert({
        build_id: buildId,
        role: 'orchestrator',
        sender_name: 'Orchestrator',
        content: `I couldn't generate a response right now. Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        phase: build?.status || null,
        phase_index: build?.current_phase ?? null,
        metadata: { ai_reply_error: true },
      });
    } catch {
      // give up silently
    }
  }
}
