import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import UserManagement from '@/components/settings/UserManagement';
import { hasFeatureAccess } from '@/lib/feature-access';

export default async function UsersSettingsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const canAccess = await hasFeatureAccess(supabase, user.id, 'user_management');
  if (!canAccess) {
    redirect('/settings');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="User Management" backHref="/settings" />
        <UserManagement currentUserId={user.id} />
      </main>
    </div>
  );
}
