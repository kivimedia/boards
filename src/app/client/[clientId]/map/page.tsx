import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import MapBoardView from '@/components/map/MapBoardView';

interface MapPageProps {
  params: { clientId: string };
}

export default async function ClientMapPage({ params }: MapPageProps) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', params.clientId)
    .single();

  if (!client) {
    notFound();
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title={`${client.name} — Strategy Map`} />
        <MapBoardView clientId={client.id} />
      </main>
    </div>
  );
}
