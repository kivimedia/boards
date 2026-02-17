import { SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from './types';

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

  // Fetch all cards
  const cardIds = Array.from(new Set(assignments.map((a) => a.card_id)));
  const { data: cards } = await supabase
    .from('cards')
    .select('*')
    .in('id', cardIds);

  // Fetch placements
  const { data: placements } = await supabase
    .from('card_placements')
    .select('card_id, list:lists(name, board:boards(name))')
    .in('card_id', cardIds)
    .eq('is_mirror', false);

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  return profiles.map((profile: Profile) => {
    const userAssignments = assignments.filter((a) => a.user_id === profile.id);
    const userCardIds = userAssignments.map((a) => a.card_id);
    const userCards = cards?.filter((c) => userCardIds.includes(c.id)) || [];

    const workloadCards = userCards.map((card) => {
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
