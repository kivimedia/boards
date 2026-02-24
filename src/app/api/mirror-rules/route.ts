import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { seedDefaultMirrorRules } from '@/lib/mirror-rule-seeds';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('mirror_rules')
    .select(`
      *,
      source_board:boards!mirror_rules_source_board_id_fkey(id, name, type),
      target_board:boards!mirror_rules_target_board_id_fkey(id, name, type)
    `)
    .order('created_at', { ascending: true });

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface CreateMirrorRuleBody {
  source_board_id: string;
  source_list_name: string;
  target_board_id: string;
  target_list_name: string;
  direction?: string;
  condition_field?: string | null;
  condition_value?: string | null;
  remove_from_source?: boolean;
  seed_defaults?: boolean;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateMirrorRuleBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;

  // Special action: seed default rules
  if (body.body.seed_defaults) {
    const result = await seedDefaultMirrorRules(supabase);
    return successResponse(result);
  }

  const { source_board_id, source_list_name, target_board_id, target_list_name } = body.body;
  if (!source_board_id || !source_list_name || !target_board_id || !target_list_name) {
    return errorResponse('source_board_id, source_list_name, target_board_id, and target_list_name are required');
  }

  const { data, error } = await supabase
    .from('mirror_rules')
    .insert({
      source_board_id,
      source_list_name,
      target_board_id,
      target_list_name,
      direction: body.body.direction || 'one_way',
      condition_field: body.body.condition_field || null,
      condition_value: body.body.condition_value || null,
      remove_from_source: body.body.remove_from_source ?? false,
      is_active: true,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
