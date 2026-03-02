import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import WeeklyGanttBoard from '@/components/weekly-gantt/WeeklyGanttBoard';
import type { ClientTeamMember } from '@/lib/types';

interface PageProps {
  params: { clientId: string };
}

export default async function ClientWeeklyGanttPage({ params }: PageProps) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, company, contacts')
    .eq('id', params.clientId)
    .single();

  if (!client) notFound();

  // Client contacts serve as the assignee list (not agency team members)
  const contacts = (client.contacts ?? []) as { name: string; email?: string; phone?: string; role?: string }[];

  // Fetch team members assigned to this client
  const { data: teamRows } = await supabase
    .from('client_team_members')
    .select('id, client_id, user_id, role, created_at, profile:profiles!client_team_members_user_id_fkey(id, display_name, avatar_url, agency_role)')
    .eq('client_id', params.clientId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teamMembers: ClientTeamMember[] = (teamRows ?? []).map((r: any) => ({
    id: r.id,
    client_id: r.client_id,
    user_id: r.user_id,
    role: r.role,
    created_at: r.created_at,
    profile: r.profile ?? undefined,
  }));

  const clientObj = client as Record<string, unknown>;
  const displayName = (clientObj.company as string) || client.name;

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title={`${displayName} - Weekly Plan`} />
        <WeeklyGanttBoard
          clientId={client.id}
          clientName={client.name}
          clientCompany={(clientObj.company as string | null)}
          clientContacts={contacts}
          teamMembers={teamMembers}
        />
      </main>
    </div>
  );
}
