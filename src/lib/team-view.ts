import { SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from './types';

/** Max cards returned per member in the initial load. Client can request more. */
const CARDS_PER_MEMBER = 8;

export interface TeamMemberWorkload {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  totalCards: number;
  overdueCards: number;
  dueSoonCards: number;
  completedThisWeek: number;
  cards: {
    id: string;
    title: string;
    priority: string;
    dueDate: string | null;
    boardName: string;
    listName: string;
  }[];
}

export async function fetchTeamWorkload(
  supabase: SupabaseClient
): Promise<TeamMemberWorkload[]> {
  // Fetch all profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .order('display_name');

  if (!profiles) return [];

  // Fetch all card assignments
  const { data: assignments } = await supabase
    .from('card_assignees')
    .select('user_id, card_id');

  if (!assignments) return profiles.map(profileToEmptyWorkload);

  // Fetch cards with only needed columns
  const cardIds = Array.from(new Set(assignments.map((a) => a.card_id)));
  // Supabase .in() has a limit, batch if needed
  const BATCH = 500;
  const allCards: any[] = [];
  for (let i = 0; i < cardIds.length; i += BATCH) {
    const batch = cardIds.slice(i, i + BATCH);
    const { data } = await supabase
      .from('cards')
      .select('id, title, priority, due_date')
      .in('id', batch);
    if (data) allCards.push(...data);
  }
  const cards = allCards;

  // Fetch placements
  const allPlacements: any[] = [];
  for (let i = 0; i < cardIds.length; i += BATCH) {
    const batch = cardIds.slice(i, i + BATCH);
    const { data } = await supabase
      .from('card_placements')
      .select('card_id, list:lists(name, board:boards(name))')
      .in('card_id', batch)
      .eq('is_mirror', false);
    if (data) allPlacements.push(...data);
  }
  const placements = allPlacements;

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  return profiles.map((profile: Profile) => {
    const userAssignments = assignments.filter((a) => a.user_id === profile.id);
    const userCardIds = userAssignments.map((a) => a.card_id);
    const userCards = cards?.filter((c) => userCardIds.includes(c.id)) || [];

    // Sort: overdue first, then due soon, then by due date, then no date last
    const sortedCards = [...userCards].sort((a, b) => {
      const aDate = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const bDate = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      return aDate - bDate;
    });

    const workloadCards = sortedCards.slice(0, CARDS_PER_MEMBER).map((card) => {
      const placement = placements?.find((p: any) => p.card_id === card.id) as any;
      return {
        id: card.id,
        title: card.title,
        priority: card.priority || 'none',
        dueDate: card.due_date,
        boardName: placement?.list?.board?.name || 'Unknown',
        listName: placement?.list?.name || 'Unknown',
      };
    });

    return {
      userId: profile.id,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
      role: profile.role,
      totalCards: userCards.length,
      overdueCards: userCards.filter((c) => c.due_date && new Date(c.due_date) < now).length,
      dueSoonCards: userCards.filter((c) => c.due_date && new Date(c.due_date) >= now && new Date(c.due_date) <= tomorrow).length,
      completedThisWeek: 0, // Would need column history tracking
      cards: workloadCards,
    };
  });
}

function profileToEmptyWorkload(profile: Profile): TeamMemberWorkload {
  return {
    userId: profile.id,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    role: profile.role,
    totalCards: 0,
    overdueCards: 0,
    dueSoonCards: 0,
    completedThisWeek: 0,
    cards: [],
  };
}

export function groupCardsByAssignee(
  workloads: TeamMemberWorkload[]
): Record<string, TeamMemberWorkload> {
  const map: Record<string, TeamMemberWorkload> = {};
  for (const w of workloads) {
    map[w.userId] = w;
  }
  return map;
}
