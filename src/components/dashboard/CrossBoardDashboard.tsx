'use client';

import { useCallback, useEffect, useState } from 'react';
import CreateBoardModal from '@/components/board/CreateBoardModal';
import Button from '@/components/ui/Button';
import RedFlagsBanner from '@/components/dashboard/RedFlagsBanner';
import TodaysAgenda from '@/components/dashboard/TodaysAgenda';
import StuckCards from '@/components/dashboard/StuckCards';
import TeamThroughput from '@/components/dashboard/TeamThroughput';
import BoardSummaryGrid from '@/components/dashboard/BoardSummaryGrid';
import type { ExecutiveDashboardResponse } from '@/lib/types';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default function CrossBoardDashboard() {
  const [data, setData] = useState<ExecutiveDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [stuckDays, setStuckDays] = useState(5);

  // Listen for global event from CreateMenu (top-bar "New Board" shortcut)
  useEffect(() => {
    const handler = () => setShowCreateModal(true);
    window.addEventListener('open-create-board-modal', handler);
    return () => window.removeEventListener('open-create-board-modal', handler);
  }, []);

  const fetchData = useCallback(async (days: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard-executive?stuck_days=${days}`);
      if (!res.ok) throw new Error('Failed to fetch dashboard data');
      const { data: responseData } = await res.json();
      setData(responseData ?? null);
    } catch (err) {
      console.error('Dashboard fetch failed:', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(stuckDays);
  }, [fetchData, stuckDays]);

  const handleThresholdChange = (days: number) => {
    setStuckDays(days);
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto bg-cream dark:bg-navy p-4 sm:p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 overflow-y-auto bg-cream dark:bg-navy p-4 sm:p-6">
        <div className="max-w-6xl mx-auto text-center py-16">
          <p className="text-sm text-navy/40 dark:text-slate-500 font-body">
            Failed to load dashboard data.
          </p>
        </div>
      </div>
    );
  }

  const hasRedFlags =
    data.redFlags.overdueCards +
    data.redFlags.failedUpdates +
    data.redFlags.pendingApprovalUpdates +
    data.redFlags.flaggedTickets > 0;

  return (
    <div className="flex-1 overflow-y-auto bg-cream p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-navy dark:text-slate-100 font-heading">
              {getGreeting()}, {data.userName}
            </h1>
            <p className="text-navy/50 dark:text-slate-400 text-xs font-body mt-0.5">
              {formatDate()} - Here is what needs your attention.
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            + New Board
          </Button>
        </div>

        {/* Red flags banner */}
        {hasRedFlags && <RedFlagsBanner flags={data.redFlags} />}

        {/* Two-column: Agenda + Stuck cards */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2">
            <TodaysAgenda meetings={data.upcomingMeetings} />
          </div>
          <div className="lg:col-span-3">
            <StuckCards
              cards={data.stuckCards}
              daysThreshold={stuckDays}
              onThresholdChange={handleThresholdChange}
            />
          </div>
        </div>

        {/* Team throughput */}
        <TeamThroughput throughput={data.throughput} />

        {/* Board summary grid */}
        <BoardSummaryGrid summaries={data.boardSummaries} />
      </div>

      <CreateBoardModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
}
