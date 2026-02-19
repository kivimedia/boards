import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import ClientBrainSettings from '@/components/client/ClientBrainSettings';

interface Params {
  params: { clientId: string };
}

export default async function ClientBrainPage({ params }: Params) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { clientId } = params;

  // Verify client exists and user has access
  const { data: client } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .single();

  if (!client) {
    redirect('/settings');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title={`${client.name} — Client Brain`} backHref="/settings" />
        <div className="flex-1 overflow-y-auto">
          <ClientBrainSettings clientId={clientId} clientName={client.name} />
        </div>
      </main>
    </div>
  );
}
