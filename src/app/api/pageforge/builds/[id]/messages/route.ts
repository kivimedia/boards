import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

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
 * Send a user message to the build chat.
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

  // Get current build phase for context
  const { data: build } = await supabase
    .from('pageforge_builds')
    .select('status, current_phase')
    .eq('id', params.id)
    .single();

  // Get user display name
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('display_name')
    .eq('user_id', user.id)
    .single();

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

  return NextResponse.json({ message });
}
