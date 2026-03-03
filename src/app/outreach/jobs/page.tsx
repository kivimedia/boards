import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import JobQueueAdmin from '@/components/outreach/JobQueueAdmin';

export const metadata = { title: 'Job Queue - LinkedIn Outreach - KM Boards' };

export default async function JobQueuePage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Job Queue" />
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <JobQueueAdmin />
        </div>
      </main>
    </div>
  );
}
