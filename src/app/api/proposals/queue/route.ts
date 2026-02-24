import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const url = new URL(request.url);

  const status = url.searchParams.get('status') || null;
  const tier = url.searchParams.get('tier') || null;
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  let query = supabase
    .from('proposal_drafts')
    .select(`
      *,
      card:cards(id, title, event_type, event_date, venue_name, venue_city, client_email, estimated_value),
      pattern:proposal_patterns(id, name, is_no_brainer)
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (tier) query = query.eq('confidence_tier', tier);

  const { data, error } = await query;

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
