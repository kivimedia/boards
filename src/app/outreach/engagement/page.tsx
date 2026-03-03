import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import EngagementFunnel from '@/components/outreach/EngagementFunnel';

export const metadata = { title: 'Engagement - LinkedIn Outreach - KM Boards' };

export default async function EngagementPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Engagement Analytics" />
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <EngagementFunnel />
        </div>
      </main>
    </div>
  );
}
