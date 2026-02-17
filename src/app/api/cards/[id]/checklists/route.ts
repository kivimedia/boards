import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const cardId = params.id;

  const { data, error } = await supabase
    .from('checklists')
    .select('*, items:checklist_items(*)')
    .eq('card_id', cardId)
    .order('position', { ascending: true });

  if (error) return errorResponse(error.message, 500);

  // Sort items by position within each checklist
  const sorted = data.map((checklist: Record<string, unknown>) => ({
    ...checklist,
    items: Array.isArray(checklist.items)
      ? (checklist.items as Record<string, unknown>[]).sort(
          (a: Record<string, unknown>, b: Record<string, unknown>) =>
            (a.position as number) - (b.position as number)
        )
      : [],
  }));

  return successResponse(sorted);
}

interface CreateChecklistBody {
  title: string;
  position?: number;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateChecklistBody>(request);
  if (!body.ok) return body.response;

  if (!body.body.title?.trim()) return errorResponse('Checklist title is required');

  const { supabase, userId } = auth.ctx;
  const cardId = params.id;

  // Determine position if not provided
  let position = body.body.position;
  if (position === undefined) {
    const { data: existing } = await supabase
      .from('checklists')
      .select('position')
      .eq('card_id', cardId)
      .order('position', { ascending: false })
      .limit(1);

    position = existing && existing.length > 0 ? (existing[0].position as number) + 1 : 0;
  }

  const { data, error } = await supabase
    .from('checklists')
    .insert({
      card_id: cardId,
      title: body.body.title.trim(),
      position,
    })
    .select('*, items:checklist_items(*)')
    .single();

  if (error) return errorResponse(error.message, 500);

  // Log activity
  await supabase.from('activity_log').insert({
    card_id: cardId,
    user_id: userId,
    event_type: 'checklist_created',
    metadata: { checklist_id: data.id, title: data.title },
  });

  return successResponse(data, 201);
}
