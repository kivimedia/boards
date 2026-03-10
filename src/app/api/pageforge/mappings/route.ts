import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-helpers';
import { getPageForgeAuth } from '@/lib/pageforge-auth';

/**
 * GET /api/pageforge/mappings
 * List all knowledge base mappings, optionally filtered by site_profile_id.
 */
export async function GET(request: NextRequest) {
  const auth = await getPageForgeAuth(request, 'pageforge:read');
  if (!auth.ok) return auth.response;

  const siteProfileId = request.nextUrl.searchParams.get('site_profile_id');

  let query = auth.ctx.supabase
    .from('pageforge_element_mappings')
    .select('*')
    .order('figma_element_type', { ascending: true });

  if (siteProfileId) {
    query = query.eq('site_profile_id', siteProfileId);
  }

  const { data, error } = await query;
  if (error) return errorResponse(error.message, 500);

  return NextResponse.json({ mappings: data || [] });
}

/**
 * POST /api/pageforge/mappings
 * Create a new knowledge base mapping entry.
 */
export async function POST(request: NextRequest) {
  const auth = await getPageForgeAuth(request, 'pageforge:write');
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { site_profile_id, figma_element_type, divi5_module, divi5_config } = body;

  if (!figma_element_type || !divi5_module) {
    return errorResponse('figma_element_type and divi5_module are required');
  }

  const { data, error } = await auth.ctx.supabase
    .from('pageforge_element_mappings')
    .insert({
      site_profile_id: site_profile_id || null,
      figma_element_type,
      divi5_module,
      divi5_config: divi5_config || {},
      figma_properties: {},
      confidence_score: 0.80,
      times_approved: 1,
      times_overridden: 0,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);

  return NextResponse.json({ mapping: data }, { status: 201 });
}
