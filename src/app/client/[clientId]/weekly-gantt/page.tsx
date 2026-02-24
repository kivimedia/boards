import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import WeeklyGanttBoard from '@/components/weekly-gantt/WeeklyGanttBoard';

interface PageProps {
  params: { clientId: string };
}

export default async function ClientWeeklyGanttPage({ params }: PageProps) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, contacts')
    .eq('id', params.clientId)
    .single();

  if (!client) notFound();

  // Fetch team members for owner picker
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, role')
    .eq('account_status', 'active')
    .order('display_name');

  const contacts = (client.contacts ?? []) as { email: string; name: string }[];

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title={`${client.name} — Weekly Plan`} />
        <WeeklyGanttBoard
          clientId={client.id}
          clientName={client.name}
          clientContacts={contacts}
          teamMembers={profiles || []}
        />
      </main>
    </div>
  );
}
