import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import PageForgeDashboard from '@/components/pageforge/PageForgeDashboard';

export const metadata = { title: 'PageForge - KM Boards' };

export default async function PageForgePage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="PageForge" />
        <div className="flex-1 overflow-y-auto">
          <PageForgeDashboard />
        </div>
      </main>
    </div>
  );
}
