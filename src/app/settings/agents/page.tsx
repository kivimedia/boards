import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import SkillQualityDashboard from '@/components/agents/SkillQualityDashboard';
import { hasFeatureAccess } from '@/lib/feature-access';

export default async function AgentSkillsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const canAccess = await hasFeatureAccess(supabase, user.id, 'agent_skills');
  if (!canAccess) {
    redirect('/settings');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Agent Skills" backHref="/settings" />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <SkillQualityDashboard />
        </div>
      </main>
    </div>
  );
}
