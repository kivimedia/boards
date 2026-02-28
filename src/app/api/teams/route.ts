import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/teams - List team templates
 * POST /api/teams - Create a new team template
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('agent_team_templates')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) return errorResponse(error.message, 500);

  return successResponse(data);
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: { slug: string; name: string; description?: string; icon?: string; phases: unknown[]; default_config?: Record<string, unknown> };

  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.slug?.trim() || !body.name?.trim() || !body.phases?.length) {
    return errorResponse('slug, name, and phases are required', 400);
  }

  const { data, error } = await supabase
    .from('agent_team_templates')
    .insert({
      slug: body.slug.trim(),
      name: body.name.trim(),
      description: body.description || '',
      icon: body.icon || '',
      phases: body.phases,
      default_config: body.default_config || {},
      created_by: userId,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);

  return successResponse(data, 201);
}
