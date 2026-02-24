import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import CostDashboard from '@/components/podcast/CostDashboard';
import Link from 'next/link';

export default async function PodcastCostsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Scout Pipeline Costs" />
        <div className="flex-1 overflow-auto p-6 bg-cream dark:bg-slate-900">
          {/* Navigation */}
          <div className="flex items-center gap-4 mb-5">
            <Link
              href="/podcast/dashboard"
              className="text-sm font-medium text-navy/50 dark:text-slate-400 hover:text-electric dark:hover:text-electric transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/podcast/approval"
              className="text-sm font-medium text-navy/50 dark:text-slate-400 hover:text-electric dark:hover:text-electric transition-colors"
            >
              Guest Approval
            </Link>
            <Link
              href="/podcast/outreach"
              className="text-sm font-medium text-navy/50 dark:text-slate-400 hover:text-electric dark:hover:text-electric transition-colors"
            >
              Outreach
            </Link>
            <span className="text-navy/20 dark:text-slate-600">/</span>
            <span className="text-sm font-semibold text-navy dark:text-slate-100">
              Costs
            </span>
          </div>

          <CostDashboard className="max-w-2xl" />
        </div>
      </main>
    </div>
  );
}
