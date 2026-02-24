import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import PermissionDelegation from '@/components/settings/PermissionDelegation';
import { isTrueAdmin } from '@/lib/feature-access';

export default async function PermissionsSettingsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const admin = await isTrueAdmin(supabase, user.id);
  if (!admin) {
    redirect('/settings');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Permission Delegation" backHref="/settings" />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <PermissionDelegation currentUserId={user.id} />
        </div>
      </main>
    </div>
  );
}
