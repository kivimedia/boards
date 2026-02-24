'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Board {
  id: string;
  name: string;
  board_type: string;
  created_at: string;
}

interface DashboardStats {
  openLeads: number;
  pendingProposals: number;
  eventsThisWeek: number;
  followUpsDue: number;
  venueCount: number;
  revenueThisMonth: number;
}

const BOARD_TYPE_ICONS: Record<string, string> = {
  boutique_decor: '🎈',
  marquee_letters: '💡',
  private_clients: '🎉',
  owner_dashboard: '👑',
  va_workspace: '📋',
  general_tasks: '✅',
};

const BOARD_TYPE_COLORS: Record<string, string> = {
  boutique_decor: 'bg-pink-500',
  marquee_letters: 'bg-amber-500',
  private_clients: 'bg-purple-500',
  owner_dashboard: 'bg-red-500',
  va_workspace: 'bg-green-500',
  general_tasks: 'bg-indigo-500',
};

export default function HomeDashboard({ initialBoards }: { initialBoards: Board[] }) {
  const [stats, setStats] = useState<DashboardStats>({
    openLeads: 0,
    pendingProposals: 0,
    eventsThisWeek: 0,
    followUpsDue: 0,
    venueCount: 0,
    revenueThisMonth: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/stats');
      const json = await res.json();
      if (json.ok) setStats(json.data);
    } catch {
      // Stats are best-effort
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const boards = initialBoards || [];

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Carolina Balloons HQ
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Your business at a glance
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Open Leads"
          value={stats.openLeads}
          loading={loading}
          href="/boards"
          color="text-pink-600 dark:text-pink-400"
        />
        <StatCard
          label="Pending Proposals"
          value={stats.pendingProposals}
          loading={loading}
          href="/proposals"
          color="text-amber-600 dark:text-amber-400"
        />
        <StatCard
          label="Events This Week"
          value={stats.eventsThisWeek}
          loading={loading}
          color="text-purple-600 dark:text-purple-400"
        />
        <StatCard
          label="Follow-Ups Due"
          value={stats.followUpsDue}
          loading={loading}
          color="text-red-600 dark:text-red-400"
        />
        <StatCard
          label="Venues"
          value={stats.venueCount}
          loading={loading}
          href="/venues"
          color="text-blue-600 dark:text-blue-400"
        />
        <StatCard
          label="Revenue (Month)"
          value={stats.revenueThisMonth}
          loading={loading}
          isCurrency
          color="text-green-600 dark:text-green-400"
        />
      </div>

      {/* Board Quick Access */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Your Boards
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {boards.map((board) => (
            <Link
              key={board.id}
              href={`/boards/${board.id}`}
              className="group flex items-center gap-3 p-4 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:border-pink-300 dark:hover:border-pink-600 transition-colors"
            >
              <div className={`w-10 h-10 rounded-lg ${BOARD_TYPE_COLORS[board.board_type] || 'bg-gray-400'} flex items-center justify-center text-lg`}>
                {BOARD_TYPE_ICONS[board.board_type] || '📌'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">
                  {board.name}
                </div>
                <div className="text-xs text-gray-400 capitalize">
                  {board.board_type?.replace(/_/g, ' ') || 'board'}
                </div>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300 group-hover:text-pink-400 transition-colors shrink-0">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          ))}
          {boards.length === 0 && (
            <div className="col-span-full text-center py-8 text-gray-400 text-sm">
              No boards yet. Create your first board from the sidebar.
            </div>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Quick Links
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickLink href="/proposals" icon="📝" label="Proposal Queue" />
          <QuickLink href="/venues" icon="🏛️" label="Venue Database" />
          <QuickLink href="/analytics/didnt-book" icon="📊" label="Didn't Book Analytics" />
          <QuickLink href="/products" icon="🎈" label="Product Catalog" />
          <QuickLink href="/pricing" icon="💰" label="Pricing Rules" />
          <QuickLink href="/settings" icon="⚙️" label="Settings" />
          <QuickLink href="/settings/proposal-learning" icon="🤖" label="AI Learning" />
          <QuickLink href="/settings/migration" icon="📦" label="Trello Migration" />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
  href,
  color,
  isCurrency,
}: {
  label: string;
  value: number;
  loading: boolean;
  href?: string;
  color?: string;
  isCurrency?: boolean;
}) {
  const content = (
    <div className="border rounded-lg p-4 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:border-pink-300 dark:hover:border-pink-600 transition-colors">
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      {loading ? (
        <div className="h-8 w-16 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
      ) : (
        <div className={`text-2xl font-bold ${color || 'text-gray-900 dark:text-gray-100'}`}>
          {isCurrency ? `$${value.toLocaleString()}` : value}
        </div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

function QuickLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:border-pink-300 dark:hover:border-pink-600 text-sm text-gray-700 dark:text-gray-300 hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
    >
      <span>{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}
