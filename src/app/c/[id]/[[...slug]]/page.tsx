import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';

interface Props {
  params: { id: string; slug?: string[] };
}

/**
 * /c/[cardId]/[optional-title-slug]
 *
 * Deep-link to a specific card. Finds the card's board and redirects to
 * /board/[boardId]?card=[cardId] which opens the card modal automatically.
 */
export default async function CardDeepLinkPage({ params }: Props) {
  const { id: cardId } = params;

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Find the card's primary placement to get the list → board
  const { data: placement } = await supabase
    .from('card_placements')
    .select('list_id, lists(board_id)')
    .eq('card_id', cardId)
    .eq('is_mirror', false)
    .limit(1)
    .single();

  const boardId = (placement?.lists as any)?.board_id;
  if (!boardId) {
    // Fallback: try any placement
    const { data: anyPlacement } = await supabase
      .from('card_placements')
      .select('list_id, lists(board_id)')
      .eq('card_id', cardId)
      .limit(1)
      .single();

    const fallbackBoardId = (anyPlacement?.lists as any)?.board_id;
    if (!fallbackBoardId) notFound();
    redirect(`/board/${fallbackBoardId}?card=${cardId}`);
  }

  redirect(`/board/${boardId}?card=${cardId}`);
}
