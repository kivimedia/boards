import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import TrackerDetailContent from './TrackerDetailContent';
import { PK_TRACKER_LABELS, PKTrackerType } from '@/lib/types';

const VALID_TYPES = new Set<string>([
  'fathom_videos', 'client_updates', 'ticket_updates', 'daily_goals',
  'sanity_checks', 'sanity_tests', 'pics_monitoring', 'flagged_tickets',
  'weekly_tickets', 'pingdom_tests', 'google_ads_reports', 'monthly_summaries',
  'update_schedule', 'holiday_tracking', 'website_status', 'google_analytics_status',
  'other_activities',
]);

interface PageProps {
  params: Promise<{ trackerType: string }>;
}

export default async function TrackerDetailPage({ params }: PageProps) {
  const { trackerType } = await params;

  if (!VALID_TYPES.has(trackerType)) {
    notFound();
  }

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const label = PK_TRACKER_LABELS[trackerType as PKTrackerType] || trackerType;

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title={label} />
        <TrackerDetailContent
          trackerType={trackerType as PKTrackerType}
          label={label}
        />
      </main>
    </div>
  );
}
