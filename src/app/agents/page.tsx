import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import AgentsDashboard from '@/components/agents/AgentsDashboard';

export default async function AgentsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Agents" />
        <div className="flex-1 overflow-y-auto">
          <AgentsDashboard />
        </div>
      </main>
    </div>
  );
}
