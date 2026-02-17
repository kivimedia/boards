import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = createServerSupabaseClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  // Try fetching boards
  const { data: boards, error: boardsError } = await supabase
    .from('boards')
    .select('id, name, type')
    .limit(5);

  return NextResponse.json({
    user: user ? { id: user.id, email: user.email } : null,
    userError: userError?.message,
    session: session ? { access_token_preview: session.access_token?.substring(0, 20) + '...' } : null,
    sessionError: sessionError?.message,
    boards: boards?.map(b => ({ id: b.id, name: b.name, type: b.type })),
    boardsError: boardsError?.message,
    boardsCount: boards?.length ?? 0,
  });
}
