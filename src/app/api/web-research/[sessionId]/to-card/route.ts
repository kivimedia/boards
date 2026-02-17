import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

/**
 * POST /api/web-research/[sessionId]/to-card
 * Convert research results into a board card.
 *
 * Body: {
 *   board_id: string;
 *   list_id: string;
 *   item_indices?: number[];  // Which extracted items to include (all if omitted)
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { sessionId } = await params;

  let body: { board_id: string; list_id: string; item_indices?: number[] };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.board_id || !body.list_id) {
    return errorResponse('board_id and list_id are required', 400);
  }

  // Verify session ownership
  const { data: session } = await supabase
    .from('web_research_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!session) {
    return errorResponse('Session not found', 404);
  }

  if (session.status !== 'completed') {
    return errorResponse('Session must be completed to import', 400);
  }

  // Build card from research results
  const extractedItems = (session.extracted_items || []) as any[];
  const items = body.item_indices
    ? body.item_indices.map((i: number) => extractedItems[i]).filter(Boolean)
    : extractedItems;

  const title = items.length > 0
    ? items[0].title || `Research: ${session.task_type}`
    : `Research: ${session.task_type}`;

  const descriptionParts: string[] = [];
  descriptionParts.push(`**Research Type:** ${session.task_type}`);
  descriptionParts.push(`**Prompt:** ${session.input_prompt.slice(0, 200)}`);
  if (session.input_urls?.length) {
    descriptionParts.push(`**URLs:** ${session.input_urls.join(', ')}`);
  }
  descriptionParts.push('');
  descriptionParts.push('## Summary');
  descriptionParts.push(session.output_summary?.slice(0, 2000) || 'No summary');

  if (items.length > 0) {
    descriptionParts.push('');
    descriptionParts.push('## Extracted Items');
    for (const item of items.slice(0, 20)) {
      descriptionParts.push(`- **${item.title || item.type}**: ${(item.content || '').slice(0, 200)}`);
    }
  }

  // Create card
  const cardId = crypto.randomUUID();
  const { error: cardError } = await supabase.from('cards').insert({
    id: cardId,
    title: title.slice(0, 200),
    description: descriptionParts.join('\n'),
    priority: 'none',
    created_by: userId,
  });

  if (cardError) {
    return errorResponse(`Failed to create card: ${cardError.message}`, 500);
  }

  // Create placement
  const { data: maxPos } = await supabase
    .from('card_placements')
    .select('position')
    .eq('list_id', body.list_id)
    .order('position', { ascending: false })
    .limit(1);

  const nextPos = maxPos?.length ? (maxPos[0] as any).position + 1 : 0;

  await supabase.from('card_placements').insert({
    card_id: cardId,
    list_id: body.list_id,
    position: nextPos,
    is_mirror: false,
  });

  return Response.json({
    data: {
      card_id: cardId,
      title,
      items_imported: items.length,
    },
  });
}
