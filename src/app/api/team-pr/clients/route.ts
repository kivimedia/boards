import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * GET /api/team-pr/clients
 * List PR clients for authenticated user. Supports ?search=, ?limit=, ?offset=
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  let query = supabase
    .from('pr_clients')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`name.ilike.%${search}%,company.ilike.%${search}%,industry.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) return errorResponse(error.message, 500);

  return successResponse({ items: data, total: count });
}

/**
 * POST /api/team-pr/clients
 * Create a new PR client
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{
    name: string;
    company?: string;
    industry?: string;
    website?: string;
    brand_voice?: Record<string, unknown>;
    pitch_angles?: Array<Record<string, unknown>>;
    tone_rules?: Record<string, unknown>;
    bio?: string;
    headshot_url?: string;
    media_kit_url?: string;
    exclusion_list?: string[];
    target_markets?: string[];
  }>(request);
  if (!body.ok) return body.response;

  if (!body.body.name?.trim()) {
    return errorResponse('Name is required');
  }

  const { supabase, userId } = auth.ctx;
  const { data, error } = await supabase
    .from('pr_clients')
    .insert({
      user_id: userId,
      name: body.body.name.trim(),
      company: body.body.company || null,
      industry: body.body.industry || null,
      website: body.body.website || null,
      brand_voice: body.body.brand_voice || {},
      pitch_angles: body.body.pitch_angles || [],
      tone_rules: body.body.tone_rules || {},
      bio: body.body.bio || null,
      headshot_url: body.body.headshot_url || null,
      media_kit_url: body.body.media_kit_url || null,
      exclusion_list: body.body.exclusion_list || [],
      target_markets: body.body.target_markets || [],
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
