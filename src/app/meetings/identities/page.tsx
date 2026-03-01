import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import IdentityManager from '@/components/meetings/IdentityManager';

export default async function IdentitiesPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Participant Identities" />
        <div className="flex-1 overflow-y-auto">
          <IdentityManager />
        </div>
      </main>
    </div>
  );
}
