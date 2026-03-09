import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  getTrackerManageConfig,
  isTrackerManageEnabled,
} from '@/lib/performance-manage';
import TrackerRowsManagerContent from '@/app/performance/manage/TrackerRowsManagerContent';
import { redirect, notFound } from 'next/navigation';

interface ManageTrackerPageProps {
  params: {
    trackerType: string;
  };
}

export default async function ManageTrackerPage({ params }: ManageTrackerPageProps) {
  const trackerType = params.trackerType;

  if (!isTrackerManageEnabled(trackerType)) {
    notFound();
  }

  const config = getTrackerManageConfig(trackerType);
  if (!config) {
    notFound();
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const canManage = true;

  const { data: groupRows } = await supabase
    .from(config.tableName)
    .select(config.groupBy.field)
    .order(config.groupBy.field, { ascending: true })
    .limit(5000);

  const initialGroupValues = Array.from(
    new Set(
      (groupRows || [])
        .map((row: Record<string, string | null>) => String(row[config.groupBy.field] || '').trim())
        .filter(Boolean)
    )
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarWithBoards />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title={`Manage ${config.label}`} backHref="/performance" />
        <TrackerRowsManagerContent
          config={config}
          initialGroupValues={initialGroupValues}
          canManage={canManage}
        />
      </main>
    </div>
  );
}
