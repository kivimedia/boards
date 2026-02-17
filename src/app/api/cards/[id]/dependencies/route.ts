import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { DependencyType } from '@/lib/types';

interface Params {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const cardId = params.id;

  // Fetch dependencies where this card is the source (outgoing)
  const { data: outgoing, error: outErr } = await supabase
    .from('card_dependencies')
    .select('*, target_card:cards!card_dependencies_target_card_id_fkey(*)')
    .eq('source_card_id', cardId);

  if (outErr) return errorResponse(outErr.message, 500);

  // Fetch dependencies where this card is the target (incoming)
  const { data: incoming, error: inErr } = await supabase
    .from('card_dependencies')
    .select('*, source_card:cards!card_dependencies_source_card_id_fkey(*)')
    .eq('target_card_id', cardId);

  if (inErr) return errorResponse(inErr.message, 500);

  return successResponse({ outgoing, incoming });
}

const VALID_DEPENDENCY_TYPES: DependencyType[] = ['blocked_by', 'blocking', 'related'];

interface CreateDependencyBody {
  target_card_id: string;
  dependency_type: DependencyType;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateDependencyBody>(request);
  if (!body.ok) return body.response;

  const { target_card_id, dependency_type } = body.body;

  if (!target_card_id) return errorResponse('target_card_id is required');
  if (!dependency_type || !VALID_DEPENDENCY_TYPES.includes(dependency_type)) {
    return errorResponse(`dependency_type must be one of: ${VALID_DEPENDENCY_TYPES.join(', ')}`);
  }

  const { supabase, userId } = auth.ctx;
  const cardId = params.id;

  if (target_card_id === cardId) {
    return errorResponse('A card cannot depend on itself');
  }

  // Check for duplicate dependency
  const { data: existing } = await supabase
    .from('card_dependencies')
    .select('id')
    .eq('source_card_id', cardId)
    .eq('target_card_id', target_card_id)
    .eq('dependency_type', dependency_type)
    .single();

  if (existing) return errorResponse('This dependency already exists');

  const { data, error } = await supabase
    .from('card_dependencies')
    .insert({
      source_card_id: cardId,
      target_card_id,
      dependency_type,
      created_by: userId,
    })
    .select('*, target_card:cards!card_dependencies_target_card_id_fkey(*)')
    .single();

  if (error) return errorResponse(error.message, 500);

  // Log activity
  await supabase.from('activity_log').insert({
    card_id: cardId,
    user_id: userId,
    event_type: 'dependency_added',
    metadata: {
      dependency_id: data.id,
      target_card_id,
      dependency_type,
    },
  });

  return successResponse(data, 201);
}
