import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * GET /api/team-pr/territories
 * List territories. Required query: client_id. Optional: search, limit, offset.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');
  const search = searchParams.get('search');
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  if (!clientId) {
    return errorResponse('client_id is required');
  }

  let query = supabase
    .from('pr_territories')
    .select('*', { count: 'exact' })
    .eq('client_id', clientId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`name.ilike.%${search}%,country_code.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) return errorResponse(error.message, 500);

  return successResponse({ items: data, total: count });
}

/**
 * POST /api/team-pr/territories
 * Create a new territory
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{
    client_id: string;
    name: string;
    country_code?: string;
    language?: string;
    market_data?: Record<string, unknown>;
    signal_keywords?: string[];
    seed_outlets?: Array<Record<string, unknown>>;
    seasonal_calendar?: Record<string, unknown>;
    pitch_norms?: string;
  }>(request);
  if (!body.ok) return body.response;

  if (!body.body.client_id?.trim()) {
    return errorResponse('client_id is required');
  }
  if (!body.body.name?.trim()) {
    return errorResponse('name is required');
  }

  const { supabase, userId } = auth.ctx;
  const { data, error } = await supabase
    .from('pr_territories')
    .insert({
      user_id: userId,
      client_id: body.body.client_id,
      name: body.body.name.trim(),
      country_code: body.body.country_code || null,
      language: body.body.language || null,
      market_data: body.body.market_data || {},
      signal_keywords: body.body.signal_keywords || [],
      seed_outlets: body.body.seed_outlets || [],
      seasonal_calendar: body.body.seasonal_calendar || {},
      pitch_norms: body.body.pitch_norms || null,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
