import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

interface SortBody {
  sort_by: 'created_at' | 'title' | 'priority' | 'due_date';
}

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<SortBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const listId = params.id;
  const { sort_by } = body.body;

  // Fetch placements with card data for sorting
  const { data: placements, error } = await supabase
    .from('card_placements')
    .select('id, card_id, position, cards(title, created_at, priority, due_date)')
    .eq('list_id', listId);

  if (error) return errorResponse(error.message, 500);
  if (!placements || placements.length === 0) return successResponse({ sorted: 0 });

  // Sort based on requested field
  const sorted = [...placements].sort((a, b) => {
    const cardA = (a as any).cards;
    const cardB = (b as any).cards;
    if (!cardA || !cardB) return 0;

    switch (sort_by) {
      case 'title':
        return (cardA.title || '').localeCompare(cardB.title || '');
      case 'created_at':
        return new Date(cardA.created_at).getTime() - new Date(cardB.created_at).getTime();
      case 'priority': {
        const pa = PRIORITY_ORDER[cardA.priority || 'none'] ?? 4;
        const pb = PRIORITY_ORDER[cardB.priority || 'none'] ?? 4;
        return pa - pb;
      }
      case 'due_date': {
        // Cards with no due date go to the end
        if (!cardA.due_date && !cardB.due_date) return 0;
        if (!cardA.due_date) return 1;
        if (!cardB.due_date) return -1;
        return new Date(cardA.due_date).getTime() - new Date(cardB.due_date).getTime();
      }
      default:
        return 0;
    }
  });

  // Update positions
  for (let i = 0; i < sorted.length; i++) {
    await supabase
      .from('card_placements')
      .update({ position: i })
      .eq('id', sorted[i].id);
  }

  return successResponse({ sorted: sorted.length });
}
