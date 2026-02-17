import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';

interface CardPageProps {
  params: { id: string };
}

/**
 * Card permalink — /card/[id]
 * Looks up which board the card belongs to and redirects there with ?card= param.
 */
export default async function CardPage({ params }: CardPageProps) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Find the card's board via card_placements
  const { data: placement } = await supabase
    .from('card_placements')
    .select('list:lists(board_id)')
    .eq('card_id', params.id)
    .limit(1)
    .single();

  const boardId = (placement?.list as any)?.board_id;

  if (!boardId) {
    // Try direct card lookup as fallback
    const { data: card } = await supabase
      .from('cards')
      .select('id')
      .eq('id', params.id)
      .single();

    if (!card) {
      notFound();
    }
    // Card exists but has no placement — redirect to home
    redirect('/');
  }

  redirect(`/board/${boardId}?card=${params.id}`);
}
