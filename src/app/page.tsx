import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import DashboardContent from '@/components/board/DashboardContent';
import GlobalSearchBar from '@/components/smart-search/GlobalSearchBar';

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  // Parallel fetches for boards + stats
  const [boardsRes, assignedRes, overdueRes, dueWeekRes, recentActivityRes] = await Promise.all([
    supabase.from('boards').select('*').order('created_at', { ascending: true }),
    // Cards assigned to user
    supabase
      .from('card_assignees')
      .select('card_id, cards(id, title, due_date, priority)')
      .eq('user_id', user.id),
    // Overdue cards assigned to user
    supabase
      .from('card_assignees')
      .select('card_id, cards!inner(id, title, due_date)')
      .eq('user_id', user.id)
      .lt('cards.due_date', todayStr)
      .not('cards.due_date', 'is', null),
    // Due this week
    supabase
      .from('card_assignees')
      .select('card_id, cards!inner(id, title, due_date)')
      .eq('user_id', user.id)
      .gte('cards.due_date', todayStr)
      .lt('cards.due_date', weekEndStr),
    // Recent activity (last 10 comments across boards)
    supabase
      .from('comments')
      .select('id, content, created_at, card_id, user_id, cards(title), profiles:user_id(display_name, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const stats = {
    assignedCount: (assignedRes.data || []).length,
    overdueCount: (overdueRes.data || []).length,
    dueThisWeekCount: (dueWeekRes.data || []).length,
    recentActivity: (recentActivityRes.data || []).map((c: any) => ({
      id: c.id,
      content: c.content?.slice(0, 100) || '',
      created_at: c.created_at,
      card_id: c.card_id,
      card_title: c.cards?.title || '',
      user_name: c.profiles?.display_name || 'Unknown',
      user_avatar: c.profiles?.avatar_url || null,
    })),
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar initialBoards={boardsRes.data || []} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Boards">
          <GlobalSearchBar />
        </Header>
        <DashboardContent initialBoards={boardsRes.data || []} stats={stats} />
      </main>
    </div>
  );
}
