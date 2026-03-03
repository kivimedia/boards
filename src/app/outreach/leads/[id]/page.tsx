import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import LeadDetail from '@/components/outreach/LeadDetail';

export const metadata = { title: 'Lead Detail - LinkedIn Outreach - KM Boards' };

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { id } = await params;

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Lead Detail" />
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <LeadDetail leadId={id} />
        </div>
      </main>
    </div>
  );
}
