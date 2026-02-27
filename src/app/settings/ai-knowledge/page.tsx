import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import AIKnowledgeStatus from '@/components/settings/AIKnowledgeStatus';
import { hasFeatureAccess } from '@/lib/feature-access';

export default async function AIKnowledgePage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const canAccess = await hasFeatureAccess(supabase, user.id, 'ai_config');
  if (!canAccess) {
    redirect('/settings');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="AI Knowledge" backHref="/settings" />
        <div className="flex-1 overflow-y-auto bg-cream dark:bg-dark-bg p-4 sm:p-6">
          <AIKnowledgeStatus />
        </div>
      </main>
    </div>
  );
}
