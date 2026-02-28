import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/meetings
 * List Fathom recordings with filters.
 * Query params: status, client_id, search, page, limit
 */
export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const clientId = url.searchParams.get('client_id');
  const search = url.searchParams.get('search');
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
  const offset = (page - 1) * limit;

  let query = supabase
    .from('fathom_recordings')
    .select(`
      id,
      fathom_recording_id,
      title,
      meeting_title,
      share_url,
      fathom_url,
      duration_seconds,
      recorded_at,
      fathom_summary,
      fathom_action_items,
      processing_status,
      matched_client_id,
      matched_by,
      calendar_invitees,
      created_at,
      clients:matched_client_id (id, name)
    `, { count: 'exact' })
    .order('recorded_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('processing_status', status);
  }
  if (clientId) {
    query = query.eq('matched_client_id', clientId);
  }
  if (search) {
    query = query.or(`title.ilike.%${search}%,meeting_title.ilike.%${search}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    meetings: data,
    total: count || 0,
    page,
    limit,
    total_pages: Math.ceil((count || 0) / limit),
  });
}
